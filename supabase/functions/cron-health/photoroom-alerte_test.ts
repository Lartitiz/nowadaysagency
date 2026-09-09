import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  jugerCredits,
  joursDepuisReset,
  MIN_JOURS_POUR_RYTHME,
} from "./photoroom-alerte.ts";

// ── LE faux positif du 09/09/2026, reproduit tel quel ────────────────────────
// 790/1000 restants, 210 consommés sur le mois écoulé, lus le 9 à 08h07 UTC
// (soit le jour même du reset). L'ancienne formule affichait « 210/j ».
Deno.test("jour du reset : 210 consommés sur le mois n'est PAS un rythme de 210/j", () => {
  const jours = joursDepuisReset(Date.parse("2026-09-09T08:07:00Z"));
  assertEquals(jours, 1, "8 h de recul → 1 jour");

  const { moyenne_par_jour, rythme_significatif, alerte } = jugerCredits(790, 210, jours);
  assertEquals(rythme_significatif, false, "1 jour de recul ne permet aucune moyenne");
  assertEquals(moyenne_par_jour, null, "ne pas publier un chiffre trompeur");
  assertEquals(alerte, null, "AUCUNE alerte : la consommation réelle est ~6,8/j");
});

Deno.test("le seuil ABSOLU reste actif même sans recul suffisant", () => {
  const { alerte } = jugerCredits(250, 750, 1);
  assertEquals(
    alerte,
    "moins de 300 crédits restants — risque de 402 sur les retouches photo",
    "un stock bas se signale dès le 1er jour",
  );
});

Deno.test("une VRAIE dérive est toujours attrapée dès qu'il y a du recul", () => {
  // 1200 consommés en 4 jours = 300/j : insoutenable, et cette fois c'est vrai.
  const { moyenne_par_jour, alerte } = jugerCredits(800, 1200, 4);
  assertEquals(moyenne_par_jour, 300);
  assertEquals(alerte, "rythme 300/j > 150/j — épuisement avant le reset du 9");
});

Deno.test("consommation saine avec du recul : pas d'alerte", () => {
  const { moyenne_par_jour, alerte } = jugerCredits(790, 210, 31);
  assertEquals(moyenne_par_jour, 6.8, "le vrai rythme du mois de septembre");
  assertEquals(alerte, null);
});

Deno.test("le seuil de significativité est franchi au bon jour", () => {
  assertEquals(jugerCredits(900, 400, MIN_JOURS_POUR_RYTHME - 1).rythme_significatif, false);
  assertEquals(jugerCredits(900, 400, MIN_JOURS_POUR_RYTHME).rythme_significatif, true);
});

Deno.test("joursDepuisReset : avant et après le 9 du mois", () => {
  // Le 8 septembre → le cycle courant a démarré le 9 AOÛT (30 jours).
  assertEquals(joursDepuisReset(Date.parse("2026-09-08T08:00:00Z")), 31);
  // Le 12 septembre → 4 jours depuis le reset du 9 septembre.
  assertEquals(joursDepuisReset(Date.parse("2026-09-12T08:00:00Z")), 4);
});
