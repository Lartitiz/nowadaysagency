import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractVisualInfo } from "./scraping.ts";
import { validateSitePalette } from "./validate-site-palette.ts";

Deno.test("une variable HSL du site fournit une couleur vérifiable", () => {
  const hints = extractVisualInfo("<style>:root { --primary: 240 100% 50%; }</style>");
  assertStringIncludes(hints, "CSS variable: --primary: 240 100% 50% (équivalent hex calculé: #0000ff)");
  const charter = validateSitePalette({ confidence: "high", color_primary: "#0000ff" }, hints);
  assertStringIncludes(JSON.stringify(charter), '"confidence":"high"');
});
