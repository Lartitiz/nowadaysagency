import { describe, expect, it } from "vitest";
import {
  compte, habituelLabel, livePostsOf, multipleLabel, recyclableIds, tropTotLabel,
} from "@/features/stats/recent-posts";

describe("carte « Tes posts récents » : mise en mots", () => {
  it("écrit le multiple à la française", () => {
    expect(multipleLabel(3.1)).toBe("× 3,1");
    expect(multipleLabel(2)).toBe("× 2");
  });

  it("accorde enregistrements et partages", () => {
    expect(compte(0, "partage")).toBe("0 partage");
    expect(compte(1, "enregistrement")).toBe("1 enregistrement");
    expect(compte(27, "enregistrement")).toBe("27 enregistrements");
  });

  it("dit le post habituel quand la médiane existe", () => {
    expect(habituelLabel({ medianLikes: 42, medianSample: 18 }))
      .toBe("Un post habituel chez toi fait 42 likes (le milieu de tes 18 derniers posts).");
    expect(habituelLabel({ medianLikes: 42.5, medianSample: 12 })).toContain("42,5 likes");
  });

  it("explique l'absence de repère quand il n'y a pas assez de posts", () => {
    expect(habituelLabel({})).toContain("au moins 12 posts");
  });

  it("dit depuis quand un post trop récent est publié", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    expect(tropTotLabel("2026-11-23T10:00:00Z", now)).toBe("Publié il y a 3 jours. Verdict à 7 jours.");
    expect(tropTotLabel("2026-11-25T10:00:00Z", now)).toBe("Publié hier. Verdict à 7 jours.");
    expect(tropTotLabel("2026-11-26T10:00:00Z", now)).toBe("Publié aujourd'hui. Verdict à 7 jours.");
    expect(tropTotLabel(undefined, now)).toBe("Verdict à 7 jours.");
    // Relevé ancien : le post a dépassé ses 7 jours depuis, on ne promet plus un verdict « à 7 jours ».
    expect(tropTotLabel("2026-11-14T10:00:00Z", now)).toBe("Publié il y a 12 jours. Actualise tes stats pour voir son verdict.");
  });

  it("propose de recycler les posts sortis du lot, sinon les meilleurs à l'engagement", () => {
    const top = [{ id: "t1" }, { id: "t2" }, { id: "t3" }, { id: "t4" }];
    expect([...recyclableIds({ top, flop: [], recent: [{ id: "a", verdict: "sorti_du_lot" }, { id: "b", verdict: "au_dessus" }] })])
      .toEqual(["a"]);
    expect([...recyclableIds({ top, flop: [], recent: [{ id: "b", verdict: "au_dessus" }] })])
      .toEqual(["t1", "t2", "t3"]);
  });

  it("ne garde rien quand Instagram n'a renvoyé aucun post", () => {
    expect(livePostsOf({ topPosts: [], flopPosts: [], recentPosts: [] })).toBeNull();
    expect(livePostsOf(null)).toBeNull();
  });

  it("garde la médiane avec les posts pour que la carte survive au rechargement", () => {
    expect(livePostsOf({ recentPosts: [{ id: "a" }], medianLikes: 40, medianSample: 12 }))
      .toEqual({ top: [], flop: [], recent: [{ id: "a" }], medianLikes: 40, medianSample: 12 });
  });
});
