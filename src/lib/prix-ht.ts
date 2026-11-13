/**
 * Prix affichés HT, TVA (20 %) en plus, depuis le 13/11/2026.
 * Les montants HT viennent de `stripe-config.ts` ; Stripe ajoute la TVA au paiement.
 */
export const TAUX_TVA = 0.2;

const NBSP = "\u00a0";

/** 39 → « 39 € », 46.8 → « 46,80 € », 1950 → « 1 950 € ». */
export function euros(montant: number): string {
  const arrondi = Math.round(montant * 100) / 100;
  const entier = Number.isInteger(arrondi);
  const texte = arrondi.toLocaleString("fr-FR", {
    minimumFractionDigits: entier ? 0 : 2,
    maximumFractionDigits: 2,
  }).replace(/[\u202f\u00a0 ]/g, NBSP);
  return `${texte}${NBSP}€`;
}

export function montantTTC(ht: number): number {
  return Math.round(ht * (1 + TAUX_TVA) * 100) / 100;
}

/** « 39 € HT » (+ période éventuelle, ex. « /mois »). */
export function prixHT(ht: number, periode = ""): string {
  return `${euros(ht)} HT${periode}`;
}

/** « 46,80 € TTC » (+ période éventuelle). */
export function prixTTC(ht: number, periode = ""): string {
  return `${euros(montantTTC(ht))} TTC${periode}`;
}

/** « 39 € HT/mois (46,80 € TTC) ». */
export function prixHtEtTtc(ht: number, periode = ""): string {
  return `${prixHT(ht, periode)} (${prixTTC(ht)})`;
}
