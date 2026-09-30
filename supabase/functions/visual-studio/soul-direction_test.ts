import { assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { selectSoulStyles, resolveSoulStyle, normalizeSoulStyles, SOUL2_STYLES, soulStyles } from "./soul-direction.ts";
import { imageInput, SOUL2_MODEL } from "./higgsfield-image.ts";
const style = SOUL2_STYLES[0];
Deno.test("Soul selection uses provider IDs and refuses unknown selections; no preset remains valid", () => {
  const styles = selectSoulStyles([style, { ...style, id: "cartoon", name: "Cartoon" }, { name: "Warm Ambient", id: null }]);
  assertEquals(styles.length, 1);
  assertEquals(styles[0].id, style.id);
  assertEquals(styles[0].name, style.name);
  assertEquals(styles[0].description_fr, "Rendu photographique équilibré, sans effet de style marqué.");
  assertEquals(resolveSoulStyle("none", styles), undefined);
  assertEquals(resolveSoulStyle(undefined, styles), undefined);
  assertEquals(resolveSoulStyle(style.id, styles), styles[0]);
  assertThrows(() => resolveSoulStyle("invented", styles));
});
Deno.test("Soul receives exactly Claude's photographic prompt and the chosen preset, never the generic editing brief", () => {
  const p = { operation: "create", visual_kind: "photo" as const, model: SOUL2_MODEL,
    image_prompt: "A ceramicist holding a plain temporary plate, direct daylight, full workshop in focus.",
    summary: "Je prépare une scène", preserve: ["Old generic warm bokeh instruction"], soul_style: style };
  const input = imageInput(p, []);
  assertEquals(input.prompt, p.image_prompt);
  assertEquals("style_id" in input && input.style_id, style.id);
  assertEquals(input.enhance_prompt, false);
  assertEquals("style_id" in imageInput({ ...p, soul_style: undefined }, []), false);
  assertThrows(() => imageInput({ ...p, image_prompt: "" }, []));
});

Deno.test("Soul 2 catalogue retains the version-specific IDs and previews, never legacy IDs sharing a name", async () => {
  const legacy = { ...style, id: "464ea177-8d40-4940-8d9d-b438bab269c7" };
  const catalogue = await soulStyles();
  const selected = selectSoulStyles([legacy, ...catalogue, { ...style, id: "other", name: "Cartoon" }]);
  assertEquals(selected.map(s => s.name), ["General", "Nature light", "Warm ambient", "Editorial street style", "Subtle flash", "Theatrical light"]);
  assertEquals(selected[0].id, "3db34ab5-3439-4317-9e03-08dc30852e69");
  assertEquals(selected.every(s => s.preview_url?.startsWith("https://cdn.higgsfield.ai/soul-v2-style/")), true);
  assertEquals(selectSoulStyles([legacy]), []);
  assertThrows(() => resolveSoulStyle(legacy.id, catalogue), Error, "studio_soul_style_unavailable");
  assertThrows(() => imageInput({ operation: "create", visual_kind: "photo", model: SOUL2_MODEL, image_prompt: "Documentary photo", soul_style: legacy }, []), Error, "studio_soul_style_unavailable");
  assertEquals(normalizeSoulStyles([{ ...style, preview_url: "https://nothiggsfield.ai/style.jpg" }])[0].preview_url, undefined);
});
