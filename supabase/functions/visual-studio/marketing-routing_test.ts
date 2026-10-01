import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MARKETING_FIDELITY_MODEL, routeToMarketingStudio, imageInput } from "./higgsfield-image.ts";

const withFlags = (on: boolean, fn: () => void) => {
  Deno.env.set("HIGGSFIELD_DATA_USE_REVIEWED", "true");
  on ? Deno.env.set("HIGGSFIELD_IMAGE_ENABLED", "true") : Deno.env.delete("HIGGSFIELD_IMAGE_ENABLED");
  try { fn(); } finally { Deno.env.delete("HIGGSFIELD_IMAGE_ENABLED"); }
};

Deno.test("edits and integrations route to Marketing Studio sunburst only when enabled", () => {
  const edit = { operation: "edit", provider: "default", model: "gpt-image", image_prompt: "Keep the person, change the light softly." };
  withFlags(false, () => assertEquals(routeToMarketingStudio(edit), edit));
  withFlags(true, () => {
    const routed = routeToMarketingStudio(edit);
    assertEquals([routed.provider, routed.model], ["higgsfield", MARKETING_FIDELITY_MODEL]);
    assertEquals(routed.image_prompt, edit.image_prompt);
    const integ = routeToMarketingStudio({ operation: "edit", scene_workflow: { phase: "integration" } as never });
    assertEquals((integ as { model?: string }).model, MARKETING_FIDELITY_MODEL);
  });
});

Deno.test("Soul scenes, Photoroom backgrounds and existing Higgsfield jobs are untouched", () => {
  withFlags(true, () => {
    const bg = { operation: "background", model: "photoroom-v2" };
    assertEquals(routeToMarketingStudio(bg), bg);
    const scene = { operation: "create", scene_workflow: { phase: "scene" } as never, provider: "higgsfield", model: "higgsfield-ai/soul/v2/standard" };
    assertEquals(routeToMarketingStudio(scene), scene);
    const direct = { operation: "create", provider: "default" };
    assertEquals(routeToMarketingStudio(direct), direct);
  });
});

Deno.test("Marketing Studio payload keeps ordered originals, full prompt, no enhancement", () => {
  const input = imageInput({ operation: "edit", model: MARKETING_FIDELITY_MODEL, image_prompt: "Edit the supplied base photograph.", format: "portrait" },
    ["https://a.example/1.png", "https://a.example/2.png"]) as Record<string, unknown>;
  assertEquals(input.image_urls, ["https://a.example/1.png", "https://a.example/2.png"]);
  assertEquals(input.enhance_prompt, false);
  assertEquals(input.aspect_ratio, "2:3");
});

Deno.test("Marketing prompt fits the 5000-char provider limit and keeps confirmed content", async () => {
  const { marketingPrompt, MARKETING_PROMPT_MAX } = await import("./higgsfield-image.ts");
  const shot = "SHOT-" + "y".repeat(1400);
  const summary = "BRIEF-" + "z".repeat(575);
  const p = { operation: "edit", visual_kind: "photo", format: "portrait", model: MARKETING_FIDELITY_MODEL, provider: "higgsfield",
    summary, image_prompt: shot, change: ["Ajout de l'assiette"], preserve: ["Décor complet"], exact_text: [],
    input_path: "a/b/c", references: [{ id: "f", name: "img", path: "a/b/d", role: "product" }] } as never;
  const out = marketingPrompt(p)!;
  assertEquals(out.length <= MARKETING_PROMPT_MAX, true);
  assertEquals([out.includes(shot), out.includes(summary), out.includes("Ajout de l'assiette"), out.includes("Décor complet")], [true, true, true, true]);
  const huge = { ...(p as object), image_prompt: "w".repeat(6000) } as never;
  assertEquals(marketingPrompt(huge), null);
});

Deno.test("Marketing reserve stays bounded", async () => {
  const { marketingReserveUsd } = await import("./higgsfield-image.ts");
  assertEquals(marketingReserveUsd(2), 0.35);
  assertEquals(marketingReserveUsd(100) <= 2, true);
});

Deno.test("real long edit proposal (anonymized fixture of 01/10 failure) fits without losing confirmed content", async () => {
  const { marketingPrompt, MARKETING_PROMPT_MAX } = await import("./higgsfield-image.ts");
  const { imagePrompt } = await import("./media.ts");
  const p = JSON.parse(await Deno.readTextFile(new URL("./fixtures/marketing-long-edit.json", import.meta.url)));
  assertEquals(imagePrompt(p).length > MARKETING_PROMPT_MAX, true); // the original failure
  const out = marketingPrompt(p);
  assertEquals(out !== null && out.length <= MARKETING_PROMPT_MAX, true);
  for (const kept of [p.image_prompt, p.summary, p.product_placement, ...p.preserve, ...p.change, "Image 2: product reference, ref_0001.", "PRODUCT —"]) {
    assertEquals(out!.includes(kept), true, `confirmed content kept: ${String(kept).slice(0, 40)}`);
  }
});
