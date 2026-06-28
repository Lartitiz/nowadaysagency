import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, CATEGORIES } from "@/lib/plan-limits";

/**
 * Pure logic tests for plan feature sets.
 * We replicate the feature arrays from use-user-plan.ts to test the logic
 * without needing React context providers.
 */

type Feature =
  | "branding" | "persona" | "audit_basic" | "generation_limited" | "community_read"
  | "generation_unlimited" | "import_stats" | "prospection" | "comments_generator"
  | "dm_generator" | "audit_unlimited" | "offer_workshop" | "lives" | "community_write"
  | "contacts_strategiques" | "routine_engagement" | "editorial_line" | "calendar"
  | "coaching" | "direct_channel" | "binome"
  | "whatsapp" | "assistant_chat";

const FREE_FEATURES: Feature[] = [
  "branding", "persona", "audit_basic", "generation_limited", "community_read",
  "calendar",
];

const OUTIL_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  "generation_unlimited", "import_stats", "prospection", "comments_generator",
  "dm_generator", "audit_unlimited", "offer_workshop", "lives", "community_write",
  "contacts_strategiques", "routine_engagement", "editorial_line",
];

const BINOME_FEATURES: Feature[] = [
  ...OUTIL_FEATURES,
  "coaching", "whatsapp", "assistant_chat", "direct_channel", "binome",
];

function canUseFeature(plan: string, feature: Feature, isAdmin = false): boolean {
  const p = isAdmin ? "binome" : plan;
  switch (p) {
    case "binome": return BINOME_FEATURES.includes(feature);
    case "outil": return OUTIL_FEATURES.includes(feature);
    default: return FREE_FEATURES.includes(feature);
  }
}

describe("useUserPlan — canUseFeature logic", () => {
  it("free plan allows branding", () => {
    expect(canUseFeature("free", "branding")).toBe(true);
  });

  it("free plan allows calendar (gratuit fort)", () => {
    expect(canUseFeature("free", "calendar")).toBe(true);
  });

  it("free plan denies generation_unlimited", () => {
    expect(canUseFeature("free", "generation_unlimited")).toBe(false);
  });

  it("free plan denies coaching", () => {
    expect(canUseFeature("free", "coaching")).toBe(false);
  });

  it("outil plan allows calendar", () => {
    expect(canUseFeature("outil", "calendar")).toBe(true);
  });

  it("outil plan denies coaching", () => {
    expect(canUseFeature("outil", "coaching")).toBe(false);
  });

  it("binome allows coaching", () => {
    expect(canUseFeature("binome", "coaching")).toBe(true);
  });

  it("binome allows all outil features", () => {
    for (const f of OUTIL_FEATURES) {
      expect(canUseFeature("binome", f)).toBe(true);
    }
  });

  it("free features are a subset of outil features", () => {
    for (const f of FREE_FEATURES) {
      expect(OUTIL_FEATURES).toContain(f);
    }
  });

  it("outil features are a subset of binome features", () => {
    for (const f of OUTIL_FEATURES) {
      expect(BINOME_FEATURES).toContain(f);
    }
  });

  it("admin bypasses limits — free user with isAdmin gets binome access", () => {
    expect(canUseFeature("free", "coaching", true)).toBe(true);
    expect(canUseFeature("free", "whatsapp", true)).toBe(true);
    expect(canUseFeature("free", "calendar", true)).toBe(true);
  });
});

describe("useUserPlan — plan hierarchy (PLAN_LIMITS)", () => {
  it("free total < outil total", () => {
    expect(PLAN_LIMITS.free.total).toBeLessThan(PLAN_LIMITS.outil.total);
  });

  it("free content < outil content", () => {
    expect(PLAN_LIMITS.free.content).toBeLessThan(PLAN_LIMITS.outil.content);
  });

  it("quality_max is gated to paid plans (free = 0)", () => {
    expect(PLAN_LIMITS.free.quality_max).toBe(0);
    expect(PLAN_LIMITS.outil.quality_max).toBeGreaterThan(0);
    expect(CATEGORIES).toContain("quality_max");
  });

  it("'studio' plan does not exist in PLAN_LIMITS (normalized to binome)", () => {
    expect(PLAN_LIMITS).not.toHaveProperty("studio");
  });

  it("normalizePlan maps 'studio' and 'now_pilot' to 'binome'", () => {
    // Réplique de normalizePlan() de use-user-plan.ts (évite d'importer le hook
    // React/Supabase dans un test pur).
    const normalizePlan = (raw: string): string => {
      if (raw === "studio" || raw === "now_pilot") return "binome";
      return ["free", "outil", "binome"].includes(raw) ? raw : "free";
    };
    expect(normalizePlan("studio")).toBe("binome");
    expect(normalizePlan("now_pilot")).toBe("binome");
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan("outil")).toBe("outil");
    expect(normalizePlan("unknown_plan")).toBe("free");
  });
});
