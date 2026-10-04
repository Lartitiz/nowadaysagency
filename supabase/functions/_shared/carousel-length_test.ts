import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { autoMaxSlides, carouselLengthPrompt, longTextSlides } from "./carousel-length.ts";

// 04/10/2026 (décision de Laetitia : « Jusqu'à 20 en texte ») : en longueur
// auto, le carrousel TEXTE découpe une idée par slide, jamais de texte raccourci.
Deno.test("découpage une idée par slide : carrousel texte auto seulement", () => {
  const auto = carouselLengthPrompt({ subject: "Ce que l'IA coûte", carousel_type: null });
  assert(auto.includes("UNE IDÉE PAR SLIDE") && auto.includes("sans raccourcir"));
  assert(auto.includes("de 4 à 20"));
  assert(!carouselLengthPrompt({ subject: "x", slide_count: 7 }).includes("UNE IDÉE PAR SLIDE"), "nombre imposé");
  assert(!carouselLengthPrompt({ subject: "x", carousel_type: "photo" }).includes("UNE IDÉE PAR SLIDE"), "photo : règle propre");
  assert(!carouselLengthPrompt({ subject: "x", carousel_type: "mix" }).includes("UNE IDÉE PAR SLIDE"), "mixte");
});

Deno.test("plafond auto : 20 en texte, 10 en photo et en mixte", () => {
  assertEquals(autoMaxSlides({ carousel_type: "prise_de_position" }), 20);
  assertEquals(autoMaxSlides({}), 20);
  assertEquals(autoMaxSlides({ carousel_type: "photo" }), 10);
  assertEquals(autoMaxSlides({ carousel_type: "mix" }), 10);
  assert(carouselLengthPrompt({ subject: "x", carousel_type: "photo" }).includes("de 4 à 10"));
  assert(carouselLengthPrompt({ subject: "x", carousel_type: "mix" }).includes("de 4 à 10"));
});

Deno.test("slides longues mesurées en texte auto, jamais coupées", () => {
  const long = Array.from({ length: 60 }, () => "mot").join(" ");
  const parsed = { slides: [{ slide_number: 1, title: long }, { slide_number: 2, title: "Court", body: "Une phrase." }, { slide_number: 3, body: long }] };
  assertEquals(longTextSlides(parsed, { subject: "x" }), [3]);
  assertEquals(longTextSlides(parsed, { subject: "x", slide_count: 3 }), []);
  assertEquals(longTextSlides(parsed, { subject: "x", carousel_type: "photo" }), []);
});
