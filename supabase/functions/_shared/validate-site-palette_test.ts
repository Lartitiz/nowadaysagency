import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateSitePalette } from "./validate-site-palette.ts";

Deno.test("une couleur dite détectée doit exister dans les styles collectés", () => {
  const result = validateSitePalette(
    { confidence: "high", color_primary: "#AABBCC", color_secondary: "#123456", color_accent: "#abf" },
    "Couleurs détectées dans le CSS: #aabbcc (×4), #aabbcc80 (×2)\nCSS variable: --accent: #aabbcc",
  );
  assertEquals<Record<string, string | null>>(result, {
    confidence: "high",
    color_primary: "#aabbcc",
    color_secondary: null,
    color_accent: null,
  });
});

Deno.test("sans couleur CSS vérifiée, la palette ne peut pas être présentée comme détectée", () => {
  const result = validateSitePalette(
    { confidence: "high", color_primary: "#ff00aa" },
    "Typographies détectées: Lora, Inter",
  );
  assertEquals<Record<string, string | null>>(result, { confidence: "low", color_primary: null });
});

Deno.test("une palette proposée conserve sa provenance faible", () => {
  const result = validateSitePalette(
    { confidence: "low", color_primary: "#ff00aa" },
    "",
  );
  assertEquals(result, { confidence: "low", color_primary: "#ff00aa" });
});
