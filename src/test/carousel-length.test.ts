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
    expect(prompt).toContain("au moins 10 slides");
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
  it("does not accept a blank closing slide as a conclusion", () => {
    const blank = { slides: [...complete.slides.slice(0, -1), {role:"conclusion",title:"",body:""}] };
    expect(carouselStructureIssues(blank, {subject:"8 erreurs"})).toContain("La dernière slide est vide : complète la conclusion.");
  });
  it("reports wrong exact length and absent conclusion without manufacturing copy", () => {
    const issues = carouselStructureIssues({ slides: complete.slides.slice(0, 7) }, { subject: "8 erreurs", slide_count: 10 });
    expect(issues[0]).toContain("exactement 10");
    expect(issues.join(" ")).toContain("conclure");
  });
  it("caps the automatic length of PHOTO and MIX carousels at 10 slides, an explicit request still wins", () => {
    for (const carousel_type of ["photo", "mix"]) {
      expect(carouselLengthPrompt({ subject: "Les coulisses de l'atelier", carousel_type })).toContain("de 4 à 10 au maximum");
      expect(carouselLengthPrompt({ subject: "Les coulisses de l'atelier", carousel_type })).not.toContain("20");
      expect(carouselLengthPrompt({ subject: "Les coulisses de l'atelier", carousel_type })).not.toContain("UNE IDÉE PAR SLIDE");
      expect(carouselLengthPrompt({ subject: "10 erreurs à éviter", carousel_type })).toContain("prévois 10 slides");
      expect(carouselLengthPrompt({ subject: "10 erreurs à éviter", carousel_type })).toContain("regroupe les éléments");
      expect(carouselLengthPrompt({ subject: "Les coulisses", slide_count: 14, carousel_type })).toContain("exactement 14");
      const eleven = { slides: Array.from({ length: 11 }, (_, i) => ({ title: `T${i}`, body: "b", role: i === 10 ? "conclusion" : "dev" })) };
      expect(carouselStructureIssues(eleven, { subject: "Les coulisses", carousel_type }).join(" ")).toContain("10 au maximum");
      expect(carouselStructureIssues(eleven, { subject: "Les coulisses", slide_count: 11, carousel_type })).toEqual([]);
    }
  });
  it("lets an automatic TEXT carousel go up to 20 slides, one idea per slide, never shortened", () => {
    for (const carousel_type of [undefined, "prise_de_position", "storytelling"]) {
      const prompt = carouselLengthPrompt({ subject: "Oui, j'utilise l'IA générative", carousel_type });
      expect(prompt).toContain("de 4 à 20 au maximum");
      expect(prompt).toContain("UNE IDÉE PAR SLIDE");
      expect(prompt).toContain("sans raccourcir ni résumer");
      expect(prompt).toContain("se poursuivre sur la suivante");
      expect(prompt).not.toContain("limite de la publication directe");
      const sixteen = { slides: Array.from({ length: 16 }, (_, i) => ({ title: `T${i}`, body: "b", role: i === 15 ? "conclusion" : "dev" })) };
      expect(carouselStructureIssues(sixteen, { subject: "Les coulisses", carousel_type })).toEqual([]);
      const twentyOne = { slides: Array.from({ length: 21 }, (_, i) => ({ title: `T${i}`, body: "b", role: i === 20 ? "conclusion" : "dev" })) };
      expect(carouselStructureIssues(twentyOne, { subject: "Les coulisses", carousel_type }).join(" ")).toContain("20 au maximum");
    }
    // 12 erreurs : une slide par élément devient possible en texte (14 ≤ 20).
    expect(carouselLengthPrompt({ subject: "12 erreurs à éviter" })).toContain("Réserve une slide de développement par élément");
    expect(carouselLengthPrompt({ subject: "12 erreurs à éviter", carousel_type: "photo" })).toContain("regroupe les éléments");
  });
  it("keeps an explicit number above the automatic text rhythm", () => {
    const prompt = carouselLengthPrompt({ subject: "Les coulisses", slide_count: 7 });
    expect(prompt).toContain("exactement 7");
    expect(prompt).not.toContain("UNE IDÉE PAR SLIDE");
    const twelve = { slides: Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, body: "b", role: i === 11 ? "conclusion" : "dev" })) };
    expect(carouselStructureIssues(twelve, { subject: "Les coulisses", slide_count: 7 }).join(" ")).toContain("exactement 7");
    expect(carouselStructureIssues(twelve, { subject: "Un carrousel en 12 slides" })).toEqual([]);
  });
});
