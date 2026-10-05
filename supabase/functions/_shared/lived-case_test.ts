import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectLivedCase, livedCaseFromCarouselBody, livedCaseFromCreativeBody, userAnswerTexts, LIVED_ANSWER_WORDS, researchNumbersCapFor } from "./lived-case.ts";

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

// ═══ Actu : « l'actu déclenche, ton ressenti porte le contenu » (05/10/2026) ═══
// Le sujet d'un contenu d'actu est l'accroche écrite par l'IA (NewsjackingPanel),
// souvent en « je » : elle ne compte jamais comme vécu.
const NEWS = "ACTUALITÉ : Meta lance Verified à 9,99 € par mois\nSource : Le Monde\n\nANGLE CHOISI :\nHook : J'ai peur de devoir payer 9,99 € pour exister";
const FIELD_Q = "Quand tu parles de ce sujet, qu'est-ce qu'on te répond, et qu'est-ce que tu sens derrière ?";

Deno.test("actu : l'accroche IA en « je » (montant + émotion) n'est pas un vécu", () => {
  const subject = "J'ai peur de devoir payer 9,99 € pour exister sur Instagram";
  // Sans actu, ce même sujet serait un vécu (garde #1354 intacte).
  assert(livedCaseFromCarouselBody({ subject }).provided);
  const c = livedCaseFromCarouselBody({ subject, news_context: NEWS });
  assertEquals(c.provided, false);
  assertEquals(c.mode, "news");
  assertEquals(c.reasons, []);
  const cf = livedCaseFromCreativeBody({ context: subject, news_context: NEWS });
  assertEquals(cf.provided, false);
  assertEquals(cf.mode, "news");
});

Deno.test("actu : ses réponses (même sans montant ni mot d'émotion) = ressenti qui porte le contenu", () => {
  const answer = "On me dit que c'est normal de payer pour être vue. Moi je trouve ça injuste pour les petites marques.";
  const c = livedCaseFromCarouselBody({ subject: "Meta veut 9,99 € pour me certifier", news_context: NEWS, deepening_answers: { [FIELD_Q]: answer } });
  assertEquals(c.provided, false); // pas « Ton cas d'abord » : la recherche reste en profondeur
  assertEquals(c.mode, "news_feeling");
  assertEquals(c.answers, [answer]);
  const emo = livedCaseFromCreativeBody({ context: "x", news_context: NEWS, answers: [{ question: FIELD_Q, answer: "J'ai honte de ne pas suivre." }] });
  assertEquals(emo.mode, "news_feeling");
  assert(emo.reasons.includes("emotion"));
});

Deno.test("actu : réponse trop courte, vide ou matière éditoriale seule = actu sans ressenti", () => {
  for (const deepening_answers of [undefined, {}, { [FIELD_Q]: "oui" }, { [FIELD_Q]: "   " }, { "Brief éditorial choisi": "MATIÈRE ÉDITORIALE CHOISIE : je pense que…" }]) {
    assertEquals(livedCaseFromCarouselBody({ subject: "J'ai peur de payer 9,99 €", news_context: NEWS, deepening_answers }).mode, "news");
  }
  // news_context vide = pas d'actu.
  assertEquals(livedCaseFromCarouselBody({ subject: "Les tarifs", news_context: "  " }).mode, "none");
});

Deno.test("plafond de chiffres de recherche : 1 pour son cas, 3 pour l'actu, aucun sinon", () => {
  assertEquals(researchNumbersCapFor(livedCaseFromCarouselBody({ subject: "Oui, j'utilise l'IA générative", deepening_answers: REFERENCE_ANSWERS })), 1);
  assertEquals(researchNumbersCapFor(livedCaseFromCarouselBody({ subject: "J'ai peur de payer", news_context: NEWS })), 3);
  assertEquals(researchNumbersCapFor(livedCaseFromCarouselBody({ subject: "x", news_context: NEWS, deepening_answers: REFERENCE_ANSWERS })), 3);
  assertEquals(researchNumbersCapFor(livedCaseFromCarouselBody({ subject: "Pourquoi publier tous les jours ne sert à rien" })), undefined);
});
