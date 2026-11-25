import { describe, it, expect } from "vitest";
import { cartesStatsLinkedIn } from "@/features/stats/linkedin-stats-cartes";

// Relevé réel du 24/11/2026 (compte de Laetitia) : un repost retiré pendant les
// 30 jours, LinkedIn renvoie -1 et l'écran affichait « -1 Reposts ».
const RELEVE = {
  followers: 3618, followersGained30d: 21, fetchedAt: "2026-11-24T10:00:00.000Z",
  postAnalytics30d: { impressions: 169, membersReached: 97, reactions: 1, comments: 0, reshares: -1, linkClicks: 0 },
};
const valeur = (cartes: { label: string; value: number }[], label: string) => cartes.find((c) => c.label === label)?.value;

describe("cartesStatsLinkedIn", () => {
  it("affiche 0 repost au lieu de -1 pour un relevé déjà enregistré", () => {
    const cartes = cartesStatsLinkedIn(RELEVE);
    expect(valeur(cartes, "Reposts")).toBe(0);
    expect(cartes.map((c) => c.value)).toEqual([3618, 21, 169, 97, 1, 0, 0, 0]);
  });

  it("ne laisse passer aucun nombre négatif, quel que soit le compteur", () => {
    const cartes = cartesStatsLinkedIn({
      followers: -3, followersGained30d: -12,
      postAnalytics30d: { impressions: -1, membersReached: -1, reactions: -4, comments: -2, reshares: -1, linkClicks: -1 },
    });
    expect(cartes).toHaveLength(8);
    expect(cartes.every((c) => c.value === 0)).toBe(true);
  });

  it("ne crée pas de carte pour un chiffre absent", () => {
    const cartes = cartesStatsLinkedIn({ followers: 10, postAnalytics30d: { reshares: null, comments: undefined } });
    expect(cartes).toEqual([{ label: "Abonnés", value: 10 }]);
    expect(cartesStatsLinkedIn(null)).toEqual([]);
  });
});
