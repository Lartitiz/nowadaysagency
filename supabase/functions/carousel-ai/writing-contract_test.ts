import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCarouselWritingSystem, carouselStructureGuide } from "./writing-contract.ts";
import { photoWritingPrompt, mixWritingPrompt, textWritingPrompt, NEWS_WRITING } from "./variant-writing.ts";

Deno.test("contrat : voix et données transmises, aucune persona imposée", () => {
  const prompt = buildCarouselWritingSystem("VOIX_VALIDÉE : vouvoiement, humour sec", true, "IDENTITÉ_WEB_DESIGNER", "CLARTÉ_SOURCE");
  for (const value of ["VOIX_VALIDÉE", "IDENTITÉ_WEB_DESIGNER", "CLARTÉ_SOURCE", "humour", "nuances", "80", "cta"]) assert(prompt.includes(value), value);
  assert(!prompt.includes("ton Nowadays"));
});

for (const type of ["tips", "tutoriel", "prise_de_position", "mythe_realite", "storytelling", "etude_de_cas", "checklist", "comparatif", "before_after", "promo", "coulisses", "photo_dump", "text"]) {
  Deno.test(`structure conservée sans scénario fabriqué : ${type}`, () => {
    const guide = carouselStructureGuide(type);
    assert(guide.length > 80);
    assert(guide.includes("structure confirmée"));
    for (const invented of ["Voici ce qui change tout", "j'ai testé les deux", "la leçon universelle", "[Prénom]", "[durée]"]) assert(!guide.includes(invented));
  });
}

for (const linkedIn of [false, true]) for (const kind of ["photo", "mix"]) {
  Deno.test(`format ${kind}, LinkedIn=${linkedIn} : contraintes et contexte conservés`, () => {
    const body = { subject: "SUJET_FIXÉ", subject_details: "DÉTAIL", photo_description: "PHOTO_FOND", carousel_type: kind, slide_count: 4, selected_offer: "OFFRE", editorial_angle: "ANGLE", content_structure: "STRUCTURE", narrative_thread: "FIL", deepening_answers: { voix: "MOTS_FOURNIS" }, slide_structure: [{ type: "text_only", slide_number: 1 }] };
    const p = kind === "photo" ? photoWritingPrompt(body, linkedIn, "STRUCTURE_CONFIRMÉE") : mixWritingPrompt(body, linkedIn, "STRUCTURE_CONFIRMÉE", "DIRECTIVES_TEXTE_FIRST");
    for (const x of ["SUJET_FIXÉ", "DÉTAIL", "PHOTO_FOND", "OFFRE", "ANGLE", "STRUCTURE", "FIL", "MOTS_FOURNIS", "STRUCTURE_CONFIRMÉE", "exactement 4 slides", "photo_index", "caption"]) assert(p.includes(x));
    assertEquals(p.includes("Légende optionnelle"), linkedIn);
    if (kind === "photo") for (const template of ["couverture", "profonde", "etiquette", "chiffre", "liste", "etape", "citation", "finale"]) assert(p.includes(template));
    if (kind === "mix") assert(p.includes("DIRECTIVES_TEXTE_FIRST"));
  });
}

Deno.test("mix texte-first : pas de ratio photo contradictoire", () => {
  const p = mixWritingPrompt({ text_first: true }, false, "", "");
  assert(p.includes("pas de ratio imposé"));
  assert(!p.includes("au moins la moitié"));
});

Deno.test("actualité : source et opinion sans désaccord fabriqué", () => {
  assert(NEWS_WRITING.includes("source comme point d'entrée"));
  assert(NEWS_WRITING.includes("sans désaccord, décalage ni quota d'opinions imposés"));
});

for (const linkedIn of [false, true]) Deno.test(`texte : choix conservés, canal=${linkedIn ? "LinkedIn" : "Instagram"}`, () => {
  const p = textWritingPrompt({ subject: "SUJET", selected_hook: "MES MOTS", chosen_angle: { title: "ANGLE_VALIDÉ" }, content_structure: "PLAN_VALIDÉ", slide_count: 5, deepening_answers: { faits: "FAITS" } }, linkedIn, "CONFIRMATION");
  for (const x of ["SUJET", "MES MOTS", "ANGLE_VALIDÉ", "PLAN_VALIDÉ", "FAITS", "CONFIRMATION", "exactement 5 slides", "word_count", "visual_schema", "publishing_tip:\"\""]) assert(p.includes(x), x);
  for (const x of ["scène-first", "UNE SEULE histoire", "chaque slide est un temps de ce récit", "positionner l'auteur", "500-800 caractères"]) assert(!p.includes(x), x);
  assertEquals(p.includes("Légende optionnelle"), linkedIn);
});
