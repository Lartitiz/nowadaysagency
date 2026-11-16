// Règles de la relecture du 15/11/2026 étendues au carrousel TEXTE (16/11/2026).
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/carousel-ai/text-review-rules_test.ts
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildExpressFullPrompt, buildSlidesPrompt, buildPhotoCarouselPrompt } from "./prompts.ts";
import { CAROUSEL_CONTINUITY } from "./writing-contract.ts";
import { carouselLengthPrompt } from "../_shared/carousel-length.ts";

const material = "MATIÈRE ÉDITORIALE CHOISIE (…)\nIllustration : deux affiches en vitrine de pharmacie, « Prenez soin de vous » et « Piqûres de moustiques ? ».";
const body = { subject: "Parler à tout le monde", carousel_type: "tips", editorial_angle: "Une situation par post", deepening_answers: { "Brief éditorial choisi": material } };

Deno.test("carrousel texte : les règles de relecture sont dans la consigne (express et slides)", () => {
  for (const p of [buildExpressFullPrompt(body), buildSlidesPrompt(body)]) {
    assert(p.includes("PAS DE SLOGAN EN CONTRASTE"));
    assert(p.includes("SOURCE EN LÉGENDE"));
    assert(p.includes("UNE SLIDE À GARDER : une slide donne"));
    assert(p.includes("EXEMPLE À REPRENDRE SUR LES SLIDES"));
    assert(p.includes("Prenez soin de vous"));
    assert(!p.includes("closing_aside"), "le gabarit texte n'a pas de petite ligne d'humour");
    assert(p.includes("va dans caption.cta"));
  }
});

Deno.test("carrousel texte : la dernière slide ne porte plus la question", () => {
  assert(!CAROUSEL_CONTINUITY.includes("soit une question simple à laquelle elle peut répondre en commentaire"));
  assert(CAROUSEL_CONTINUITY.includes("jamais sur la dernière slide"));
  assert(!carouselLengthPrompt(body).includes("une question simple à laquelle répondre en commentaire"));
});

Deno.test("carrousel photo (consigne de secours) : pas de règles du texte ajoutées", () => {
  assert(!buildPhotoCarouselPrompt({ ...body, carousel_type: "photo" }).includes("UNE SLIDE À GARDER : une slide donne"));
});
