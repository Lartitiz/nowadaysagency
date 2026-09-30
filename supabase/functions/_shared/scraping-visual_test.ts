import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractVisualInfo, processScreenshots } from "./scraping.ts";
import { validateSitePalette } from "./validate-site-palette.ts";

Deno.test("une variable HSL du site fournit une couleur vérifiable", () => {
  const hints = extractVisualInfo("<style>:root { --primary: 240 100% 50%; }</style>");
  assertStringIncludes(hints, "CSS variable: --primary: 240 100% 50% (équivalent hex calculé: #0000ff)");
  const charter = validateSitePalette({ confidence: "high", color_primary: "#0000ff" }, hints);
  assertStringIncludes(JSON.stringify(charter), '"confidence":"high"');
});

Deno.test("les trois captures autorisées traversent la lecture du stockage", async () => {
  const ids = ["capture-1", "capture-2", "capture-3"];
  let queriedIds: string[] = [];
  const docs = ids.map((id) => ({ id, file_name: `${id}.png`, file_url: `user/${id}.png`, file_type: "png" }));
  const query = {
    select() { return query; },
    in(_key: string, values: string[]) { queriedIds = values; return query; },
    eq() { return Promise.resolve({ data: docs, error: null }); },
  };
  const supabase = {
    from() { return query; },
    storage: { from() { return { download: async () => ({
      data: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00])]), error: null,
    }) }; } },
  };
  const images = await processScreenshots(supabase as any, ids, "user");
  assertEquals(queriedIds, ids);
  assertEquals(images.length, 3);
  assertEquals(images.map((image) => image.mediaType), ["image/png", "image/png", "image/png"]);
});
