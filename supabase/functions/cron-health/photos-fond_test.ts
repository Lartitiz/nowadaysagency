// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/photos-fond_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { narrateurCompte, PHOTOS_FOND_LONG_WORDS, photosFondStats } from "./photos-fond.ts";
import { narratorCounts, PHOTO_OVERLAY_LONG_WORDS } from "../carousel-ai/photo-narrative.ts";

const mots = (n: number) => Array.from({ length: n }, () => "mot").join(" ");
const row = (slides: unknown[], carousel_type = "photo", created_at = "2026-11-10T10:00:00Z") => ({
  carousel_type, created_at, slides: slides.map((overlay_text, i) => ({ slide_number: i + 1, overlay_text })),
});
const toujours = () => true;

Deno.test("photos en fond : mêmes règles que la génération (carousel-ai/photo-narrative.ts)", () => {
  assertEquals(PHOTOS_FOND_LONG_WORDS, PHOTO_OVERLAY_LONG_WORDS);
  for (const t of ["J'ai rénové mon salon. « Nous adorons », dit-elle.", "Chez nous, notre équipe et nos clients.", "Vous choisissez."]) {
    assertEquals(narrateurCompte(t), narratorCounts(t), t);
  }
});

Deno.test("photos en fond : slides > 40 mots (couverture exclue), mixte et photos brutes ignorés", () => {
  const r = photosFondStats([
    row([mots(60), mots(30), mots(41), mots(12)]),
    row([mots(50), mots(50)], "mix"),
    row([null, null]),
  ], toujours);
  assertEquals(r, { carrousels: 1, slides: 3, au_dela_40_mots: 1, max_mots: 41, narrateur_mixte: 0, alerte: null });
});

Deno.test("photos en fond : « nous » puis « je » compte un carrousel mêlé ; citations ignorées", () => {
  const r = photosFondStats([
    row(["Rénover un T3", "Nous avons gardé les murs.", "J'ai choisi un bois clair."]),
    row(["Rénover un T3", "J'ai gardé les murs.", "« Nous adorons », dit la cliente."]),
  ], toujours);
  assertEquals(r.narrateur_mixte, 1);
  assertEquals(r.alerte, null);
});

Deno.test("photos en fond : alerte à partir de 3 slides > 40 mots ou de 2 carrousels je/nous, sur la fenêtre", () => {
  const long = photosFondStats([row(["c", mots(45), mots(46)]), row(["c", mots(47)]), row(["c", mots(80)], "photo", "2026-10-01T00:00:00Z")], (d) => d! >= "2026-11-01");
  assertEquals(long.au_dela_40_mots, 3);
  assert(long.alerte?.includes("3 slide(s) de plus de 40 mots"));
  const voix = photosFondStats([row(["c", "Nous rénovons.", "Je choisis."]), row(["c", "Notre équipe.", "Mon atelier."])], toujours);
  assert(voix.alerte?.includes("2 carrousel(s) qui mélangent « je » et « nous »"));
});

Deno.test("photos en fond : rien de gardé", () => {
  assertEquals(photosFondStats([], toujours), { carrousels: 0, slides: 0, au_dela_40_mots: 0, max_mots: null, narrateur_mixte: 0, alerte: null });
});
