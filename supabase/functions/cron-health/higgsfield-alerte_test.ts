import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  debutMoisUtc,
  jugerBudgetHiggsfield,
  prochainResetUtc,
  somme,
} from "./higgsfield-alerte.ts";

const NOW = Date.parse("2026-10-08T07:00:00Z");

Deno.test("le mois et le reset suivent l'UTC, comme higgsfield_image_month_used()", () => {
  assertEquals(new Date(debutMoisUtc(NOW)).toISOString(), "2026-10-01T00:00:00.000Z");
  assertEquals(new Date(prochainResetUtc(NOW)).toISOString(), "2026-11-01T00:00:00.000Z");
  // Décembre → janvier de l'année suivante.
  assertEquals(new Date(prochainResetUtc(Date.parse("2026-12-20T10:00:00Z"))).toISOString(), "2027-01-01T00:00:00.000Z");
});

Deno.test("somme : les lignes failed et celles d'avant la fenêtre ne comptent pas", () => {
  const rows = [
    { estimated_usd: "0.33", status: "completed", created_at: "2026-10-05T10:00:00Z" },
    { estimated_usd: 0.33, status: "uncertain", created_at: "2026-10-06T10:00:00Z" },
    { estimated_usd: 0.33, status: "failed", created_at: "2026-10-06T11:00:00Z" },
    { estimated_usd: 0.5, status: "completed", created_at: "2026-09-30T23:59:00Z" },
  ];
  assertEquals(Math.round(somme(rows, debutMoisUtc(NOW)) * 100) / 100, 0.66);
});

Deno.test("consommation saine : pas d'alerte, date d'épuisement après le reset", () => {
  // 20 $ réservés sur 100 $, 7 $ sur 7 j = 1 $/j → 80 j, bien après le 1er novembre.
  const j = jugerBudgetHiggsfield(20, 7, 100, NOW);
  assertEquals(j.pct_utilise, 20);
  assertEquals(j.rythme_7j_usd_par_jour, 1);
  assertEquals(j.jours_avant_epuisement, 80);
  assertEquals(j.epuisement_avant_reset, false);
  assertEquals(j.alerte, null);
});

Deno.test("épuisement à moins de 10 jours avant le reset : alerte", () => {
  // 40/100 réservés, 45 $ sur 7 j ≈ 6,43 $/j → 60 $ restants tiennent 9,3 j.
  const j = jugerBudgetHiggsfield(40, 45, 100, NOW);
  assertEquals(j.jours_avant_epuisement, 9.3);
  assertEquals(j.epuisement_avant_reset, true);
  assertEquals(j.epuisement_estime, "2026-10-17");
  assertEquals(j.alerte?.startsWith("épuisement estimé dans 9.3 j"), true);
});

Deno.test("moins de 10 jours mais APRÈS le reset du 1er : pas d'alerte de rythme", () => {
  // Le 28/10, 8 j de marge : le compteur repart à zéro dans 4 j.
  const fin = Date.parse("2026-10-28T07:00:00Z");
  const j = jugerBudgetHiggsfield(60, 35, 100, fin);
  assertEquals(j.jours_avant_epuisement, 8);
  assertEquals(j.epuisement_avant_reset, false);
  assertEquals(j.alerte, null);
});

Deno.test("plus de 80 % réservés : alerte même si le rythme est calme", () => {
  const j = jugerBudgetHiggsfield(81, 0, 100, NOW);
  assertEquals(j.jours_avant_epuisement, null, "aucune dépense sur 7 j : pas de date inventée");
  assertEquals(j.alerte, "81 % du budget mensuel réservé (> 80 %)");
});

Deno.test("plafond atteint : les images sont déjà refusées « budget »", () => {
  const j = jugerBudgetHiggsfield(99.8, 10, 100, NOW);
  assertEquals(j.restant_usd, 0.2);
  assertEquals(j.alerte?.startsWith("plafond atteint"), true);
});

Deno.test("plafond absent ou invalide : alerte, toutes les images seraient refusées", () => {
  for (const p of [null, 0, -5, NaN]) {
    const j = jugerBudgetHiggsfield(0, 0, p, NOW);
    assertEquals(j.plafond_usd, null);
    assertEquals(j.alerte?.includes("HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD absent"), true);
  }
});
