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
] as const;

export type Category = (typeof CATEGORIES)[number];

export const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free: {
    total: 60,
    content: 25,
    audit: 3,
    dm_comment: 5,
    bio_profile: 5,
    suggestion: 5,
    coach: 15,
    import: 2,
    adaptation: 3,
    deep_research: 5,
  },
  outil: {
    total: 9999,
    content: 9999,
    audit: 9999,
    dm_comment: 60,
    bio_profile: 15,
    suggestion: 30,
    coach: 60,
    import: 10,
    adaptation: 30,
    deep_research: 15,
  },
  now_pilot: {
    total: 300,
    content: 150,
    audit: 15,
    dm_comment: 50,
    bio_profile: 15,
    suggestion: 30,
    coach: 60,
    import: 10,
    adaptation: 30,
    deep_research: 30,
  },
  pro: {
    total: 500,
    content: 250,
    audit: 25,
    dm_comment: 100,
    bio_profile: 25,
    suggestion: 50,
    coach: 100,
    import: 15,
    adaptation: 50,
    deep_research: 50,
  },
};
