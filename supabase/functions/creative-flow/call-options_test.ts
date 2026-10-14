// Réglages de l'appel à Claude par étape (call-options.ts, fiche 3, lot B).
// Fige les valeurs telles qu'elles étaient dans le handler avant l'extraction.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/call-options_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getModelForAction } from "../_shared/anthropic.ts";
import { callOptionsForStep } from "./call-options.ts";
import { GENERATE_ABORT_MS, ADJUST_ABORT_MS, LIGHT_ABORT_MS } from "./shared.ts";

const FICTIF = "Écris un exemple fictif de post LinkedIn, uniquement avec les faits du brief : une céramiste refuse une remise et la cliente signe.";
const base = { isLinkedIn: false, isPhotoMode: false, contentType: "post_instagram", context: "Mon atelier" };
const pick = (o: ReturnType<typeof callOptionsForStep>) => ({
  maxTokens: o.maxTokens,
  tempText: o.tempText,
  model: o.modelForCall === getModelForAction("questions") ? "questions" : o.modelForCall === getModelForAction("content") ? "content" : o.modelForCall,
  abortMs: o.abortMs,
  tool: o.structuredTool?.name,
  fictif: o.factualFictionalLinkedIn,
});

Deno.test("callOptionsForStep : réglages par étape", () => {
  assertEquals(pick(callOptionsForStep({ ...base, step: "questions" })), { maxTokens: 800, tempText: 0.85, model: "questions", abortMs: 30000, tool: "poser_questions", fictif: false });
  assertEquals(pick(callOptionsForStep({ ...base, step: "follow-up" })), { maxTokens: 8192, tempText: 0.85, model: "questions", abortMs: 30000, tool: "poser_questions_suivi", fictif: false });
  assertEquals(pick(callOptionsForStep({ ...base, step: "hooks", contentType: "reel" })), { maxTokens: 1400, tempText: 0.85, model: "content", abortMs: 45000, tool: "proposer_hooks", fictif: false });
  assertEquals(pick(callOptionsForStep({ ...base, step: "generate" })), { maxTokens: 8192, tempText: 0.85, model: "content", abortMs: GENERATE_ABORT_MS, tool: undefined, fictif: false });
  assertEquals(pick(callOptionsForStep({ ...base, step: "adjust" })), { maxTokens: 8192, tempText: 0.85, model: "content", abortMs: ADJUST_ABORT_MS, tool: undefined, fictif: false });
  assertEquals(pick(callOptionsForStep({ ...base, step: "angles" })).abortMs, LIGHT_ABORT_MS);
  assertEquals(pick(callOptionsForStep({ ...base, step: "dictation" })).abortMs, LIGHT_ABORT_MS);
});

Deno.test("callOptionsForStep : LinkedIn, température 0.7 hors questions, 0.2 et 1200 tokens pour l'exemple fictif", () => {
  const li = { ...base, isLinkedIn: true, contentType: "post_linkedin" };
  assertEquals(pick(callOptionsForStep({ ...li, step: "generate" })), { maxTokens: 8192, tempText: 0.7, model: "content", abortMs: GENERATE_ABORT_MS, tool: undefined, fictif: false });
  assertEquals(pick(callOptionsForStep({ ...li, step: "questions", contentType: "linkedin_post" })).tempText, 0.85);
  assertEquals(pick(callOptionsForStep({ ...li, step: "generate", context: FICTIF })), { maxTokens: 1200, tempText: 0.2, model: "content", abortMs: GENERATE_ABORT_MS, tool: undefined, fictif: true });
  // Mode photo ou étape autre que generate : pas de réglage « fictif ».
  assertEquals(pick(callOptionsForStep({ ...li, step: "generate", context: FICTIF, isPhotoMode: true })).fictif, false);
  assertEquals(pick(callOptionsForStep({ ...li, step: "adjust", context: FICTIF })).fictif, false);
  // Lot F3 : la température suit isLinkedIn (même détection que la consigne),
  // plus la sous-chaîne du contentType brut. Ex. : angle LinkedIn sans contentType.
  assertEquals(pick(callOptionsForStep({ ...base, step: "generate", isLinkedIn: true, contentType: "" })).tempText, 0.7);
  assertEquals(pick(callOptionsForStep({ ...base, step: "generate", isLinkedIn: false, contentType: "linkedin_carrousel" })).tempText, 0.85);
});
