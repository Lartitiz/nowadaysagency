import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, CATEGORIES } from "@/lib/plan-limits";

const ALL_CATEGORIES = [...CATEGORIES, "total"] as const;

describe("PLAN_LIMITS", () => {
  it("free plan has a total of 23 (compteur global ≈20 créations + 3 audits)", () => {
    expect(PLAN_LIMITS.free.total).toBe(23);
  });

  it("free plan caps audits at 3", () => {
    expect(PLAN_LIMITS.free.audit).toBe(3);
  });

  it("quality_max (carrousels Opus) est réservé au payant", () => {
    expect(PLAN_LIMITS.free.quality_max).toBe(0);
    expect(PLAN_LIMITS.outil.quality_max).toBe(20);
    expect(PLAN_LIMITS.binome.quality_max).toBe(40);
  });

  it.each(Object.keys(PLAN_LIMITS))("plan '%s' has limits for all categories", (plan) => {
    for (const cat of ALL_CATEGORIES) {
      expect(PLAN_LIMITS[plan]).toHaveProperty(cat);
      expect(typeof PLAN_LIMITS[plan][cat]).toBe("number");
    }
  });

  it("binome limits are >= outil limits for every category", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(PLAN_LIMITS.binome[cat]).toBeGreaterThanOrEqual(PLAN_LIMITS.outil[cat]);
    }
  });

  it("'studio' plan does not exist in PLAN_LIMITS", () => {
    expect(PLAN_LIMITS).not.toHaveProperty("studio");
  });

  it.each(Object.keys(PLAN_LIMITS))("plan '%s' has all limits >= 0", (plan) => {
    for (const cat of ALL_CATEGORIES) {
      expect(PLAN_LIMITS[plan][cat]).toBeGreaterThanOrEqual(0);
    }
  });
});
