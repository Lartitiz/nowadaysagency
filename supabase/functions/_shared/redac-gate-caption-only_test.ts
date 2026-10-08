import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { rescoreCaptionOnly } from "./redac-gate.ts";

// Visite du 08/10 : un carrousel « Photos brutes » (slides sans texte) affichait
// « Contrôle rédactionnel : 60/100 », note calculée sur le texte des slides que
// l'app efface ensuite. En photos seules, la note juge la légende seule.
const tics = "Ce n'est pas de la maladresse : c'est la nature du matériau. Le problème n'est pas le prix. C'est le prix de référence.";
const doc = (caption: any) => JSON.stringify({
  carousel_type: "photo",
  slides: [
    { slide_number: 1, slide_type: "photo_full", overlay_text: tics, photo_index: 1 },
    { slide_number: 2, slide_type: "photo_full", overlay_text: "Ce n'est pas un hasard. C'est un choix.", photo_index: 2 },
  ],
  caption,
  quality_check: { source: "code", score: 60, corrected_by_repass: true },
});

Deno.test("photos seules : les défauts des slides effacées ne comptent plus", () => {
  const out = JSON.parse(rescoreCaptionOnly(doc({ hook: "Ma peau réactive.", body: "Je fabrique mes savons à la main, en petites séries.", cta: "Dis-moi ce que tu regardes en premier.", hashtags: ["savon"] }), { inputText: "" }));
  assertEquals(out.quality_check.score, 100);
  assertEquals(out.quality_check.scored_on, "caption_only");
  assertEquals(out.quality_check.full_writing_score, 60);
  assertEquals(out.quality_check.corrected_by_repass, true);
  // Le texte des slides n'est pas touché ici (c'est l'app qui l'efface).
  assertEquals(out.slides[0].overlay_text, tics);
});

Deno.test("photos seules : un défaut DANS la légende reste compté", () => {
  const out = JSON.parse(rescoreCaptionOnly(doc({ hook: "Ma peau.", body: tics, cta: "", hashtags: [] }), { inputText: "" }));
  assert(out.quality_check.score < 100);
  assert(out.quality_check.reversal_negation_count > 0);
});

Deno.test("contenu illisible : renvoyé tel quel", () => {
  assertEquals(rescoreCaptionOnly("pas de json", {}), "pas de json");
});
