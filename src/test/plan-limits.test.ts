import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, CATEGORIES } from "@/lib/plan-limits";

const ALL_CATEGORIES = [...CATEGORIES, "total"] as const;

describe("PLAN_LIMITS", () => {
  it("free plan has a total of 60", () => {
    expect(PLAN_LIMITS.free.total).toBe(60);
  });

  it("now_pilot plan has a total of 300", () => {
    expect(PLAN_LIMITS.now_pilot.total).toBe(300);
  });

  it.each(Object.keys(PLAN_LIMITS))("plan '%s' has limits for all categories", (plan) => {
    for (const cat of ALL_CATEGORIES) {
      expect(PLAN_LIMITS[plan]).toHaveProperty(cat);
      expect(typeof PLAN_LIMITS[plan][cat]).toBe("number");
    }
  });

  it("free plan has coach: 15", () => {
    expect(PLAN_LIMITS.free.coach).toBe(15);
  });

  it("free plan has suggestion: 5", () => {
    expect(PLAN_LIMITS.free.suggestion).toBe(5);
  });

  it("now_pilot limits are >= outil limits for most categories", () => {
    const exceptions = ["dm_comment"]; // now_pilot has 50 vs outil 60, by design
    for (const cat of ALL_CATEGORIES) {
      if (exceptions.includes(cat)) continue;
      expect(PLAN_LIMITS.now_pilot[cat]).toBeGreaterThanOrEqual(PLAN_LIMITS.outil[cat]);
    }
  });
});
