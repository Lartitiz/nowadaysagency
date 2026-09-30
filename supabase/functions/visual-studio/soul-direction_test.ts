import { assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { selectSoulStyles, resolveSoulStyle, normalizeSoulStyles } from "./soul-direction.ts";
import { imageInput, SOUL2_MODEL } from "./higgsfield-image.ts";
const style = { id: "real-provider-id", name: "General", description: "Direct flash and camera rendering", preview_url: "https://cdn.higgsfield.ai/style.webp" };
Deno.test("Soul selection uses provider IDs and refuses unknown selections; no preset remains valid", () => {
  const styles = selectSoulStyles([style, { ...style, id: "cartoon", name: "Cartoon" }, { name: "Warm Ambient", id: null }]);
  assertEquals(styles.length, 1);
  assertEquals(styles[0].id, style.id);
  assertEquals(styles[0].name, style.name);
  assertEquals(styles[0].description_fr, "Lumière douce, couleurs fidèles et rendu équilibré.");
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

Deno.test("curated catalogue preserves provider data, exact names and previews without unrelated effects", () => {
  const names = ["Spotlight", "General", "iPhone", "Gallery", "90's Editorial", "Tokyo Streetstyle", "DigitalCam", "Creatures"];
  const catalogue = names.map((name, i) => ({ ...style, id: `provider-${i}`, name }));
  const selected = selectSoulStyles(catalogue);
  assertEquals(selected.map(s => s.name), ["General", "iPhone", "Gallery", "90's Editorial", "Tokyo Streetstyle", "Spotlight"]);
  for (const s of selected) {
    assertEquals(catalogue.find(c => c.id === s.id)?.description, s.description);
    assertEquals(s.preview_url, style.preview_url);
  }
  assertEquals(normalizeSoulStyles([{ ...style, preview_url: "https://nothiggsfield.ai/style.jpg" }])[0].preview_url, undefined);
});
