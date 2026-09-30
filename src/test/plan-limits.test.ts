import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, CATEGORIES, HARD_CAP_CATEGORIES, isFairUsePlan } from "@/lib/plan-limits";

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

  it("grille Premium du 01/10/2026 : 20 carrousels, 30 images, 3 vidéos, garde-fou 200", () => {
    expect(PLAN_LIMITS.outil.carousel).toBe(20);
    expect(PLAN_LIMITS.outil.photo_retouch).toBe(30);
    expect(PLAN_LIMITS.outil.video).toBe(3);
    expect(PLAN_LIMITS.outil.total).toBe(200);
  });

  it("Binôme = le double du Premium ; le gratuit n'a pas de vidéo et 3 carrousels", () => {
    expect(PLAN_LIMITS.binome.carousel).toBe(40);
    expect(PLAN_LIMITS.binome.photo_retouch).toBe(60);
    expect(PLAN_LIMITS.binome.video).toBe(6);
    expect(PLAN_LIMITS.free.video).toBe(0);
    expect(PLAN_LIMITS.free.carousel).toBe(3);
  });

  it("les plafonds durs ne sont jamais au-dessus du garde-fou global", () => {
    for (const plan of Object.keys(PLAN_LIMITS)) {
      for (const cat of HARD_CAP_CATEGORIES) {
        expect(PLAN_LIMITS[plan][cat]).toBeLessThanOrEqual(PLAN_LIMITS[plan].total);
      }
    }
  });

  it("isFairUsePlan : payant et admin affichés « Illimité », gratuit non", () => {
    expect(isFairUsePlan("outil", 200)).toBe(true);
    expect(isFairUsePlan("binome", 400)).toBe(true);
    expect(isFairUsePlan("admin", 9999)).toBe(true);
    expect(isFairUsePlan("free", 23)).toBe(false);
    expect(isFairUsePlan("free", 9999)).toBe(true);
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
