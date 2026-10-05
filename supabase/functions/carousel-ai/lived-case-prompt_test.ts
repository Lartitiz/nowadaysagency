// « Ton cas d'abord » (04/10/2026) : prompts de rédaction et de recherche selon
// que la personne a donné son propre cas ou non.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCarouselWritingSystem, carouselSubstance, CAROUSEL_SUBSTANCE, SOCIAL_READING } from "./writing-contract.ts";
import { textWritingPrompt, mixWritingPrompt, photoWritingPrompt, userAnswersBlock, newsWriting, NEWS_WRITING, NEWS_ORDER } from "./variant-writing.ts";
import { LIVED_CASE_FIRST, NEWS_FEELING_FIRST } from "../_shared/lived-case.ts";
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

// ═══ Actu : « l'actu déclenche, ton ressenti porte le contenu » (05/10/2026) ═══
const NEWS = "ACTUALITÉ : Meta lance Verified à 9,99 € par mois\nSource : Le Monde\n\nANGLE CHOISI :\nHook : J'ai peur de devoir payer pour exister";
const FIELD_Q = "Quand tu parles de ce sujet, qu'est-ce qu'on te répond, et qu'est-ce que tu sens derrière ?";
const ACTU_JE = { subject: "J'ai peur de devoir payer 9,99 € pour exister", news_context: NEWS, scenario_origin: "automatic" };
const ACTU_NEUTRE = { ...ACTU_JE, subject: "Meta Verified passe à 9,99 € par mois" };
const ACTU_RESSENTI = { ...ACTU_JE, deepening_answers: { [FIELD_Q]: "On me répond que c'est le prix de la visibilité. Moi j'y vois une taxe sur les petites marques, et ça me met en colère." } };

Deno.test("actu sans réponse : prompts identiques à ceux d'une accroche neutre (comportement inchangé)", () => {
  for (const build of [
    (b: any) => textWritingPrompt(b, false, ""),
    (b: any) => photoWritingPrompt({ ...b, carousel_type: "photo" }, false, ""),
    (b: any) => mixWritingPrompt({ ...b, carousel_type: "mix" }, false, "", ""),
  ]) {
    const je = build(ACTU_JE);
    assertEquals(je, build(ACTU_NEUTRE).replaceAll(JSON.stringify(ACTU_NEUTRE.subject), JSON.stringify(ACTU_JE.subject)));
    assert(je.includes(SOCIAL_READING));
    assert(!je.includes(LIVED_CASE_FIRST));
    assert(!je.includes(NEWS_FEELING_FIRST));
  }
  assertEquals(newsWriting(ACTU_JE), NEWS_WRITING);
  assertEquals(newsWriting(ACTU_NEUTRE), NEWS_WRITING);
  assert(NEWS_WRITING.includes(NEWS_ORDER));
});

Deno.test("actu + ressenti : une consigne unique, son ressenti au cœur, sans « Ton cas d'abord »", () => {
  const substance = carouselSubstance("news_feeling");
  assert(substance.includes(NEWS_FEELING_FIRST));
  assert(!substance.includes(LIVED_CASE_FIRST));
  assert(!substance.includes(SOCIAL_READING));
  for (const prompt of [textWritingPrompt(ACTU_RESSENTI, false, ""), mixWritingPrompt({ ...ACTU_RESSENTI, carousel_type: "mix" }, false, "", ""), photoWritingPrompt({ ...ACTU_RESSENTI, carousel_type: "photo" }, false, "")]) {
    assert(prompt.includes("SON RESSENTI SUR L'ACTU"));
    assert(prompt.includes(NEWS_FEELING_FIRST));
    assert(prompt.includes("une taxe sur les petites marques"));
    assert(!prompt.includes(LIVED_CASE_FIRST));
    assert(!prompt.includes("SON CAS PERSONNEL"));
    assert(!prompt.includes("au plus UN chiffre"));
  }
  // La phrase « l'actu reste le sujet jusqu'à la dernière slide » ne contredit plus son ressenti.
  const news = newsWriting(ACTU_RESSENTI);
  assert(!news.includes(NEWS_ORDER));
  assert(news.includes("posée vite et juste"));
  assert(news.includes("Termine sur sa position ou sur une question simple"));
  assert(news.includes("conserve le fait déclencheur et sa source"));
  assert(NEWS_FEELING_FIRST.includes("au plus 3 chiffres venus de la recherche"));
  const system = buildCarouselWritingSystem("B", false, "I", "", "news_feeling");
  assert(system.includes(NEWS_FEELING_FIRST) && !system.includes(LIVED_CASE_FIRST));
});

Deno.test("cas personnel sans actu : « Ton cas d'abord » inchangé (#1354)", () => {
  assertEquals(carouselSubstance("own_case"), carouselSubstance(true));
  assertEquals(buildCarouselWritingSystem("B", false, "I", "", "own_case"), buildCarouselWritingSystem("B", false, "I", "", true));
  assertEquals(carouselSubstance("news"), CAROUSEL_SUBSTANCE);
  assertEquals(carouselSubstance("none"), CAROUSEL_SUBSTANCE);
  assert(textWritingPrompt(LIVED, false, "").includes(LIVED_CASE_FIRST));
  assert(!textWritingPrompt(LIVED, false, "").includes(NEWS_FEELING_FIRST));
});

Deno.test("posts, reels, stories d'actu : ressenti au cœur, actu seule inchangée", () => {
  for (const format of ["caption", "reel", "stories"] as const) {
    assertEquals(positionDepthBlock(format, true, "news"), positionDepthBlock(format, true, false));
    assertEquals(positionDepthBlock(format, false, "own_case"), positionDepthBlock(format, false, true));
    const feeling = positionDepthBlock(format, true, "news_feeling");
    assert(feeling.includes(NEWS_FEELING_FIRST));
    assert(!feeling.includes(LIVED_CASE_FIRST));
    assert(!feeling.includes("Creuse sous le sujet"));
    assert(!feeling.includes("l'angle choisi est la THÈSE"));
    assert(feeling.includes("FIN : la position assumée"));
  }
});
