import { describe, it, expect } from "vitest";
import { PLAN_LIMITS as CLIENT_LIMITS } from "@/lib/plan-limits";

// Hard-coded copy of PLAN_LIMITS from supabase/functions/_shared/plan-limiter.ts
// (Deno imports can't be resolved by vitest). MUST stay in sync with the server.
const SERVER_LIMITS: Record<string, Record<string, number>> = {
  free: { total: 23, content: 23, audit: 3, dm_comment: 23, bio_profile: 23, suggestion: 23, coach: 23, import: 23, adaptation: 23, deep_research: 23, photo_retouch: 5, quality_max: 0 },
  outil: { total: 9999, content: 9999, audit: 9999, dm_comment: 9999, bio_profile: 9999, suggestion: 9999, coach: 9999, import: 9999, adaptation: 9999, deep_research: 9999, photo_retouch: 50, quality_max: 20 },
  binome: { total: 9999, content: 9999, audit: 9999, dm_comment: 9999, bio_profile: 9999, suggestion: 9999, coach: 9999, import: 9999, adaptation: 9999, deep_research: 9999, photo_retouch: 100, quality_max: 40 },
};

const ALL_SERVER_PLANS = Object.keys(SERVER_LIMITS);

describe("Server PLAN_LIMITS coherence", () => {
  it("1. Tous les plans ont un champ 'total'", () => {
    for (const plan of ALL_SERVER_PLANS) {
      expect(SERVER_LIMITS[plan]).toHaveProperty("total");
    }
  });

  it("2. total est un cap global positif", () => {
    for (const plan of ALL_SERVER_PLANS) {
      expect(SERVER_LIMITS[plan].total).toBeGreaterThan(0);
    }
  });

  it("3. Hiérarchie : free.total < outil.total <= binome.total", () => {
    expect(SERVER_LIMITS.free.total).toBeLessThan(SERVER_LIMITS.outil.total);
    expect(SERVER_LIMITS.outil.total).toBeLessThanOrEqual(SERVER_LIMITS.binome.total);
  });

  it("4. Le plan free a les limites les plus basses (ou égales) pour chaque catégorie", () => {
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
  const commonPlans = ALL_SERVER_PLANS.filter((p) => p in CLIENT_LIMITS);

  it("7a. Les plans communs partagent exactement les mêmes catégories", () => {
    for (const plan of commonPlans) {
      const serverKeys = Object.keys(SERVER_LIMITS[plan]).sort();
      const clientKeys = Object.keys(CLIENT_LIMITS[plan]).sort();
      expect(clientKeys).toEqual(serverKeys);
    }
  });

  it("7b. Le client a les mêmes plans que le serveur", () => {
    for (const plan of ALL_SERVER_PLANS) {
      expect(CLIENT_LIMITS).toHaveProperty(plan);
    }
  });

  it("7c. Le client a exactement les mêmes valeurs que le serveur", () => {
    for (const plan of commonPlans) {
      expect(CLIENT_LIMITS[plan]).toEqual(SERVER_LIMITS[plan]);
    }
  });
});
