import { describe, it, expect } from "vitest";
import { calculateAuditScore, getScoreLabel, ProfileForScore } from "@/lib/audit-score";

describe("calculateAuditScore", () => {
  it("returns 0 when all data is empty", () => {
    const empty: ProfileForScore = {};
    expect(calculateAuditScore(empty)).toBe(0);
  });

  it("returns 0 for explicitly null fields", () => {
    const profile: ProfileForScore = {
      instagram_display_name: null,
      instagram_bio: null,
      instagram_bio_link: null,
      instagram_photo_url: null,
      instagram_highlights: null,
      instagram_pinned_posts: null,
      instagram_pillars: null,
      last_audit_feed_score: null,
    };
    expect(calculateAuditScore(profile)).toBe(0);
  });

  it("returns maximum score when all data is perfectly filled", () => {
    const perfect: ProfileForScore = {
      instagram_photo_url: "https://example.com/photo.jpg",
      instagram_display_name: "Marie | Coach bien-être",
      instagram_bio: "✨ Coach certifiée en bien-être holistique\n💪 Je t'aide à retrouver ton énergie\n🌿 Méthode naturelle & bienveillante\n👇 Réserve ton appel découverte",
      instagram_bio_link: "https://example.com",
      instagram_highlights: ["Avis", "Méthode", "FAQ", "Résultats", "À propos"],
      instagram_pinned_posts: [
        { description: "Post 1" },
        { description: "Post 2" },
        { description: "Post 3" },
      ],
      instagram_pillars: ["Bien-être", "Nutrition", "Mindset"],
      last_audit_feed_score: 15,
    };
    expect(calculateAuditScore(perfect)).toBe(100);
  });

  it("always returns a score between 0 and 100", () => {
    const overloaded: ProfileForScore = {
      instagram_photo_url: "https://example.com/photo.jpg",
      instagram_display_name: "Marie | Coach",
      instagram_bio: "A very long bio\nwith multiple lines\nand a CTA 👇\nthat fills the space well and goes beyond eighty characters easily",
      instagram_bio_link: "https://example.com",
      instagram_highlights_count: 10,
      instagram_pinned_posts: [{ description: "1" }, { description: "2" }, { description: "3" }, { description: "4" }],
      instagram_pillars: ["A", "B", "C", "D", "E"],
      last_audit_feed_score: 50,
    };
    const score = calculateAuditScore(overloaded);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores partial profiles correctly", () => {
    const partial: ProfileForScore = {
      instagram_display_name: "Marie",
      instagram_bio: "Coach bien-être",
      instagram_bio_link: "https://example.com",
    };
    const score = calculateAuditScore(partial);
    expect(score).toBe(15);
  });
});

describe("getScoreLabel", () => {
  it("returns Prioritaire for scores below 40", () => {
    expect(getScoreLabel(0).label).toBe("Prioritaire");
    expect(getScoreLabel(39).label).toBe("Prioritaire");
  });

  it("returns À améliorer for scores 40-69", () => {
    expect(getScoreLabel(40).label).toBe("À améliorer");
    expect(getScoreLabel(69).label).toBe("À améliorer");
  });

  it("returns Bien for scores 70-84", () => {
    expect(getScoreLabel(70).label).toBe("Bien");
    expect(getScoreLabel(84).label).toBe("Bien");
  });

  it("returns Excellent for scores 85+", () => {
    expect(getScoreLabel(85).label).toBe("Excellent");
    expect(getScoreLabel(100).label).toBe("Excellent");
  });
});
