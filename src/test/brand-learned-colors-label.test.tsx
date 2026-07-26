import { describe, it, expect } from "vitest";
import { colorsLabel } from "@/components/onboarding/BrandLearnedSection";

/* Carte « Ce que j'ai appris de ta marque » (fin d'onboarding).
   Elle affichait les couleurs de la fiche à valider sous un « Tes couleurs »
   à plat — y compris quand l'IA les avait INVENTÉES (cas 2 du prompt
   diagnostic-enrichment, confidence "low"). Une invention présentée comme une
   détection = fallback silencieux. Même règle que BrandingReview/CharterSection. */

describe("colorsLabel — provenance honnête des couleurs à l'onboarding", () => {
  it("low → « palette proposée », jamais « tes couleurs » ni « détectées »", () => {
    const label = colorsLabel("low");
    expect(label).toMatch(/palette proposée d'après ton univers/i);
    expect(label).not.toMatch(/détectée/i);
    expect(label).not.toMatch(/^tes couleurs$/i);
  });

  it("high → annonce la détection sur le site", () => {
    expect(colorsLabel("high")).toMatch(/détectées sur ton site/i);
  });

  it("medium → annonce une estimation, pas une détection", () => {
    const label = colorsLabel("medium");
    expect(label).toMatch(/estimées/i);
    expect(label).not.toMatch(/détectées sur ton site/i);
  });

  it("confidence inconnue → traitée comme une proposition (jamais optimiste)", () => {
    expect(colorsLabel("n'importe quoi")).toMatch(/palette proposée/i);
  });

  it("null (couleurs déjà appliquées à l'espace) → « Tes couleurs », sans réserve", () => {
    expect(colorsLabel(null)).toBe("Tes couleurs");
  });
});
