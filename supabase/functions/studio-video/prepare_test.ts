import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildVideoPrompt, prepareVideo, signPreparation, verifyPreparation } from "./prepare.ts";

Deno.test("Claude receives the image roles and returns separate summary and provider prompt", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test-key");
  let sent: Record<string, unknown> | null = null;
  globalThis.fetch = async (_input, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: "prepare_video_clip", input: {
        summary: "Le produit apparaît dans le décor choisi, puis la caméra avance lentement.",
        scene: "Un seul produit dans le décor de référence. La caméra avance doucement.",
        invariants: ["Le produit conserve sa couleur et sa forme visibles."],
        allowed_changes: "La caméra avance lentement.",
        forbidden_changes: "Aucun changement du produit ou du décor.",
      },
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await prepareVideo({ idea: "Montre mon produit" }, [{
      name: "Produit", role: "product", blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    }]);
    assert(result.summary.includes("produit"));
    assert(result.scene.includes("caméra avance"));
    const prompt = buildVideoPrompt(result, 5, [{ role: "product" }]);
    assert(prompt.includes("image 1 = produit à préserver"));
    assert(prompt.includes("même objets et surfaces") || prompt.includes("mêmes objets et surfaces"));
    const content = (sent as unknown as { messages: Array<{ content: Array<Record<string, unknown>> }> }).messages[0].content;
    assertEquals(content[1].text, "Image 1 : Produit, rôle product");
    assertEquals((content[2].source as { data: string }).data, "AQID");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) Deno.env.delete("ANTHROPIC_API_KEY");
    else Deno.env.set("ANTHROPIC_API_KEY", originalKey);
  }
});

Deno.test("preparation token is bound to the user, images, settings and Claude prompt", async () => {
  const input = { workspace_id: "space", source_kind: "references", references: [
    { kind: "photo", id: "a", role: "product" }, { kind: "photo", id: "b", role: "background" },
  ], duration: 5, resolution: "480p", aspect_ratio: "9:16", prompt: "Slow camera push",
    idea: "Un bol bouge sur sa table.",
    summary: "Le bol reste sur sa table pendant tout le plan.",
    continuity: ["La table rouge reste de la même couleur."],
    allowed_changes: "Les mains se déplacent.", forbidden_changes: "La table ne change pas." };
  const token = await signPreparation(input, "user-a", "secret");
  assert(await verifyPreparation(token, input, "user-a", "secret"));
  assertEquals(await verifyPreparation(token, { ...input, prompt: "Different scene" }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, { ...input, idea: "Une autre idée." }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, { ...input, references: [...input.references].reverse() }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, { ...input, continuity: ["Une table blanche apparaît."] }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, input, "user-b", "secret"), false);
});

Deno.test("the final prompt keeps the same table across the whole shot without inventing its material", () => {
  const prompt = buildVideoPrompt({
    summary: "Un mannequin fictif prend un bol bleu sur une surface rouge, puis le repose sur cette même surface.",
    scene: "Le mannequin fictif prend le bol bleu et le repose doucement sur la même surface rouge. Caméra fixe et lumière stable.",
    invariants: ["Bol bleu brillant inchangé.", "Même surface rouge du premier au dernier photogramme ; matière non établie par l'image."],
    allowed_changes: "Les mains et le bol bougent pendant le geste.",
    forbidden_changes: "Pas de seconde table beige, de recoloration ni de coupe.",
  }, 5, [{ role: "product" }, { role: "casting" }]);
  assert(prompt.includes("Même surface rouge du premier au dernier photogramme"));
  assert(prompt.includes("matière non établie"));
  assert(prompt.includes("image 1 = produit à préserver ; image 2 = mannequin fictif"));
  assert(prompt.length <= 3000);
});
