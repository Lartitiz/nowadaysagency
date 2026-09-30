import { assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { generateImage, imagePrompt, type Proposal, type Reference } from "./media.ts";
import { imageInputPaths, inheritedPhotoSource, PHOTO_PRESERVATION } from "./photo-preservation.ts";
const refs: Reference[] = [
  { id: "model", path: "model-soft-light", photo_id: null, name: "Mannequin", role: "casting" },
  { id: "product", path: "plate-original", photo_id: null, name: "Assiette", role: "product" },
];
const base: Proposal = { operation: "edit", visual_kind: "photo", input_path: "soul-hard-shadows", references: refs,
  summary: "Remplacer la personne et l'assiette, préserver la lumière de la scène.",
  scene_workflow: { phase: "integration", scene_path: "soul-hard-shadows", camera_match: "Face" } };

Deno.test("real multipart construction sends source pixels and role-specific preservation for both requested scenarios", async () => {
  const saved = globalThis.fetch;
  const cases = [base, { ...base, references: [refs[1]], summary: "Changer seulement l'assiette." },
    { ...base, input_path: "accepted-edit", photo_source_path: "soul-hard-shadows", change: ["Changer seulement l'assiette."] }];
  try {
    for (const proposal of cases) {
      const paths = imageInputPaths(proposal);
      const pixels = paths.map(path => new Blob([`original bytes: ${path}`], { type: "image/png" }));
      globalThis.fetch = async (url, init) => {
        assertEquals(String(url).endsWith("/images/edits"), true);
        const form = init!.body as FormData;
        assertEquals(await Promise.all(form.getAll("image[]").map(part => (part as Blob).text())), paths.map(path => `original bytes: ${path}`));
        const prompt = String(form.get("prompt"));
        assertEquals(prompt.includes(PHOTO_PRESERVATION), true);
        assertEquals(prompt.includes(`Image ${paths.indexOf("soul-hard-shadows") + 1} is the PRIMARY PHOTOGRAPHIC SOURCE`), true);
        assertEquals(prompt.includes("not the product photo's lighting"), true);
        assertEquals(prompt.includes("Si seul le produit change, conserve le visage"), true);
        assertEquals(prompt.includes("IDENTITY ONLY"), (proposal.references || []).some(r => r.role === "casting"));
        return Response.json({ data: [{ b64_json: btoa("output") }] });
      };
      await generateImage(proposal, pixels);
    }
  } finally { globalThis.fetch = saved; }
});

Deno.test("missing source, original anchor or product never falls back to generation", async () => {
  const saved = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  try {
    for (const proposal of [base, { ...base, input_path: "accepted-edit" },
      { operation: "edit", input_path: "source", references: [refs[1]] }]) {
      const blobs = imageInputPaths(proposal).map(p => new Blob([p]));
      await assertRejects(() => generateImage(proposal, blobs.slice(1)));
      await assertRejects(() => generateImage(proposal, [...blobs.slice(0, -1), new Blob([])]));
    }
    await assertRejects(() => generateImage({ operation: "edit", image_prompt: "Edit the described source" }, []));
    assertEquals(calls, 0);
  } finally { globalThis.fetch = saved; }
});

Deno.test("source persists across reload and edits but resets for a different branch or new creation", () => {
  const first: Proposal = { operation: "edit", input_path: "uploaded-source", references: [] };
  first.photo_source_path = inheritedPhotoSource(first);
  const parent = { result_path: "first-result", proposal: JSON.parse(JSON.stringify(first)) };
  const next = { ...first, input_path: parent.result_path };
  assertEquals(inheritedPhotoSource(next, parent), "uploaded-source");
  assertEquals(imageInputPaths(next), ["first-result", "uploaded-source"]);
  assertEquals(inheritedPhotoSource({ ...next, input_path: "other-source" }, parent), "other-source");
  assertEquals(inheritedPhotoSource({ operation: "create", references: [] }, parent), undefined);
  assertEquals(inheritedPhotoSource({ ...first, input_path: "legacy-integrated" }, {
    result_path: "legacy-integrated", proposal: base,
  }), "soul-hard-shadows");
});

Deno.test("source alias is not resent and numbering still matches original reference roles", () => {
  const p = { ...base, input_path: "current", references: [...refs, { ...refs[0], id: "source", path: "soul-hard-shadows", role: "scene" as const }] };
  assertEquals(imageInputPaths(p), ["current", "model-soft-light", "plate-original", "soul-hard-shadows"]);
  assertEquals(imagePrompt(p).includes("Image 4 is the PRIMARY PHOTOGRAPHIC SOURCE"), true);
});

Deno.test("explicit lighting/style change remains authoritative; defaults do not bleed into creation or graphics", () => {
  const request = "Remplacer la lumière dure par un éclairage frontal doux et passer en noir et blanc.";
  const prompt = imagePrompt({ ...base, summary: request, change: [request] });
  assertEquals(prompt.includes(`Changes: ${request}`), true);
  assertEquals(prompt.includes("Une demande explicite et confirmée de changement d'éclairage ou de style prime"), true);
  for (const p of [{ operation: "create" }, { ...base, visual_kind: "graphic" as const }, { ...base, operation: "background" }]) {
    assertEquals(imagePrompt(p).includes(PHOTO_PRESERVATION), false);
  }
});
