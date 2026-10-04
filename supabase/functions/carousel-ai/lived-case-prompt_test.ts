// « Ton cas d'abord » (04/10/2026) : prompts de rédaction et de recherche selon
// que la personne a donné son propre cas ou non.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCarouselWritingSystem, carouselSubstance, CAROUSEL_SUBSTANCE, SOCIAL_READING } from "./writing-contract.ts";
import { textWritingPrompt, mixWritingPrompt, userAnswersBlock } from "./variant-writing.ts";
import { LIVED_CASE_FIRST } from "../_shared/lived-case.ts";
import { buildDepthBlock, supportPrompt } from "../_shared/depth-research.ts";
import { positionDepthBlock } from "../_shared/format-briefs.ts";

const ANSWERS = {
  "Qu'est-ce que l'IA a changé concrètement ?": "Avant je ne faisais que la stratégie. Aujourd'hui je livre stratégie, site et e-mails pour 2 100 € TTC.",
  "Qu'est-ce qui te fait douter ?": "J'ai peur que mon métier disparaisse.",
};
const LIVED = { subject: "Oui, j'utilise l'IA générative", carousel_type: "prise_de_position", deepening_answers: ANSWERS };
const NO_LIVED = { subject: "Pourquoi publier tous les jours ne sert à rien", carousel_type: "prise_de_position" };

Deno.test("rédaction : sans vécu fourni, la lecture sociale (#1292) reste intacte", () => {
  assertEquals(carouselSubstance(false), CAROUSEL_SUBSTANCE);
  assert(CAROUSEL_SUBSTANCE.includes(SOCIAL_READING));
  const prompt = textWritingPrompt(NO_LIVED, false, "");
  assert(prompt.includes(SOCIAL_READING));
  assert(!prompt.includes(LIVED_CASE_FIRST));
});

Deno.test("rédaction : avec son cas, la lecture en « on / nous » laisse la place à « Ton cas d'abord »", () => {
  const substance = carouselSubstance(true);
  assert(!substance.includes(SOCIAL_READING));
  assert(substance.includes(LIVED_CASE_FIRST));
  const system = buildCarouselWritingSystem("HISTOIRE : dix ans dans le marketing digital", false, "Tu écris pour Laetitia.", "", true);
  assert(!system.includes(SOCIAL_READING));
  assert(system.includes("au plus UN chiffre de recherche"));
  for (const prompt of [textWritingPrompt(LIVED, false, ""), mixWritingPrompt({ ...LIVED, carousel_type: "mix" }, false, "", "")]) {
    assert(!prompt.includes(SOCIAL_READING));
    assert(prompt.includes("SON CAS PERSONNEL"));
    assert(prompt.includes("2 100 € TTC"));
  }
});

Deno.test("brief : les réponses sont mises en avant, la matière éditoriale reste dans le brief JSON", () => {
  const block = userAnswersBlock(LIVED);
  assert(block.includes("SON CAS PERSONNEL"));
  assert(block.includes("J'ai peur que mon métier disparaisse."));
  const material = "MATIÈRE ÉDITORIALE CHOISIE (proposition, pas un témoignage personnel).\nUn angle.";
  const withMaterial = { ...LIVED, deepening_answers: { ...ANSWERS, "Brief éditorial choisi": material } };
  const prompt = textWritingPrompt(withMaterial, false, "");
  assert(prompt.includes(JSON.stringify({ "Brief éditorial choisi": material }).slice(1, -1)));
  assert(!userAnswersBlock(withMaterial).includes("MATIÈRE ÉDITORIALE"));
  // Réponses courtes et neutres : mises en avant, sans la règle du cas personnel.
  const neutral = userAnswersBlock({ subject: "Les tarifs", deepening_answers: { "Ta cible ?": "Les indépendantes." } });
  assert(neutral.includes("RÉPONSES DE LA PERSONNE"));
  assert(!neutral.includes(LIVED_CASE_FIRST));
  assertEquals(userAnswersBlock(NO_LIVED), "");
});

Deno.test("recherche : le mode appui ne demande ni « faits qui frappent » ni mécanisme", () => {
  const prompt = supportPrompt("Oui, j'utilise l'IA générative", "pour 2 100 € TTC", "consultante");
  assert(!/qui frappent/.test(prompt));
  assert(prompt.includes("UN fait vérifié"));
  assert(prompt.includes("2 100 € TTC"));
  const block = buildDepthBlock("« 2 100 € TTC » : une agence facture un site dès 5 000 € (La Fabrique du Net, 2026).", "support");
  assert(block.includes("MATIÈRE D'APPUI"));
  assert(block.includes("Au plus UN chiffre"));
  assert(!block.includes("MATIÈRE DE PROFONDEUR"));
  assertEquals(buildDepthBlock("VIDE", "support"), "");
  // Le mode profondeur ne change pas.
  assert(buildDepthBlock("x".repeat(100)).includes("MATIÈRE DE PROFONDEUR"));
});

Deno.test("posts, reels, stories : même règle dans le bloc de prise de position", () => {
  for (const format of ["caption", "reel", "stories"] as const) {
    const plain = positionDepthBlock(format, false);
    const lived = positionDepthBlock(format, false, true);
    assert(plain.includes("Creuse sous le sujet"));
    assert(!lived.includes("Creuse sous le sujet"));
    assert(lived.includes(LIVED_CASE_FIRST));
  }
});
