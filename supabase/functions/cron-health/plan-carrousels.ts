// Plan des carrousels (12/10/2026) — bilan hebdo, testable.
//
// Pourquoi : le plan (carousel-ai structure_proposal) est gratuit et n'écrivait
// rien en base ; son rattrapage par second appel (structure-hedge.ts, 80 s) et
// ses plans vides ou de mauvaise longueur ne se lisaient que dans les journaux
// edge, effacés en quelques heures. Un plan à 164 s (10/10) n'aurait été vu par
// aucune routine. Lignes content_quality_events au format carousel_plan,
// content_preview.plan (logCarouselPlan) : nombres et codes seulement.

/** Attente de l'écran avant d'abandonner le plan (STRUCTURE_PROPOSAL_TIMEOUT_MS). */
export const ECRAN_PLAN_MS = 170_000;

export interface PlanParType {
  plans: number;
  /** Durée totale côté serveur, en secondes. */
  duree: { mediane: number; p90: number; max: number } | null;
  /** Plans où le second appel a été lancé, et gagnés par lui. */
  second_appel: number;
  gagnes_par_second: number;
  /** Plans où au moins une réponse est revenue vide, et nombre de réponses vides. */
  avec_plan_vide: number;
  reponses_vides: number;
  /** Plans où une réponse avait la mauvaise longueur ; rendus quand même à une autre longueur. */
  mauvaise_longueur: number;
  longueur_approchee: number;
  /** Au-delà de l'attente de l'écran (170 s) : l'écran a abandonné. */
  au_dela_170s: number;
  /** Plans rendus en erreur à l'écran, par code (structure_timeout, structure_vide…). */
  erreurs: Record<string, number>;
  /** Photo/mixte : slides avec photo sur slides obtenues. */
  slides_avec_photo: number;
  slides_obtenues: number;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
const sec = (ms: number) => Math.round(ms / 100) / 10;
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : 0;

export function planStats(
  events: { created_at: string | null; content_preview?: any }[],
  inWindow: (iso: string | null) => boolean,
): Record<string, PlanParType> {
  const groups = new Map<string, any[]>();
  for (const e of events) {
    if (!inWindow(e.created_at)) continue;
    const p = e.content_preview?.plan;
    if (!p || typeof p !== "object") continue;
    const type = typeof p.type === "string" ? p.type : "inconnu";
    const list = groups.get(type) ?? [];
    list.push(p);
    groups.set(type, list);
  }
  const out: Record<string, PlanParType> = {};
  for (const [type, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const d = list.map((p) => p.duree_ms).filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
    const erreurs: Record<string, number> = {};
    for (const p of list) if (typeof p.erreur === "string" && p.erreur) erreurs[p.erreur] = (erreurs[p.erreur] || 0) + 1;
    out[type] = {
      plans: list.length,
      duree: d.length ? { mediane: sec(quantile(d, 0.5)), p90: sec(quantile(d, 0.9)), max: sec(d[d.length - 1]) } : null,
      second_appel: list.filter((p) => num(p.appels) >= 2).length,
      gagnes_par_second: list.filter((p) => p.gagnant === 2).length,
      avec_plan_vide: list.filter((p) => num(p.plans_vides) > 0).length,
      reponses_vides: list.reduce((n, p) => n + num(p.plans_vides), 0),
      mauvaise_longueur: list.filter((p) => num(p.mauvaise_longueur) > 0).length,
      longueur_approchee: list.filter((p) => p.longueur_approchee === true).length,
      au_dela_170s: d.filter((ms) => ms > ECRAN_PLAN_MS).length,
      erreurs,
      slides_avec_photo: list.reduce((n, p) => n + num(p.slides_avec_photo), 0),
      slides_obtenues: list.reduce((n, p) => n + (num(p.photos) > 0 ? num(p.slides_obtenues) : 0), 0),
    };
  }
  return out;
}
