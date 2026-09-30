import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { integrationProposal, referenceSignature } from "./integration-proposal.ts";
import { generateImage, imagePrompt, type Reference } from "./media.ts";
import { validTargets } from "./scene-workflow.ts";
const person: Reference = { id: "person", photo_id: null, name: "Personne A", path: "original-person", role: "person" };
const product: Reference = { id: "product", photo_id: null, name: "Assiette", path: "original-product", role: "product" };
const targets = [
  { role: "person" as const, reference_ids: [person.id], location: "Personne à droite", instruction: "Remplacer son identité avec l'original, conserver la pose." },
  { role: "product" as const, reference_ids: [product.id], location: "Objet tenu entre les mains", instruction: "Remplacer seulement l'objet provisoire." },
];
const scene = () => ({ id: "scene-id", status: "ready", result_path: "approved-scene", proposal: {
  operation: "create", summary: "Pose validée sans fleurs", format: "portrait", planning_references: [person, product],
  scene_reference_signature: referenceSignature([person, product]),
  scene_workflow: { phase: "scene" as const, camera_match: "À hauteur du visage", targets, accepted_changes: ["Sans fleurs"] },
} });
Deno.test("integration preview binds exact scene and sorted originals with matching prompt numbers", async () => {
  const p = (await integrationProposal(scene()))!;
  assertEquals(p.input_path, "approved-scene");
  assertEquals(p.references.map(r => r.path), ["original-product", "original-person"]);
  const prompt = imagePrompt(p);
  assertEquals(prompt.includes("Image 1 is the exact base image"), true);
  assertEquals(prompt.includes("Image 2: product reference, Assiette"), true);
  assertEquals(prompt.includes("Personne à droite: Remplacer la personne provisoire par la personne exacte"), true);
  assertEquals(prompt.includes("Sources: Image 3"), true);
  assertEquals(prompt.includes("Sans fleurs"), true);
  assertEquals(prompt.includes("do not freeze incompatible provisional features"), true);
  assertEquals(prompt.includes("add blur, grain or props"), true);
});
Deno.test("preview is stable after reload and invalidated by changes in scene, targets, originals or current references", async () => {
  const p = (await integrationProposal(scene()))!;
  assertEquals((await integrationProposal(scene()))!.id, p.id);
  for (const update of ["scene", "target", "reference"]) {
    const v = scene();
    if (update === "scene") v.result_path = "another-scene";
    if (update === "target") v.proposal.scene_workflow.targets = [{ ...targets[0], location: "À gauche" }, targets[1]];
    if (update === "reference") v.proposal.planning_references = [{ ...person, path: "new-original" }, product];
    assertEquals((await integrationProposal(v))!.id === p.id, false);
  }
  assertEquals(await integrationProposal(scene(), [person]), null);
  assertEquals(await integrationProposal({ ...scene(), status: "processing" }), null);
});
Deno.test("identity-only integration is supported and every original must have an explicit subject mapping", async () => {
  const v = scene(); v.proposal.planning_references = [person]; v.proposal.scene_workflow.targets = [targets[0]];
  const p = (await integrationProposal(v))!;
  assertEquals(p.references.map(r => r.role), ["person"]);
  assertEquals(p.operation, "edit");
  v.proposal.scene_workflow.targets = [];
  assertEquals(await integrationProposal(v), null);
});
Deno.test("several views belong to one identity while independent people keep their own mapping", () => {
  const profile = { ...person, id: "profile", path: "profile-original" };
  const second = { ...person, id: "person-b", path: "other-person", name: "Personne B" };
  const grouped = [{ ...targets[0], reference_ids: [person.id, profile.id] }, { ...targets[0], location: "À gauche", reference_ids: [second.id] }];
  assertEquals(validTargets(grouped, [person, profile, second]), true);
  assertEquals(validTargets([grouped[0]], [person, profile, second]), false);
  assertEquals(validTargets([...grouped, grouped[0]], [person, profile, second]), false);
  assertEquals(validTargets([{ ...grouped[0], reference_ids: ["invented"] }], [person]), false);
});
Deno.test("actual multipart payload transports base first and unmodified original bytes", async () => {
  const saved = globalThis.fetch;
  const p = (await integrationProposal(scene()))!;
  let bytes: string[] = [];
  globalThis.fetch = async (url, init) => {
    assertEquals(String(url), "https://api.openai.com/v1/images/edits");
    const form = (init as RequestInit).body as FormData;
    bytes = await Promise.all(form.getAll("image[]").map(part => (part as Blob).text()));
    assertEquals(String(form.get("prompt")).includes("Sources: Image 3"), true);
    return new Response(JSON.stringify({ data: [{ b64_json: btoa("output") }] }));
  };
  try { await generateImage(p, [p.input_path, ...p.references.map(r => r.path)].map(path => new Blob([path], { type: "image/png" })));
    assertEquals(bytes, ["approved-scene", "original-product", "original-person"]);
  } finally { globalThis.fetch = saved; }
});
Deno.test("follow-up edits distinguish current base, original scene anchor and cumulative corrections", async () => {
  const p = (await integrationProposal(scene()))!;
  const prompt = imagePrompt({ ...p, input_path: "integrated-result", change: ["Réduire seulement l'ombre"],
    scene_workflow: { ...p.scene_workflow, approved_scene_id: "scene-id", accepted_changes: ["Sans fleurs", "Assiette tournée légèrement"] } });
  assertEquals(prompt.includes("Image 4 is the approved original scene"), true);
  assertEquals(prompt.includes("SUBJECT ANCHORS ALREADY INTEGRATED"), true);
  assertEquals(prompt.includes("Assiette tournée légèrement"), true);
  assertEquals(prompt.includes("Changes: Réduire seulement l'ombre"), true);
});

Deno.test("aliases of the same file retain every target ID and exact payload numbering", async () => {
  const v = scene(); const alias = { ...person, id: "alias" };
  v.proposal.planning_references.push(alias);
  v.proposal.scene_workflow.targets = [{ ...targets[0], reference_ids: [person.id, alias.id] }, targets[1]];
  const p = (await integrationProposal(v))!;
  assertEquals(p.references.map(r => r.id), [product.id, person.id, alias.id]);
  assertEquals(imagePrompt(p).includes("Sources: Image 3, Image 4"), true);
  assertEquals(imagePrompt(p).includes("missing original"), false);
});
