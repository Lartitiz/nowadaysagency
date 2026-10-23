import { describe, expect, it } from "vitest";
import { CATCH_UP, splitList, withAnswer } from "@/components/branding/review/catch-up";
import { SECTIONS } from "@/components/branding/review/types";
import { sectionHasData } from "@/components/branding/review/SectionViews";

describe("questions de rattrapage des cartes vides", () => {
  it("chaque carte a sa question, et la réponse remplit bien la carte", () => {
    for (const s of SECTIONS) {
      expect(CATCH_UP[s.key].question.length).toBeGreaterThan(10);
      const data = withAnswer(s.key, { confidence: "medium" } as any, "  douce, naturelle et lumineuse  ");
      expect(sectionHasData(s.key, { [s.key]: data } as any)).toBe(true);
    }
  });

  it("découpe une liste écrite en ligne", () => {
    expect(splitList("les coulisses, mes conseils et les histoires de mes clients")).toEqual(["les coulisses", "mes conseils", "les histoires de mes clients"]);
    expect(splitList("un seul sujet")).toEqual(["un seul sujet"]);
  });

  it("une offre prend la première ligne comme nom", () => {
    expect(withAnswer("offers", undefined, "Atelier découverte, 45 €\nle samedi")).toEqual({ offers: [{ name: "Atelier découverte, 45 €" }] });
  });
});
