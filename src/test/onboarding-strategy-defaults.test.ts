import { describe, expect, it } from "vitest";
import { calculateBrandingCompletion } from "@/lib/branding-completion";
import { ONBOARDING_GOAL_TO_PILLAR, isOnboardingPillar, withoutOnboardingDefaults } from "@/lib/onboarding-strategy-defaults";

describe("onboarding strategy defaults", () => {
  it("a fresh account's onboarding strategy does not count as something she started", () => {
    const strategy = { pillar_major: "Organisation & régularité", step_1_hidden_facets: "Priorité : automatiser et batcher pour gagner du temps" };
    expect(calculateBrandingCompletion({ strategy } as any).strategy).toBeGreaterThan(0);
    expect(calculateBrandingCompletion({ strategy: withoutOnboardingDefaults(strategy) } as any).strategy).toBe(0);
  });
  it("keeps what the person wrote", () => {
    const strategy = { pillar_major: "Mon pilier", step_1_hidden_facets: "Mes facettes", creative_concept: null };
    expect(withoutOnboardingDefaults(strategy)).toEqual(strategy);
    expect(isOnboardingPillar("Mon pilier")).toBe(false);
  });
  it("recognises every label the onboarding can write", () => {
    for (const label of Object.values(ONBOARDING_GOAL_TO_PILLAR)) expect(isOnboardingPillar(` ${label} `)).toBe(true);
    expect(withoutOnboardingDefaults(null)).toBeNull();
  });
});
