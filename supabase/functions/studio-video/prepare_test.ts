import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { prepareVideo, signPreparation, verifyPreparation } from "./prepare.ts";

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
        prompt: "One product in the reference setting. Slow camera push. Keep the product unchanged.",
      },
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await prepareVideo({ idea: "Montre mon produit" }, [{
      name: "Produit", role: "product", blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    }]);
    assert(result.summary.includes("produit"));
    assert(result.prompt.includes("Slow camera push"));
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
  ], duration: 5, resolution: "480p", aspect_ratio: "9:16", prompt: "Slow camera push" };
  const token = await signPreparation(input, "user-a", "secret");
  assert(await verifyPreparation(token, input, "user-a", "secret"));
  assertEquals(await verifyPreparation(token, { ...input, prompt: "Different scene" }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, { ...input, references: [...input.references].reverse() }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, input, "user-b", "secret"), false);
});
