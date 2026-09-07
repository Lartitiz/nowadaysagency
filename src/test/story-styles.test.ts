import { describe, it, expect } from "vitest";
import {
  STORY_ASSEMBLAGES,
  STORY_FONTS_HREF,
  estimateLines,
  getStoryAssemblage,
  resolveStoryStyle,
} from "@/lib/story-styles";

describe("story-styles", () => {
  it("propose 6 assemblages A→F, A par défaut", () => {
    expect(STORY_ASSEMBLAGES.map((a) => a.key)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(getStoryAssemblage(null).key).toBe("A");
    expect(getStoryAssemblage("zz").key).toBe("A");
    expect(getStoryAssemblage("b").key).toBe("B");
  });

  it("chaque police utilisée est chargée par la feuille Google Fonts", () => {
    const families = new Set<string>();
    for (const a of STORY_ASSEMBLAGES) {
      for (const st of [a.title, a.body, a.aside, ...(a.quote ? [a.quote] : [])]) {
        families.add(st.font.split(",")[0].replace(/'/g, "").trim());
      }
    }
    for (const f of families) {
      expect(STORY_FONTS_HREF, f).toContain(`family=${f.replace(/\s+/g, "+")}`);
    }
  });

  it("aucun assemblage n'utilise le texte nu avec ombre (décision 07/09)", () => {
    for (const a of STORY_ASSEMBLAGES) {
      for (const st of [a.title, a.body, a.aside, ...(a.quote ? [a.quote] : [])]) {
        expect(st.mode, `${a.key}`).not.toBe("nu");
      }
    }
  });

  it("normalise les réglages persistés (valeurs inconnues → défauts)", () => {
    expect(resolveStoryStyle(null)).toEqual({ assemblage: "A", pillColor: "primary", corners: "courts", align: "auto" });
    expect(
      resolveStoryStyle({ story_assemblage: "d", story_pill_color: "ink", story_corners: "droits", story_align: "gauche" }),
    ).toEqual({ assemblage: "D", pillColor: "ink", corners: "droits", align: "gauche" });
    expect(resolveStoryStyle({ story_pill_color: "rose", story_corners: "ronds", story_align: "milieu" })).toMatchObject({
      pillColor: "primary",
      corners: "courts",
      align: "auto",
    });
  });

  it("estime les lignes : une accroche courte tient sur 1-2 lignes, un pavé déborde", () => {
    const body = getStoryAssemblage("A").body;
    expect(estimateLines("Bon, je vous montre un truc", body)).toBeLessThanOrEqual(2);
    expect(
      estimateLines("Pendant longtemps je faisais sécher trop vite, et forcément, résultat : des fissures partout, sur toutes mes pièces.", body),
    ).toBeGreaterThan(2);
    expect(estimateLines("", body)).toBe(0);
  });
});
