import { describe, it, expect } from "vitest";
import { calculateBrandingCompletion, BrandingRawData } from "@/lib/branding-completion";

const EMPTY_DATA: BrandingRawData = {
  storytellingList: null,
  persona: null,
  proposition: null,
  brandProfile: null,
  strategy: null,
};

const SECTIONS = ["storytelling", "persona", "proposition", "tone", "strategy"] as const;

describe("calculateBrandingCompletion", () => {
  it("returns 0 for all sections when data is empty/null", () => {
    const result = calculateBrandingCompletion(EMPTY_DATA);
    for (const section of SECTIONS) {
      expect(result[section]).toBe(0);
    }
    expect(result.total).toBe(0);
  });

  it("total is the average of the 5 sections", () => {
    const data: BrandingRawData = {
      storytellingList: [{ id: "1" }], // 100
      persona: null,                    // 0
      proposition: null,                // 0
      brandProfile: null,               // 0
      strategy: null,                   // 0
    };
    const result = calculateBrandingCompletion(data);
    const expectedTotal = Math.round((result.storytelling + result.persona + result.proposition + result.tone + result.strategy) / 5);
    expect(result.total).toBe(expectedTotal);
  });

  it("each section returns a number between 0 and 100", () => {
    const fullData: BrandingRawData = {
      storytellingList: [{ id: "1", step_7_polished: "text" }],
      persona: {
        step_1_frustrations: "a",
        step_2_transformation: "b",
        step_3a_objections: "c",
        step_4_beautiful: "d",
        step_5_actions: "e",
      },
      proposition: {
        step_1_what: "a",
        step_2a_process: "b",
        step_3_for_whom: "c",
        version_final: "d",
      },
      brandProfile: {
        voice_description: "a",
        combat_cause: "b",
        tone_register: "c",
        key_expressions: "d",
        things_to_avoid: "e",
        target_verbatims: "f",
        channels: ["instagram"],
      },
      strategy: {
        facet_1: "a",
        pillar_major: "b",
        creative_concept: "c",
      },
    };
    const result = calculateBrandingCompletion(fullData);
    for (const section of SECTIONS) {
      expect(result[section]).toBeGreaterThanOrEqual(0);
      expect(result[section]).toBeLessThanOrEqual(100);
    }
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("partial data gives intermediate scores", () => {
    const partial: BrandingRawData = {
      storytellingList: [],             // 0 — empty array
      persona: {
        step_1_frustrations: "filled",
        step_2_transformation: "filled",
        step_3a_objections: null,
        step_4_beautiful: null,
        step_5_actions: null,
      },
      proposition: {
        step_1_what: "filled",
        step_2a_process: null,
        step_2b_values: null,
        step_3_for_whom: "filled",
        version_final: null,
        version_pitch_naturel: null,
      },
      brandProfile: {
        voice_description: "filled",
        combat_cause: null,
        combat_fights: null,
        tone_register: null,
        tone_level: null,
        tone_style: null,
        tone_humor: null,
        tone_engagement: null,
        key_expressions: null,
        things_to_avoid: null,
        target_verbatims: null,
        channels: null,
      },
      strategy: null,
    };
    const result = calculateBrandingCompletion(partial);

    expect(result.storytelling).toBe(0);
    expect(result.persona).toBe(40);       // 2/5
    expect(result.proposition).toBe(50);   // 2/4
    expect(result.tone).toBe(14);          // 1/7 → Math.round(14.28)
    expect(result.strategy).toBe(0);
    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBeLessThan(100);
  });
});
