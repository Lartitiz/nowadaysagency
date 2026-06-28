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
] as const;

export type Category = (typeof CATEGORIES)[number];

// Modèle simplifié (2026-06) : `total` = compteur global unique de créations ;
// `audit` = sous-plafond audits ; `quality_max` = carrousels Opus plafonnés
// (gratuit = 0) ; `photo_retouch` = génération d'image bornée. Les autres
// catégories sont alignées sur `total` (le détail par catégorie est cosmétique).
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
  },
  outil: {
    total: 9999,
    content: 9999,
    audit: 9999,
    dm_comment: 9999,
    bio_profile: 9999,
    suggestion: 9999,
    coach: 9999,
    import: 9999,
    adaptation: 9999,
    deep_research: 9999,
    photo_retouch: 50,
    quality_max: 20,
  },
  binome: {
    total: 9999,
    content: 9999,
    audit: 9999,
    dm_comment: 9999,
    bio_profile: 9999,
    suggestion: 9999,
    coach: 9999,
    import: 9999,
    adaptation: 9999,
    deep_research: 9999,
    photo_retouch: 100,
    quality_max: 40,
  },
  // NB: plan « pro » retiré (reliquat, pas un plan vendu) — le backend
  // (_shared/plan-limiter.ts) ne le connaît pas non plus. Ce fichier doit
  // rester le miroir exact du serveur (free / outil / binome).
};
