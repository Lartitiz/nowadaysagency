import { describe, expect, it } from "vitest";
import { carouselLength, carouselLengthPrompt, carouselStructureIssues } from "../../supabase/functions/_shared/carousel-length";
import { textWritingPrompt } from "../../supabase/functions/carousel-ai/variant-writing";
const complete = { slides: [
  { title: "8 erreurs dans ta communication", role: "hook" },
  ...Array.from({ length: 8 }, (_, i) => ({ title: `${i + 1}. Une erreur distincte`, body: "Son explication et un geste concret.", role: "erreur" })),
  { title: "Choisis un premier geste", body: "Relis ton prochain contenu avant de le publier.", role: "conclusion" },
] };
describe("carousel length and completeness", () => {
  it("adapts eight errors to ten slides instead of imposing seven", () => {
    const body = { subject: "Les 8 erreurs de communication" };
    expect(carouselLength(body)).toEqual({ exact: undefined, items: 8 });
    const prompt = textWritingPrompt(body, false, "");
    expect(prompt).toContain("prévois 10 slides");
    expect(prompt).not.toContain("exactement 7 slides");
    expect(carouselStructureIssues(complete, body)).toEqual([]);
  });
  it("does not treat figures or years as a list length", () => {
    for (const subject of ["Mon chiffre de 8 %", "En 2026, je lance mon offre", "J'ai travaillé pendant 8 ans"]) expect(carouselLength({ subject }).items).toBeUndefined();
    expect(carouselLengthPrompt({ subject: "Un sujet court" })).toContain("aucun nombre fixe");
  });
  it("honors French words, explicit slides, and custom confirmed plans", () => {
    expect(carouselLength({ subject: "Les huit erreurs" }).items).toBe(8);
    expect(carouselLength({ subject: "Un carrousel de dix slides" }).exact).toBe(10);
    expect(carouselLength({ subject: "8 erreurs en 10 slides", slide_count: 4 }).exact).toBe(4);
    expect(carouselLength({ subject: "8 erreurs", slide_count: 10, confirmed_structure: [{}, {}, {}] }).exact).toBe(3);
    expect(carouselStructureIssues({ slides: [{}, {}, {}] }, { subject: "8 erreurs", confirmed_structure: [{}, {}, {}] })).toEqual([]);
  });
  it("detects missing errors even when the coverage promises eight", () => {
    const bad = { slides: complete.slides.filter((s) => !s.title.startsWith("8.")) };
    expect(carouselStructureIssues(bad, { subject: "8 erreurs" })).toContain("Éléments de la liste non repérés : 8. Numérote et explique chaque élément.");
  });
  it("accepts grouped numbered items when a shorter length is explicit", () => {
    const slides = [complete.slides[0], { body: "1. Première erreur\n2. Deuxième erreur\n3. Troisième erreur" }, { body: "4. Quatrième erreur\n5. Cinquième erreur\n6. Sixième erreur\n7. Septième erreur\n8. Huitième erreur" }, complete.slides.at(-1)];
    expect(carouselStructureIssues({ slides }, { subject: "8 erreurs", slide_count: 4 })).toEqual([]);
  });
  it("reports wrong exact length and absent conclusion without manufacturing copy", () => {
    const issues = carouselStructureIssues({ slides: complete.slides.slice(0, 7) }, { subject: "8 erreurs", slide_count: 10 });
    expect(issues[0]).toContain("exactement 10");
    expect(issues.join(" ")).toContain("conclure");
  });
});
