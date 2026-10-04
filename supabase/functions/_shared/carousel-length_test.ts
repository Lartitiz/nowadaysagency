import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { carouselLengthPrompt } from "./carousel-length.ts";

// 04/10/2026 (accord de Laetitia) : en longueur auto, une slide de texte trop
// longue est répartie sur deux slides, jamais raccourcie.
Deno.test("slide trop longue : règle de répartition en carrousel texte auto seulement", () => {
  const auto = carouselLengthPrompt({ subject: "Ce que l'IA coûte", carousel_type: null });
  assert(auto.includes("SLIDE TROP LONGUE") && auto.includes("sans raccourcir"));
  assert(!carouselLengthPrompt({ subject: "x", slide_count: 7 }).includes("SLIDE TROP LONGUE"), "nombre imposé");
  assert(!carouselLengthPrompt({ subject: "x", carousel_type: "photo" }).includes("SLIDE TROP LONGUE"), "photo : règle propre");
  assert(!carouselLengthPrompt({ subject: "x", carousel_type: "mix" }).includes("SLIDE TROP LONGUE"), "mixte");
});
