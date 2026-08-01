/**
 * Budgets de temps de l'export de visuels (PPTX hybride, pont Canva).
 *
 * Ces constantes vivent à part parce que DEUX modules doivent s'accorder dessus :
 * le fabricant (`export-carousel-hybrid-pptx.ts`, lourd — html2canvas + pptxgenjs,
 * chargé à la demande) et l'appelant (`use-open-in-canva.ts`, léger). Les mettre
 * ici évite au second de tirer le premier dans le bundle principal.
 *
 * Bug du 01/08 : les deux budgets se contredisaient. Chaque capture de slide a
 * droit à 25 s avant d'être abandonnée (pour qu'une slide récalcitrante ne bloque
 * pas tout), les slides sont traitées 3 par 3 — mais le pont Canva plafonnait
 * l'ensemble à 90 s. Sur un carrousel de 10 slides, 4 lots × 25 s = 100 s : le
 * plafond global tuait l'export AVANT que les garde-fous internes puissent jouer
 * leur rôle. Plus le carrousel était long, plus l'échec était certain.
 *
 * Le budget se DÉDUIT donc désormais des garde-fous internes, au lieu d'être un
 * nombre écrit à côté qui peut diverger.
 */

/** Au-delà, on abandonne CETTE capture et on continue avec les autres. */
export const CAPTURE_TIMEOUT_MS = 25000;

/** Nombre de slides rastérisées en parallèle. */
export const RENDER_CONCURRENCY = 3;

/** Marge par lot : montage de l'iframe, polices, images, stabilisation. */
const MARGE_PAR_LOT_MS = 3000;

/** Frais fixes : chargement du module, écriture du fichier PPTX, conversion. */
const FRAIS_FIXES_MS = 20000;

/** Plancher : en dessous, on serait plus sévère que l'ancien plafond de 90 s. */
const PLANCHER_MS = 90000;

/** Plafond dur : au-delà, mieux vaut une erreur claire qu'une attente sans fin. */
const PLAFOND_MS = 300000;

/**
 * Temps maximum accordé à la fabrication complète du fichier, déduit du pire cas
 * réel : chaque lot peut consommer son délai de capture entier.
 */
export function budgetExportMs(etapes: number): number {
  const lots = Math.max(1, Math.ceil((etapes || 1) / RENDER_CONCURRENCY));
  const pireCas = FRAIS_FIXES_MS + lots * (CAPTURE_TIMEOUT_MS + MARGE_PAR_LOT_MS);
  return Math.min(PLAFOND_MS, Math.max(PLANCHER_MS, pireCas));
}
