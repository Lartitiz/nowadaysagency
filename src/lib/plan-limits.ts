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
] as const;

export type Category = (typeof CATEGORIES)[number];

export const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free: {
    total: 60,
    content: 60,
    audit: 60,
    dm_comment: 60,
    bio_profile: 60,
    suggestion: 60,
    coach: 60,
    import: 60,
    adaptation: 60,
    deep_research: 60,
    photo_retouch: 5,
  },
  outil: {
    total: 9999,
    content: 9999,
    audit: 9999,
    dm_comment: 60,
    bio_profile: 15,
    suggestion: 30,
    coach: 120,
    import: 10,
    adaptation: 30,
    deep_research: 15,
    photo_retouch: 50,
  },
  binome: {
    total: 9999,
    content: 9999,
    audit: 9999,
    dm_comment: 50,
    bio_profile: 15,
    suggestion: 30,
    coach: 120,
    import: 10,
    adaptation: 30,
    deep_research: 30,
    photo_retouch: 100,
  },
  // NB: plan « pro » retiré (reliquat, pas un plan vendu) — le backend
  // (_shared/plan-limiter.ts) ne le connaît pas non plus. Ce fichier doit
  // rester le miroir exact du serveur (free / outil / binome).
};
