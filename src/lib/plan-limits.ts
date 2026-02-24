// Mirror of PLAN_LIMITS from supabase/functions/_shared/plan-limiter.ts
// Keep in sync manually — this file exists so frontend/tests can import it.

export const CATEGORIES = [
  "content",
  "audit",
  "dm_comment",
  "bio_profile",
  "suggestion",
  "import",
  "adaptation",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free: {
    total: 10,
    content: 5,
    audit: 1,
    dm_comment: 3,
    bio_profile: 1,
    suggestion: 0,
    import: 0,
    adaptation: 0,
  },
  outil: {
    total: 100,
    content: 50,
    audit: 5,
    dm_comment: 25,
    bio_profile: 5,
    suggestion: 10,
    import: 3,
    adaptation: 10,
  },
  studio: {
    total: 300,
    content: 150,
    audit: 15,
    dm_comment: 60,
    bio_profile: 15,
    suggestion: 30,
    import: 10,
    adaptation: 30,
  },
  now_pilot: {
    total: 300,
    content: 150,
    audit: 15,
    dm_comment: 50,
    bio_profile: 15,
    suggestion: 30,
    import: 10,
    adaptation: 30,
  },
};
