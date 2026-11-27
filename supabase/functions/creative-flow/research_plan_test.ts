// deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/research_plan_test.ts
// Recherche « creuser le sujet » lancée en parallèle (27/11/2026) : mêmes
// conditions qu'avant, sorties du handler dans planDepthResearch.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { planDepthResearch } from "./research.ts";

const base = { step: "generate", deepResearch: false, isPhotoMode: false, isCaption: false, isLinkedIn: false, isReel: true, isStories: false };

Deno.test("reel sans réponse : recherche en profondeur, sans cas", () => {
  assertEquals(planDepthResearch({ ...base, body: { context: "Pourquoi mes savons sèchent 6 semaines" } }), { run: true, livedCase: undefined });
});

Deno.test("reel sur son propre cas : plus de recherche en appui (27/11/2026)", () => {
  const answer = "Ils pensent que je les fais attendre pour rien. En fait la saponification continue pendant la cure : un savon frais est encore agressif pour la peau, il fond en trois douches. Après 6 semaines il est doux et dure deux mois.";
  const body = { context: "Le séchage des savons", answers: [{ question: "Qu'est-ce que les gens ne comprennent pas sur ce délai ?", answer }] };
  assertEquals(planDepthResearch({ ...base, body }), { run: false });
  // Post Instagram, LinkedIn et stories gardent la recherche en appui.
  const post = planDepthResearch({ ...base, isReel: false, isCaption: true, body });
  assertEquals(post.run, true);
  assertEquals(post.livedCase?.includes("saponification"), true);
});

Deno.test("pas de recherche hors génération, en mode photo, avec la recherche web, ou pour un carrousel", () => {
  assertEquals(planDepthResearch({ ...base, step: "questions", body: {} }).run, false);
  assertEquals(planDepthResearch({ ...base, isPhotoMode: true, body: {} }).run, false);
  assertEquals(planDepthResearch({ ...base, deepResearch: true, body: {} }).run, false);
  assertEquals(planDepthResearch({ ...base, isReel: false, body: {} }).run, false);
});

Deno.test("essai sans recherche : seulement quand index.ts l'autorise (compte de test)", () => {
  assertEquals(planDepthResearch({ ...base, skipForTest: true, body: { context: "Le séchage des savons" } }).run, false);
  assertEquals(planDepthResearch({ ...base, skipForTest: false, body: { context: "Le séchage des savons" } }).run, true);
});
