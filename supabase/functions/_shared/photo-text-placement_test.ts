import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { estimateTextHeight, imageSizeFromBase64, placeTextAvoidingSubject, subjectZoneOnSlide, textBand } from "./photo-text-placement.ts";

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

// Slide vue par Laetitia le 13/11/2026 : sur-titre + phrase mise en valeur posés « en haut »
// d'un portrait, sur le visage (cheveux vers 34 %, menton vers 48 % de la hauteur).
const portraitSlide = {
  kicker: "Ce raisonnement pèse surtout avec un financement bancaire et une durée longue.",
  overlay_text: "Si vous financez en fonds propres sans échéance, ou si le lot peut être conservé, l’ordre compte moins.",
};

Deno.test("placement : texte au-dessus d'un visage → il passe en bas, sur le buste", () => {
  const h = estimateTextHeight(portraitSlide, "editorial", portraitSlide.overlay_text);
  // Mesuré sur la capture : ~400 px.
  assert(h > 330 && h < 480, `hauteur estimée ${h}`);
  const zone = subjectZoneOnSlide(34, 48, { width: 1080, height: 1350 });
  const placed = placeTextAvoidingSubject(zone, h, "top_left");
  assertEquals(placed.position, "bottom_left");
  assertEquals(placed.conflict, false);
  assertEquals(placed.moved, true);
});

Deno.test("placement : la préférence est gardée quand elle ne touche pas le sujet", () => {
  const zone = subjectZoneOnSlide(55, 95, null);
  assertEquals(placeTextAvoidingSubject(zone, 300, "top_left"), { position: "top_left", overlap_px: 0, conflict: false, moved: false });
  // Sans sujet signalé : rien ne bouge.
  assertEquals(placeTextAvoidingSubject(null, 900, "center").position, "center");
});

Deno.test("placement : sujet impossible à éviter → la position qui couvre le moins, signalée", () => {
  const zone = subjectZoneOnSlide(15, 85, null);
  const placed = placeTextAvoidingSubject(zone, 500, "top_left");
  assert(placed.conflict);
  assert(placed.overlap_px > 0);
  // À couverture égale, en bas (le corps plutôt que le visage).
  assertEquals(placeTextAvoidingSubject(subjectZoneOnSlide(0, 100, null), 400, "top_left").position, "bottom_left");
});

Deno.test("placement : un texte court tient au-dessus d'un visage bas", () => {
  const h = estimateTextHeight({ overlay_text: "Trois mots seulement." }, "statement", null);
  assert(h < 250, `hauteur ${h}`);
  const placed = placeTextAvoidingSubject(subjectZoneOnSlide(35, 70, null), h, "top_left");
  assertEquals(placed.position, "top_left");
});

Deno.test("placement : zone convertie au cadrage 4:5 d'une photo 9:16", () => {
  // Photo 1080×1920 : 285 px coupés en haut et en bas de la slide.
  const zone = subjectZoneOnSlide(20, 40, { width: 1080, height: 1920 })!;
  assert(Math.abs(zone.top - (0.2 * 1920 - 285) / 1350) < 0.001);
  assert(Math.abs(zone.bottom - (0.4 * 1920 - 285) / 1350) < 0.001);
  // Valeurs inversées remises dans l'ordre, valeurs absentes ou vides ignorées.
  assertEquals(subjectZoneOnSlide(50, 30, null), subjectZoneOnSlide(30, 50, null));
  assertEquals(subjectZoneOnSlide(null, null, null), null);
  assertEquals(subjectZoneOnSlide(40, 40, null), null);
});

Deno.test("placement : bandes dans les marges de la slide", () => {
  assertEquals(textBand("top_left", 200), { top: 110, bottom: 310 });
  assertEquals(textBand("bottom_left", 200), { top: 930, bottom: 1130 });
});

Deno.test("placement : listes et chiffres comptent leur panneau", () => {
  const list = estimateTextHeight({ overlay_text: "Trois pistes", points: ["Une première piste assez longue pour deux lignes peut-être", "Deux", "Trois"] }, "list", null);
  const number = estimateTextHeight({ big_number: "40 %", overlay_text: "des ventes se font le samedi." }, "number", null);
  assert(list > 300, `liste ${list}`);
  assert(number > 250, `chiffre ${number}`);
});

Deno.test("dimensions lues dans l'en-tête PNG, JPEG et WebP", () => {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x04, 0x38, 0, 0, 0x07, 0x80, 8, 2, 0, 0, 0];
  assertEquals(imageSizeFromBase64(b64(png)), { width: 1080, height: 1920 });
  assertEquals(imageSizeFromBase64(`data:image/png;base64,${b64(png)}`), { width: 1080, height: 1920 });
  // JPEG : SOI, APP0 (longueur 16), SOF0 hauteur 1350 largeur 1080.
  const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array(14).fill(0), 0xff, 0xc0, 0, 17, 8, 0x05, 0x46, 0x04, 0x38, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assertEquals(imageSizeFromBase64(b64(jpeg)), { width: 1080, height: 1350 });
  // WebP VP8X : largeur-1 et hauteur-1 sur 24 bits.
  const webp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, 0x37, 0x04, 0, 0x45, 0x05, 0];
  assertEquals(imageSizeFromBase64(b64(webp)), { width: 1080, height: 1350 });
  assertEquals(imageSizeFromBase64("pas une image"), null);
  assertEquals(imageSizeFromBase64(""), null);
});
