import { describe, it, expect } from "vitest";
import { sansJargon, sansJargonDeep } from "@/lib/sans-jargon";
import * as serveur from "../../supabase/functions/deep-diagnostic/jargon";

const CAS: [string, string][] = [
  ["Ton site affiche 'Réserver' en haut : c'est un CTA clair.", "Ton site affiche 'Réserver' en haut : c'est un appel à l'action clair."],
  ["Pas de CTA dans ta bio.", "Pas d'appel à l'action dans ta bio."],
  ["Il manque d'CTA.", "Il manque d'appel à l'action."],
  ["Le CTA est caché.", "L'appel à l'action est caché."],
  ["Place le CTA plus haut.", "Place l'appel à l'action plus haut."],
  ["La place du CTA compte.", "La place de l'appel à l'action compte."],
  ["Tes CTAs sont flous.", "Tes appels à l'action sont flous."],
  ["Ajoute des CTA dans tes légendes.", "Ajoute des appels à l'action dans tes légendes."],
  ["Ta bio n'a pas de CTAs.", "Ta bio n'a pas d'appels à l'action."],
  ["Ce CTA marche.", "Cet appel à l'action marche."],
  ["Ajoute une CTA.", "Ajoute un appel à l'action."],
  ["Ta CTA est floue.", "Ton appel à l'action est floue."],
  ["Le bouton CTA est rose.", "Le bouton d'action est rose."],
  ["CTA absent sur mobile.", "Appel à l'action absent sur mobile."],
  ["Bon début. CTA à revoir.", "Bon début. Appel à l'action à revoir."],
  ["Ajoute un call-to-action.", "Ajoute un appel à l'action."],
  ["Pas de jargon ici.", "Pas de jargon ici."],
  ["Le mot CTAB reste.", "Le mot CTAB reste."],
];

describe("sansJargon : plus jamais « CTA » à l'écran", () => {
  it.each(CAS)("%s", (avant, apres) => {
    expect(sansJargon(avant)).toBe(apres);
  });

  it("la copie du serveur donne exactement le même résultat", () => {
    for (const [avant] of CAS) expect(serveur.sansJargon(avant)).toBe(sansJargon(avant));
  });

  it("nettoie tout un diagnostic sans toucher aux routes ni aux sources", () => {
    const diag = {
      summary: "Ton CTA est clair.",
      weaknesses: [{ title: "Pas de CTA", why: "Les CTAs manquent.", source: "website" }],
      priorities: [{ title: "Écris ton CTA", route: "/site/accueil", impact: "high" }],
      totalScore: 42,
      isFallback: false,
    };
    const propre = sansJargonDeep(diag);
    expect(JSON.stringify(propre)).not.toMatch(/CTA/);
    expect(propre.weaknesses[0].source).toBe("website");
    expect(propre.priorities[0].route).toBe("/site/accueil");
    expect(propre.totalScore).toBe(42);
    expect(propre.isFallback).toBe(false);
    expect(serveur.sansJargonDeep(diag)).toEqual(propre);
  });
});
