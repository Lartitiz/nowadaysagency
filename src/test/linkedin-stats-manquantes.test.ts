import { describe, it, expect } from "vitest";
import { statsLinkedInManquantes } from "@/features/stats/linkedin-stats-manquantes";

// Réponse réelle du 23/10/2026 : LinkedIn renvoie 500 sur les deux mesures « depuis le contenu ».
const REEL = {
  followers: 3605, followersGained30d: 33, partial: true,
  postAnalytics30d: { saves: 0, sends: 0, comments: 10, reshares: 0, reactions: 43, linkClicks: 0, impressions: 2109, membersReached: 1071 },
};

describe("statsLinkedInManquantes", () => {
  it("pas d'avertissement quand seules les mesures non affichées manquent (cas du 23/10/2026)", () => {
    expect(statsLinkedInManquantes(REEL)).toEqual([]);
  });

  it("un 0 est un vrai chiffre, pas un manque", () => {
    expect(statsLinkedInManquantes({ ...REEL, followersGained30d: 0 })).toEqual([]);
  });

  it("nomme les chiffres affichés qui manquent", () => {
    const { impressions, comments, ...reste } = REEL.postAnalytics30d;
    expect(statsLinkedInManquantes({ ...REEL, followers: undefined, postAnalytics30d: reste })).toEqual(["abonnés", "impressions", "commentaires"]);
  });

  it("réponse vide : tout manque", () => {
    expect(statsLinkedInManquantes({})).toHaveLength(8);
  });
});
