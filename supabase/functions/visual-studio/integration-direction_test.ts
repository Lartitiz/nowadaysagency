import { assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { prepareIntegration } from "./integration-direction.ts";
import { generateImage, type Proposal } from "./media.ts";
const p: Proposal = { operation: "edit", input_path: "scene", references: [
  { id: "product", path: "plate", role: "product", photo_id: null, name: "Assiette" },
  { id: "person", path: "portrait", role: "person", photo_id: null, name: "Personne" },
], scene_workflow: { phase: "integration", camera_match: "Face", targets: [
  { role: "product", reference_ids: ["product"], location: "Dans les mains", instruction: "Remplacer le produit provisoire" },
  { role: "person", reference_ids: ["person"], location: "Au centre", instruction: "Remplacer la femme provisoire" },
] } };
Deno.test("Claude observes actual scene and every original with matching provider numbers before integration", async () => {
  const saved = globalThis.fetch, key = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test");
  const read: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String((init as { body?: unknown } | undefined)?.body));
    assertEquals(body.model.startsWith("claude-sonnet"), true);
    const c = body.messages[0].content;
    assertEquals(c[1].pixels, "scene"); assertEquals(c[3].pixels, "plate"); assertEquals(c[5].pixels, "portrait");
    assertEquals(c[4].text.includes("Image 3 : original ID person"), true);
    return Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "prepare_integration", input: {
      image_prompt: "Replace the provisional woman in Image 1 with the exact person in Image 3, and the plate with Image 2. Preserve the scene.",
      targets: p.scene_workflow!.targets, blocked_reason: "",
    } }] });
  };
  try {
    const result = await prepareIntegration(p, async path => { read.push(path); return { pixels: path }; });
    assertEquals(read, ["scene", "plate", "portrait"]);
    assertEquals(result.input_path, p.input_path); assertEquals(result.references, p.references);
    assertEquals(result.image_prompt!.includes("exact person in Image 3"), true);
  } finally { globalThis.fetch = saved; key === undefined ? Deno.env.delete("ANTHROPIC_API_KEY") : Deno.env.set("ANTHROPIC_API_KEY", key); }
});
Deno.test("missing bytes fail before any provider call; a plate alone cannot count as a complete integration", async () => {
  const saved = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  try {
    await assertRejects(() => generateImage(p, [new Blob(["scene"]), new Blob(["plate"])]), Error, "studio_integration_sources");
    await assertRejects(() => prepareIntegration(p, async path => { if (path === "portrait") throw new Error("missing original"); return { pixels: path }; }), Error, "missing original");
    assertEquals(calls, 0);
  } finally { globalThis.fetch = saved; }
});
Deno.test("Claude cannot silently drop, regroup or substitute an original target", async () => {
  const saved = globalThis.fetch, key = Deno.env.get("ANTHROPIC_API_KEY"); Deno.env.set("ANTHROPIC_API_KEY", "test");
  globalThis.fetch = async () => Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "prepare_integration", input: {
    image_prompt: "Replace only the plate in the supplied scene photograph.", targets: [p.scene_workflow!.targets![0]], blocked_reason: "",
  } }] });
  try { await assertRejects(() => prepareIntegration(p, async () => ({ pixels: "image" })), Error, "studio_integration_sources"); }
  finally { globalThis.fetch = saved; key === undefined ? Deno.env.delete("ANTHROPIC_API_KEY") : Deno.env.set("ANTHROPIC_API_KEY", key); }
});

// 03/10/2026, live test: an empty reason written as two quotes blocked the integration.
Deno.test("an empty blocked reason written as quotes or « aucun » does not block", async () => {
  const saved = globalThis.fetch, key = Deno.env.get("ANTHROPIC_API_KEY"); Deno.env.set("ANTHROPIC_API_KEY", "test");
  for (const reason of ['""', "« »", "aucun", "Aucun."]) {
    globalThis.fetch = async () => Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "prepare_integration", input: {
      image_prompt: "Add the exact person of Image 3 at the bench and the exact plate of Image 2. Preserve the scene.", targets: p.scene_workflow!.targets, blocked_reason: reason,
    } }] });
    try { assertEquals((await prepareIntegration(p, async () => ({ pixels: "image" }))).image_prompt!.startsWith("Add the exact person"), true); }
    finally { globalThis.fetch = saved; }
  }
  globalThis.fetch = async () => Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "prepare_integration", input: {
    image_prompt: "Add the exact person of Image 3 at the bench and the exact plate of Image 2. Preserve the scene.", targets: p.scene_workflow!.targets, blocked_reason: "Le portrait est flou.",
  } }] });
  try { await assertRejects(() => prepareIntegration(p, async () => ({ pixels: "image" })), Error, "Intégration à préciser : Le portrait est flou"); }
  finally { globalThis.fetch = saved; key === undefined ? Deno.env.delete("ANTHROPIC_API_KEY") : Deno.env.set("ANTHROPIC_API_KEY", key); }
});

Deno.test("an empty decor keeps no « provisoire » wording in the prepared changes", async () => {
  const saved = globalThis.fetch, key = Deno.env.get("ANTHROPIC_API_KEY"); Deno.env.set("ANTHROPIC_API_KEY", "test");
  const empty = { ...p, scene_workflow: { ...p.scene_workflow!, empty_scene: true } };
  globalThis.fetch = async () => Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "prepare_integration", input: {
    image_prompt: "Add the exact person of Image 3 at the bench and the exact plate of Image 2. Preserve the scene.", blocked_reason: "",
    targets: [{ ...p.scene_workflow!.targets![0], instruction: "Remplacer le produit provisoire par l'assiette exacte." },
      { ...p.scene_workflow!.targets![1], location: "À la place de la personne provisoire", instruction: "Remplacer la femme provisoire par la personne exacte, même pose." }],
  } }] });
  try {
    const result = await prepareIntegration(empty, async () => ({ pixels: "image" }));
    assertEquals(JSON.stringify([result.change, result.scene_workflow!.targets]).includes("provisoire"), false);
    assertEquals(result.change![0].includes("Ajouter l'assiette exacte"), true);
  } finally { globalThis.fetch = saved; key === undefined ? Deno.env.delete("ANTHROPIC_API_KEY") : Deno.env.set("ANTHROPIC_API_KEY", key); }
});
