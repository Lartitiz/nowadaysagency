// Budget images Higgsfield — jugement extrait de `index.ts` pour être TESTABLE.
//
// Pourquoi (08/10/2026) : depuis le 02/10 le crédit OpenAI est épuisé et toutes
// les images passent par Higgsfield. Le plafond mensuel est le secret
// HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD ; chaque image RÉSERVE un montant (borne
// haute, pas la facture réelle) sous le même verrou, et la réservation est
// refusée (« Le budget images du mois est atteint côté service ») dès que
// réservé du mois + estimation > plafond. Personne ne voyait venir l'épuisement,
// comme pour le crédit OpenAI découvert par hasard.
//
// Ce qui compte dans le plafond = exactement `higgsfield_image_month_used()` :
// la somme de `estimated_usd` des DEUX tables `studio_image_requests` (Studio
// visuel) et `higgsfield_image_spend` (carrousels, produit porté, passe
// fidélité du Studio), lignes créées depuis le 1er du mois UTC, statut ≠ failed
// (submitting, queued, in_progress, uncertain, completed comptent tous).
// Le compteur repart à zéro le 1er du mois à 00:00 UTC.

export const HIGGSFIELD_ALERTE_PCT = 80;
export const HIGGSFIELD_ALERTE_JOURS = 10;
/** Marge en deçà de laquelle une image de plus ne passe plus (la réservation
 * Marketing Studio d'une image avec photos ≈ 0,33-0,38 $, garde-fou 2 $). */
export const HIGGSFIELD_MARGE_UNE_IMAGE_USD = 0.5;

const DAY = 24 * 3600000;

export function debutMoisUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function prochainResetUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export type SpendRow = { estimated_usd: number | string | null; status: string | null; created_at: string };

/** Lignes qui comptent dans le plafond (mêmes règles que la fonction SQL). */
export function compte(row: SpendRow, depuis: number): boolean {
  return row.status !== "failed" && new Date(row.created_at).getTime() >= depuis;
}

export function somme(rows: SpendRow[], depuis: number): number {
  return rows.reduce((s, r) => (compte(r, depuis) ? s + (Number(r.estimated_usd) || 0) : s), 0);
}

export type JugementHiggsfield = {
  reserve_mois_usd: number;
  plafond_usd: number | null;
  restant_usd: number | null;
  pct_utilise: number | null;
  reserve_7j_usd: number;
  rythme_7j_usd_par_jour: number;
  jours_avant_epuisement: number | null;
  epuisement_estime: string | null;
  epuisement_avant_reset: boolean | null;
  prochain_reset: string;
  alerte: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function jugerBudgetHiggsfield(
  reserveMois: number,
  reserve7j: number,
  plafond: number | null,
  now: number,
): JugementHiggsfield {
  const reset = prochainResetUtc(now);
  const rythme = reserve7j / 7;
  const base = {
    reserve_mois_usd: r2(reserveMois),
    reserve_7j_usd: r2(reserve7j),
    rythme_7j_usd_par_jour: r2(rythme),
    prochain_reset: new Date(reset).toISOString().slice(0, 10),
  };
  if (plafond === null || !Number.isFinite(plafond) || plafond <= 0) {
    return {
      ...base,
      plafond_usd: null,
      restant_usd: null,
      pct_utilise: null,
      jours_avant_epuisement: null,
      epuisement_estime: null,
      epuisement_avant_reset: null,
      alerte: "HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD absent ou invalide — TOUTES les images Higgsfield sont refusées « budget »",
    };
  }
  const restant = Math.max(0, plafond - reserveMois);
  const pct = Math.round((reserveMois / plafond) * 1000) / 10;
  // Pas de rythme sur 7 j = rien ne s'épuise : on ne projette pas une date.
  const jours = rythme > 0 ? Math.round((restant / rythme) * 10) / 10 : null;
  const quand = jours !== null ? now + jours * DAY : null;
  const avantReset = quand !== null ? quand < reset : false;
  const out = {
    ...base,
    plafond_usd: r2(plafond),
    restant_usd: r2(restant),
    pct_utilise: pct,
    jours_avant_epuisement: jours,
    epuisement_estime: quand !== null ? new Date(quand).toISOString().slice(0, 10) : null,
    epuisement_avant_reset: avantReset,
  };

  if (restant < HIGGSFIELD_MARGE_UNE_IMAGE_USD) {
    return { ...out, alerte: `plafond atteint (${r2(reserveMois)} $ / ${r2(plafond)} $) — les images sont refusées « budget » jusqu'au ${base.prochain_reset}` };
  }
  if (pct > HIGGSFIELD_ALERTE_PCT) {
    return { ...out, alerte: `${pct} % du budget mensuel réservé (> ${HIGGSFIELD_ALERTE_PCT} %)` };
  }
  // Une date d'épuisement APRÈS le reset du 1er n'est pas un risque : le compteur
  // repart à zéro avant.
  if (jours !== null && avantReset && jours < HIGGSFIELD_ALERTE_JOURS) {
    return { ...out, alerte: `épuisement estimé dans ${jours} j (vers le ${out.epuisement_estime}) au rythme des 7 derniers jours, avant le reset du ${base.prochain_reset}` };
  }
  return { ...out, alerte: null };
}
