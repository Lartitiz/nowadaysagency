// Mirror of PLAN_LIMITS from supabase/functions/_shared/plan-limiter.ts
// Keep in sync manually — this file exists so frontend/tests can import it.

export const CATEGORIES = [
  "content",
  "audit",
  "dm_comment",
  "bio_profile",
  "suggestion",
  "coach",
  "import",
  "adaptation",
  "deep_research",
  "photo_retouch",
  "quality_max",
  "carousel",
  "video",
] as const;

export type Category = (typeof CATEGORIES)[number];

// Grille des forfaits (01/10/2026) — « Pour 39 € par mois : tous tes textes
// sans compter, 20 carrousels, 30 images et 3 vidéos. » Voir le détail dans
// supabase/functions/_shared/plan-limiter.ts. En payant, `total` est un
// garde-fou d'usage raisonnable invisible : l'interface affiche « Illimité »
// (cf. isFairUsePlan). `carousel`, `photo_retouch` (= images) et `video` sont
// des plafonds durs que les crédits bonus ne lèvent pas.
export const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free: {
    total: 23,
    content: 23,
    audit: 3,
    dm_comment: 23,
    bio_profile: 23,
    suggestion: 23,
    coach: 23,
    import: 23,
    adaptation: 23,
    deep_research: 23,
    photo_retouch: 5,
    quality_max: 0,
    carousel: 3,
    video: 0,
  },
  outil: {
    total: 200,
    content: 200,
    audit: 200,
    dm_comment: 200,
    bio_profile: 200,
    suggestion: 200,
    coach: 200,
    import: 200,
    adaptation: 200,
    deep_research: 200,
    photo_retouch: 30,
    quality_max: 20,
    carousel: 20,
    video: 3,
  },
  binome: {
    total: 400,
    content: 400,
    audit: 400,
    dm_comment: 400,
    bio_profile: 400,
    suggestion: 400,
    coach: 400,
    import: 400,
    adaptation: 400,
    deep_research: 400,
    photo_retouch: 60,
    quality_max: 40,
    carousel: 40,
    video: 6,
  },
  // NB: plan « pro » retiré (reliquat, pas un plan vendu) — le backend
  // (_shared/plan-limiter.ts) ne le connaît pas non plus. Ce fichier doit
  // rester le miroir exact du serveur (free / outil / binome).
};

/** Plafonds que les crédits bonus ne lèvent jamais (miroir du serveur). */
export const HARD_CAP_CATEGORIES: readonly string[] = ["carousel", "photo_retouch", "video"];

/**
 * Vrai quand le compteur global du plan est un garde-fou d'usage raisonnable
 * (plans payants) ou un vrai illimité (≥ 9999, admin) : on affiche alors
 * « Illimité » au lieu de « X/200 ». Le gratuit garde son compteur visible.
 */
export function isFairUsePlan(plan: string | null | undefined, totalLimit?: number | null): boolean {
  if (typeof totalLimit === "number" && totalLimit >= 9999) return true;
  return plan === "outil" || plan === "binome" || plan === "admin";
}
