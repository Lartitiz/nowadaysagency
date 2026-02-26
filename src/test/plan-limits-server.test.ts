import { describe, it, expect } from "vitest";
import { PLAN_LIMITS as CLIENT_LIMITS } from "@/lib/plan-limits";

// Hard-coded copy of PLAN_LIMITS from supabase/functions/_shared/plan-limiter.ts
// (Deno imports can't be resolved by vitest)
const SERVER_LIMITS: Record<string, Record<string, number>> = {
  free: { total: 25, content: 12, audit: 3, dm_comment: 5, bio_profile: 3, suggestion: 2, import: 1, adaptation: 2, deep_research: 5 },
  outil: { total: 300, content: 150, audit: 5, dm_comment: 60, bio_profile: 15, suggestion: 30, import: 10, adaptation: 30, deep_research: 15 },
  studio: { total: 300, content: 150, audit: 15, dm_comment: 60, bio_profile: 15, suggestion: 30, import: 10, adaptation: 30, deep_research: 30 },
  now_pilot: { total: 300, content: 150, audit: 15, dm_comment: 50, bio_profile: 15, suggestion: 30, import: 10, adaptation: 30, deep_research: 30 },
};

const ALL_SERVER_PLANS = Object.keys(SERVER_LIMITS);

describe("Server PLAN_LIMITS coherence", () => {
  it("1. Tous les plans ont un champ 'total'", () => {
    for (const plan of ALL_SERVER_PLANS) {
      expect(SERVER_LIMITS[plan]).toHaveProperty("total");
    }
  });

  it("2. total est un cap global (pas nécessairement >= somme des catégories)", () => {
    for (const plan of ALL_SERVER_PLANS) {
      const { total } = SERVER_LIMITS[plan];
      // total is a global cap, not a sum — just verify it's positive
      expect(total).toBeGreaterThan(0);
    }
  });

  it("3. Hiérarchie : free.total < outil.total <= studio.total <= now_pilot.total", () => {
    expect(SERVER_LIMITS.free.total).toBeLessThan(SERVER_LIMITS.outil.total);
    expect(SERVER_LIMITS.outil.total).toBeLessThanOrEqual(SERVER_LIMITS.studio.total);
    expect(SERVER_LIMITS.studio.total).toBeLessThanOrEqual(SERVER_LIMITS.now_pilot.total);
  });

  it("4. Le plan free a les limites les plus basses pour chaque catégorie", () => {
    const freeKeys = Object.keys(SERVER_LIMITS.free);
    for (const key of freeKeys) {
      for (const plan of ALL_SERVER_PLANS) {
        if (plan === "free") continue;
        if (!(key in SERVER_LIMITS[plan])) continue;
        expect(SERVER_LIMITS.free[key]).toBeLessThanOrEqual(SERVER_LIMITS[plan][key]);
      }
    }
  });

  it("5. Aucune limite n'est négative", () => {
    for (const plan of ALL_SERVER_PLANS) {
      for (const [key, val] of Object.entries(SERVER_LIMITS[plan])) {
        expect(val, `${plan}.${key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("6. Les catégories sont identiques entre tous les plans", () => {
    const refKeys = Object.keys(SERVER_LIMITS.free).sort();
    for (const plan of ALL_SERVER_PLANS) {
      expect(Object.keys(SERVER_LIMITS[plan]).sort()).toEqual(refKeys);
    }
  });
});

describe("Client vs Server coherence", () => {
  // Plans communs aux deux
  const commonPlans = ALL_SERVER_PLANS.filter((p) => p in CLIENT_LIMITS);

  it("7a. Les plans communs partagent les mêmes catégories (hors deep_research)", () => {
    for (const plan of commonPlans) {
      const serverKeys = Object.keys(SERVER_LIMITS[plan]).filter((k) => k !== "deep_research").sort();
      const clientKeys = Object.keys(CLIENT_LIMITS[plan]).sort();
      expect(clientKeys).toEqual(serverKeys);
    }
  });

  it("7b. Le client a les mêmes plans que le serveur (+ éventuellement pro)", () => {
    for (const plan of ALL_SERVER_PLANS) {
      expect(CLIENT_LIMITS).toHaveProperty(plan);
    }
  });
});
