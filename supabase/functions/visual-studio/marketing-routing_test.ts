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
    assertEquals(integ.model, MARKETING_FIDELITY_MODEL);
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
