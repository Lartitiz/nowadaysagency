import { describe, it, expect } from "vitest";
import {
  calculateWebsiteAuditScore,
  calculatePageByPageScore,
  getWebsiteScoreLabel,
  getCategoryRecommendations,
} from "@/lib/website-audit-score";

// 20 questions: q1..q20
const ALL_Q_IDS = Array.from({ length: 20 }, (_, i) => `q${i + 1}`);

function makeAnswers(value: string | null): Record<string, string | null> {
  return Object.fromEntries(ALL_Q_IDS.map((q) => [q, value]));
}

describe("calculateWebsiteAuditScore", () => {
  it("1. Toutes les réponses 'oui' → score 100", () => {
    const result = calculateWebsiteAuditScore(makeAnswers("oui"));
    expect(result.total).toBe(100);
  });

  it("2. Toutes les réponses 'non' → score 0", () => {
    const result = calculateWebsiteAuditScore(makeAnswers("non"));
    expect(result.total).toBe(0);
  });

  it("3. Toutes les réponses 'pas_sure' → score intermédiaire (60 car Math.round(5/2)=3)", () => {
    const result = calculateWebsiteAuditScore(makeAnswers("pas_sure"));
    expect(result.total).toBe(60);
  });

  it("4. Réponses null → score 0", () => {
    const result = calculateWebsiteAuditScore(makeAnswers(null));
    expect(result.total).toBe(0);
  });

  it("5. Mix de réponses → score proportionnel correct", () => {
    // 10 oui (50pts) + 10 non (0pts) sur 100 max → 50
    const answers: Record<string, string | null> = {};
    ALL_Q_IDS.forEach((q, i) => {
      answers[q] = i < 10 ? "oui" : "non";
    });
    const result = calculateWebsiteAuditScore(answers);
    expect(result.total).toBe(50);
  });

  it("6. Chaque catégorie retourne un score entre 0 et son max", () => {
    const result = calculateWebsiteAuditScore(makeAnswers("oui"));
    for (const cat of Object.values(result.categories)) {
      expect(cat.score).toBeGreaterThanOrEqual(0);
      expect(cat.score).toBeLessThanOrEqual(cat.max);
    }
  });

  it("7. Le score total est la somme normalisée des catégories", () => {
    const answers: Record<string, string | null> = {};
    ALL_Q_IDS.forEach((q, i) => {
      answers[q] = i % 3 === 0 ? "oui" : i % 3 === 1 ? "pas_sure" : "non";
    });
    const result = calculateWebsiteAuditScore(answers);
    const rawSum = Object.values(result.categories).reduce((s, c) => s + c.score, 0);
    const rawMax = Object.values(result.categories).reduce((s, c) => s + c.max, 0);
    expect(result.total).toBe(Math.round((rawSum / rawMax) * 100));
  });

  it("8. Le score total est toujours entre 0 et 100", () => {
    for (const val of ["oui", "non", "pas_sure", null, "random"]) {
      const result = calculateWebsiteAuditScore(makeAnswers(val));
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    }
  });

  it("6 catégories sont présentes", () => {
    const result = calculateWebsiteAuditScore(makeAnswers("oui"));
    const ids = Object.keys(result.categories);
    expect(ids).toEqual(
      expect.arrayContaining(["clarte", "copywriting", "parcours", "confiance", "mobile", "visuel"]),
    );
    expect(ids).toHaveLength(6);
  });
});

describe("calculatePageByPageScore", () => {
  it("retourne 0 si aucune page", () => {
    expect(calculatePageByPageScore({}).total).toBe(0);
  });

  it("calcule le score par page", () => {
    const answers = {
      accueil: { p1: "oui", p2: "oui" },
      offres: { p1: "non", p2: "non" },
    };
    const result = calculatePageByPageScore(answers);
    expect(result.categories.accueil.score).toBe(10);
    expect(result.categories.offres.score).toBe(0);
    expect(result.total).toBe(50); // 10/20
  });
});

describe("getWebsiteScoreLabel", () => {
  it("score >= 80 → Excellent", () => {
    expect(getWebsiteScoreLabel(85).label).toBe("Excellent");
  });
  it("score >= 60 → Bien", () => {
    expect(getWebsiteScoreLabel(65).label).toBe("Bien");
  });
  it("score >= 40 → À améliorer", () => {
    expect(getWebsiteScoreLabel(45).label).toBe("À améliorer");
  });
  it("score < 40 → Prioritaire", () => {
    expect(getWebsiteScoreLabel(20).label).toBe("Prioritaire");
  });
});

describe("getCategoryRecommendations", () => {
  it("retourne des recommandations haute priorité si score < 50%", () => {
    const recs = getCategoryRecommendations("clarte", 5, 20);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some((r) => r.priority === "haute")).toBe(true);
  });

  it("retourne recommandation moyenne si score entre 50% et 75%", () => {
    const recs = getCategoryRecommendations("clarte", 12, 20);
    expect(recs.some((r) => r.priority === "moyenne")).toBe(true);
  });

  it("retourne recommandation basse si score 100%", () => {
    const recs = getCategoryRecommendations("clarte", 20, 20);
    expect(recs.some((r) => r.priority === "basse")).toBe(true);
  });

  it("retourne un tableau vide si catégorie inconnue avec bon score", () => {
    const recs = getCategoryRecommendations("inconnu", 20, 20);
    expect(recs).toHaveLength(0);
  });

  it("gère max = 0 sans crash", () => {
    const recs = getCategoryRecommendations("clarte", 0, 0);
    expect(Array.isArray(recs)).toBe(true);
  });
});
