// deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/reel_chiffres_reponses_test.ts
// Ses chiffres donnés en réponse aux questions restent les siens à la relecture du reel (27/11/2026).
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { reelNumberSources } from "./formats/reel.ts";
import { gateNumbers } from "./shared.ts";
import { analyzeTextRedac } from "../_shared/redac-gate.ts";

const body = {
  context: "Pourquoi je n'utilise pas d'huiles essentielles pour les bébés",
  answers: [{ question: "Qu'est-ce que tu veux que les gens retiennent ?", answer: "Une cliente voulait un savon à la lavande pour son bébé de 2 mois. J'ai refusé, parce que les huiles essentielles sont déconseillées avant 3 ans. Mon savon est surgras à 8 %." }],
};

Deno.test("reel : ses réponses font partie des sources de chiffres", () => {
  assert(reelNumberSources(body, "").some((s) => s.includes("bébé de 2 mois")));
});

Deno.test("reel : « 2 mois », « 3 ans » et « 8 % » de ses réponses ne passent pas pour inventés", () => {
  const texte = "J'ai refusé une commande pour un bébé de 2 mois. Les huiles essentielles, c'est déconseillé avant 3 ans. Le mien est surgras à 8 %.";
  const { allowed, research } = gateNumbers(reelNumberSources(body, ""), "");
  const avec: any = analyzeTextRedac(texte, allowed, undefined, undefined, research);
  assertEquals(avec.fabricatedNumbers, []);
  // Avant le correctif (sans ses réponses), les trois passaient pour inventés.
  const sans = gateNumbers(reelNumberSources({ ...body, answers: undefined }, ""), "");
  const avant: any = analyzeTextRedac(texte, sans.allowed, undefined, undefined, sans.research);
  assertEquals(avant.fabricatedNumbers.length, 3);
});
