// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lots 2 et 4, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Analyse du carrousel. Lot 2 : textes d'une slide (slideTexts, slideBody),
// dont les mesures de style ont besoin ; le reste de l'analyse arrive au lot 4.

import { carouselEditorialFields } from "../carousel-editorial-review.ts";

export function slideTexts(s: any): string {
  return [...carouselEditorialFields({ slides: [s] }).map(f => f.text),
    ...(typeof s?.big_number === "number" ? [String(s.big_number)] : []),
  ].join(" ");
}

/** Corps mesurable d'une slide pour la règle « 50 mots » (titre exclu). */
export function slideBody(s: any): string {
  return [s?.body, s?.overlay_text].filter(Boolean).join(" ");
}
