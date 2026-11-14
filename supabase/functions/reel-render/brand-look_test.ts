import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { brandFontLinks, brandLookFromCharter, cleanFont, DEFAULT_BRAND, readableAccent } from "./brand-look.ts";
import { buildReelComposition } from "./hyperframes.ts";
import { hexLuminance } from "../_shared/contrast-guard.ts";

const input = { voice_mode: "silent" as const, sections: [{ clip_url: "https://v.test/a.mp4", duration: 4, overlay_text: "Mon reel à moi" }] };
const ratio = (hex: string) => (hexLuminance(hex.slice(1)) + 0.05) / (hexLuminance("3a3530") + 0.05);

Deno.test("charte vide ou illisible : rendu d'avant, à l'identique", () => {
  assertEquals(brandLookFromCharter(null), DEFAULT_BRAND);
  assertEquals(brandLookFromCharter({ color_accent: "rose", font_title: "<script>", font_body: 12 }), DEFAULT_BRAND);
  assertEquals(buildReelComposition(input, { brand: brandLookFromCharter({}) }).html, buildReelComposition(input).html);
});

Deno.test("couleur de la charte sur le mot clé, éclaircie si trop sombre sur le dégradé", () => {
  for (const raw of ["#91014b", "#000000", "#1a1a1a", "#03f", "FB3D80", "#ffe561"]) {
    const out = readableAccent(raw);
    assert(/^#[0-9a-f]{6}$/.test(out), out);
    assert(ratio(out) >= 3, `${raw} → ${out} contraste ${ratio(out).toFixed(2)}`);
  }
  assertEquals(readableAccent("#ffe561"), "#ffe561", "une couleur déjà lisible ne bouge pas");
  assertEquals(readableAccent("#FB3D80"), "#fb3d80", "le rose framboise reste tel quel");
  const html = buildReelComposition(input, { brand: brandLookFromCharter({ color_accent: "#ffe561" }) }).html;
  assertStringIncludes(html, "color: #ffe561;");
});

Deno.test("polices de la charte : une feuille par police, repli sur la police par défaut", () => {
  assertEquals(cleanFont("'Libre Baskerville', serif"), "Libre Baskerville");
  assertEquals(cleanFont("Font\"); }"), null);
  const brand = brandLookFromCharter({ font_title: "Libre Baskerville", font_body: "IBM Plex Sans" });
  const links = brandFontLinks(brand);
  assertStringIncludes(links, "family=Libre+Baskerville");
  assertStringIncludes(links, "family=IBM+Plex+Sans");
  const html = buildReelComposition(input, { brand }).html;
  assertStringIncludes(html, 'font-family: "IBM Plex Sans", "Montserrat", sans-serif;');
  assertStringIncludes(html, 'font-family: "Libre Baskerville", "Playfair Display", serif; font-style: normal;');
  assertStringIncludes(html, "family=Montserrat:wght@700&family=Playfair+Display", "les polices par défaut restent chargées à part");
});

Deno.test("charte reçue de l'écran revalidée côté edge", () => {
  const html = buildReelComposition(input, { brand: { accent: "#000000", keyFont: "x\"><script>", textFont: null } }).html;
  assert(!html.includes("<script>alert"));
  assert(!html.includes('x"><script>'));
  assert(!html.includes("color: #000000;"));
});
