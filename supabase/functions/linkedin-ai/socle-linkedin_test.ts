// Socle commun dans linkedin-ai : famille d'angle, « Ton cas d'abord », actu,
// une idée par paragraphe, sans nombre fixe d'unités.
//   deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/linkedin-ai/socle-linkedin_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { LIVED_CASE_FIRST, NEWS_FEELING_FIRST } from "../_shared/lived-case.ts";
import { captionAnswersText, LINKEDIN_ONE_IDEA_RULE, linkedInAiCaseMode, linkedInAiFamily, linkedInSocleBlock } from "./socle-linkedin.ts";

const OWN_CASE = "Je suis passée de 1 200 € à 2 100 € par mois, et j'ai eu peur de perdre mes clientes.";

Deno.test("famille d'angle de chaque action", () => {
  assertEquals(linkedInAiFamily("crosspost"), "K");
  assertEquals(linkedInAiFamily("improve-post"), "K");
  assertEquals(linkedInAiFamily("adapt-instagram"), "K");
  assertEquals(linkedInAiFamily("summary"), "A");
  assertEquals(linkedInAiFamily("caption-for-carousel", { editorial_angle: "etude_de_cas" }), "B");
  assertEquals(linkedInAiFamily("caption-for-carousel", { editorial_angle: "histoire-cliente" }), "B");
  assertEquals(linkedInAiFamily("caption-for-carousel", { editorial_angle: "prise_de_position" }), "D");
  assertEquals(linkedInAiFamily("caption-for-carousel", { editorial_angle: "etude_de_cas", news_context: "Meta change sa règle" }), "C");
  assertEquals(linkedInAiFamily("caption-for-carousel", {}), null);
  assertEquals(linkedInAiFamily("title"), null);
});

Deno.test("Ton cas d'abord : son vécu dans sa source ou son sujet", () => {
  assertEquals(linkedInAiCaseMode("crosspost", { sourceContent: OWN_CASE }), "own_case");
  assertEquals(linkedInAiCaseMode("improve-post", { postContent: OWN_CASE }), "own_case");
  assertEquals(linkedInAiCaseMode("caption-for-carousel", { subject: OWN_CASE }), "own_case");
  assertEquals(linkedInAiCaseMode("caption-for-carousel", { subject: "Les tarifs dans l'artisanat" }), "none");
  for (const action of ["crosspost", "improve-post", "caption-for-carousel"]) {
    const params = { sourceContent: OWN_CASE, postContent: OWN_CASE, subject: OWN_CASE };
    assert(linkedInSocleBlock(action, params).includes(LIVED_CASE_FIRST), action);
  }
  assert(!linkedInSocleBlock("caption-for-carousel", { subject: "Les tarifs" }).includes(LIVED_CASE_FIRST));
});

Deno.test("actu (#1362) : l'accroche de l'IA n'est jamais un vécu, ses réponses portent le contenu", () => {
  const news = { news_context: "Meta change sa règle", subject: "J'ai eu peur en lisant ça : 9,99 € pour moi aussi" };
  assertEquals(linkedInAiCaseMode("caption-for-carousel", news), "news");
  const block = linkedInSocleBlock("caption-for-carousel", news);
  assert(!block.includes(LIVED_CASE_FIRST) && !block.includes(NEWS_FEELING_FIRST));
  assert(block.includes("l'actu déclenche") && block.includes("ne sont pas son vécu"));
  const answered = { ...news, deepening_answers: { "Qu'est-ce que tu sens derrière ?": "Ça me met en colère pour les petites marques" } };
  assertEquals(linkedInAiCaseMode("caption-for-carousel", answered), "news_feeling");
  assert(linkedInSocleBlock("caption-for-carousel", answered).includes(NEWS_FEELING_FIRST));
});

Deno.test("adaptation par famille : cas client à la 3e personne, texte source sans ajout", () => {
  assert(linkedInSocleBlock("caption-for-carousel", { editorial_angle: "etude_de_cas" }).includes("3e personne"));
  assert(linkedInSocleBlock("crosspost", { sourceContent: "Un texte neutre." }).includes("SON TEXTE EST LA SOURCE"));
  assert(linkedInSocleBlock("summary", { parcours: "Graphiste depuis dix ans" }).includes("SES ÉLÉMENTS D'ABORD"));
});

Deno.test("une idée par paragraphe, sans nombre fixe, jamais en raccourcissant", () => {
  for (const action of ["crosspost", "improve-post", "adapt-instagram", "caption-for-carousel"]) {
    assert(linkedInSocleBlock(action, {}).includes(LINKEDIN_ONE_IDEA_RULE), action);
  }
  assert(/on ne raccourcit pas/.test(LINKEDIN_ONE_IDEA_RULE) && /aucun nombre/.test(LINKEDIN_ONE_IDEA_RULE));
  assertEquals(linkedInSocleBlock("title", {}), "");
  assertEquals(linkedInSocleBlock("suggest-template", {}), "");
});

Deno.test("index.ts branche le socle et ne fixe plus le nombre de stories", () => {
  const src = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
  assert(src.includes('linkedInSocleBlock("crosspost", params)'));
  assert(src.includes("linkedInSocleBlock(action, params)"));
  assert(!src.includes("séquence 5 stories"));
  assert(!src.includes("800-1500 car."));
  // Tu / vous du résumé de profil contrôlé par le code (#1360).
  assert(/"summary": \["court_storytelling"/.test(src));
});

Deno.test("réponses de la légende : valeurs seules, vides ignorées", () => {
  assertEquals(captionAnswersText({ q1: " Mon vécu ", q2: "", q3: 4 }), "- Mon vécu");
  assertEquals(captionAnswersText(null), "");
  assertEquals(captionAnswersText(["a"]), "");
});

Deno.test("carousel-ai : accroches, sujets et angles ne disent plus « Instagram » pour un carrousel LinkedIn", () => {
  const src = Deno.readTextFileSync(new URL("../carousel-ai/index.ts", import.meta.url));
  assert(!/pour un carrousel Instagram|de carrousels Instagram\./.test(src));
  for (const fn of ["buildHooksPrompt", "buildSuggestTopicsPrompt", "buildSuggestAnglesPrompt"]) {
    assert(src.includes(`function ${fn}(body: any, isLinkedIn = false)`), fn);
    assert(src.includes(`${fn}(reqCtx.body, reqCtx.isLinkedIn)`), fn);
  }
});
