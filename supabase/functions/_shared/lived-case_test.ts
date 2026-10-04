import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectLivedCase, livedCaseFromCarouselBody, livedCaseFromCreativeBody, userAnswerTexts, LIVED_ANSWER_WORDS } from "./lived-case.ts";

// Cas de référence (carrousel « Oui, j'utilise l'IA générative », 04/10/2026).
const REFERENCE_ANSWERS = {
  "Qu'est-ce que l'IA a changé concrètement pour tes clientes ?": "Avant je ne faisais que la stratégie, la mise en œuvre était trop chère. Aujourd'hui je livre stratégie, plan de com', site et e-mails pour 2 100 € TTC.",
  "Qu'est-ce qui te fait douter ?": "J'ai peur que mon métier disparaisse. Je ne sais pas si j'ai raison.",
};

Deno.test("lived-case : le cas de référence est un vécu fourni (montant, avant/après, émotion)", () => {
  const lived = livedCaseFromCarouselBody({ subject: "Oui, j'utilise l'IA générative", deepening_answers: REFERENCE_ANSWERS });
  assert(lived.provided);
  assert(lived.reasons.includes("montant"), lived.reasons.join(","));
  assert(lived.reasons.includes("avant-apres"), lived.reasons.join(","));
  assert(lived.reasons.includes("emotion"), lived.reasons.join(","));
});

Deno.test("lived-case : sans réponses ni cas concret, pas de vécu (la recherche de profondeur reste)", () => {
  assertEquals(livedCaseFromCarouselBody({ subject: "Pourquoi publier tous les jours ne sert à rien" }).provided, false);
  assertEquals(livedCaseFromCarouselBody({ subject: "Le prix de l'IA générative", deepening_answers: {} }).provided, false);
});

Deno.test("lived-case : une actu chiffrée sans première personne n'est pas un vécu", () => {
  assertEquals(detectLivedCase({ brief: ["Meta lance un abonnement sans pub à 9,99 € par mois."] }).provided, false);
  assertEquals(detectLivedCase({ brief: ["Avant 2024 les comptes pros étaient gratuits, désormais ils sont payants."] }).provided, false);
});

Deno.test("lived-case : réponses développées au-delà du seuil, même sans marqueur", () => {
  const long = Array.from({ length: LIVED_ANSWER_WORDS + 5 }, (_, i) => `mot${i}`).join(" ");
  const lived = detectLivedCase({ answers: [long] });
  assertEquals(lived.reasons, ["reponses-developpees"]);
  // Courtes et neutres : pas de vécu.
  assertEquals(detectLivedCase({ answers: ["Plutôt les indépendantes.", "Instagram surtout."] }).provided, false);
});

Deno.test("lived-case : émotion dite par l'autrice", () => {
  assert(detectLivedCase({ answers: ["Je culpabilise à chaque fois."] }).provided);
  assert(detectLivedCase({ answers: ["Ça me fait vraiment peur."] }).provided);
  assert(detectLivedCase({ answers: ["Je me sens un peu perdue."] }).provided);
  // Une émotion décrite chez les autres n'est pas son vécu.
  assertEquals(detectLivedCase({ answers: ["Les gens ont peur du jugement."] }).provided, false);
});

Deno.test("lived-case : la matière éditoriale choisie n'est jamais prise pour un vécu", () => {
  const material = "MATIÈRE ÉDITORIALE CHOISIE (proposition, pas un témoignage personnel). " + "Avant je payais 3 000 €, aujourd'hui j'ai peur. ".repeat(5);
  const lived = livedCaseFromCarouselBody({ subject: "Les tarifs", deepening_answers: { "Brief éditorial choisi": material } });
  assertEquals(lived.provided, false);
  assertEquals(userAnswerTexts({ "Brief éditorial choisi": material, autre: material }), []);
});

Deno.test("lived-case : réponses creative-flow en tableau {question, answer} — la question ne compte pas", () => {
  const question = "Qu'est-ce qui te fait peur quand tu fixes tes prix ? Raconte avant et après, combien en euros, ce que tu ressens.";
  assertEquals(userAnswerTexts([{ question, answer: "Rien de spécial." }]), ["Rien de spécial."]);
  assertEquals(livedCaseFromCreativeBody({ context: "Fixer ses prix", answers: [{ question, answer: "Rien de spécial." }] }).provided, false);
  const lived = livedCaseFromCreativeBody({ context: "Fixer ses prix", answers: [{ question, answer: "J'ai longtemps facturé 300 € une journée de travail." }] });
  assert(lived.provided);
  assert(lived.reasons.includes("montant"));
});
