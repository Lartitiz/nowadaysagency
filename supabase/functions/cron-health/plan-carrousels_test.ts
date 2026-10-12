import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planStats } from "./plan-carrousels.ts";

const ev = (plan: Record<string, unknown>, created_at = "2026-10-10T10:00:00Z") => ({ created_at, content_preview: { plan } });
const all = () => true;

Deno.test("plan : médiane, 90e centile, max, second appel, vides, longueur, > 170 s", () => {
  const events = [
    ...[55, 58, 60, 61, 62, 63, 64, 66, 70].map((s) => ev({ type: "photo", duree_ms: s * 1000, appels: 1, gagnant: 1, photos: 3, slides_obtenues: 10, slides_avec_photo: 10 })),
    ev({ type: "photo", duree_ms: 175_000, appels: 2, gagnant: 2, plans_vides: 1, photos: 3, slides_obtenues: 10, slides_avec_photo: 7 }),
    ev({ type: "mix", duree_ms: 90_000, appels: 2, gagnant: null, mauvaise_longueur: 2, longueur_approchee: true, photos: 2, slides_obtenues: 9, slides_avec_photo: 4 }),
    ev({ type: "texte", duree_ms: 30_000, appels: 2, gagnant: null, plans_vides: 2, erreur: "structure_vide", photos: 0, slides_obtenues: null }),
  ];
  const s = planStats(events, all);
  assertEquals(Object.keys(s), ["mix", "photo", "texte"]);
  assertEquals(s.photo.plans, 10);
  assertEquals(s.photo.duree, { mediane: 62, p90: 70, max: 175 });
  assertEquals([s.photo.second_appel, s.photo.gagnes_par_second, s.photo.avec_plan_vide, s.photo.reponses_vides, s.photo.au_dela_170s], [1, 1, 1, 1, 1]);
  assertEquals([s.photo.slides_avec_photo, s.photo.slides_obtenues], [97, 100]);
  assertEquals([s.mix.mauvaise_longueur, s.mix.longueur_approchee, s.mix.gagnes_par_second], [1, 1, 0]);
  assertEquals(s.texte.erreurs, { structure_vide: 1 });
  assertEquals([s.texte.avec_plan_vide, s.texte.reponses_vides, s.texte.slides_obtenues], [1, 2, 0]);
});

Deno.test("plan : hors fenêtre et lignes sans compte rendu ignorées", () => {
  const s = planStats([
    ev({ type: "photo", duree_ms: 60_000 }, "2026-09-01T00:00:00Z"),
    { created_at: "2026-10-10T10:00:00Z", content_preview: { durees: { label: "photo" } } },
    { created_at: "2026-10-10T10:00:00Z", content_preview: null },
  ], (d) => String(d) >= "2026-10-05");
  assertEquals(s, {});
});
