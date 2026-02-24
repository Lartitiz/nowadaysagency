import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, CATEGORIES } from "@/lib/plan-limits";

const ALL_CATEGORIES = [...CATEGORIES, "total"] as const;

describe("PLAN_LIMITS", () => {
  it("free plan has a total of 10", () => {
    expect(PLAN_LIMITS.free.total).toBe(10);
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

  it("free plan has 0 for suggestion, import, adaptation", () => {
    expect(PLAN_LIMITS.free.suggestion).toBe(0);
    expect(PLAN_LIMITS.free.import).toBe(0);
    expect(PLAN_LIMITS.free.adaptation).toBe(0);
  });

  it("now_pilot limits are >= outil limits for every category", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(PLAN_LIMITS.now_pilot[cat]).toBeGreaterThanOrEqual(PLAN_LIMITS.outil[cat]);
    }
  });
});
