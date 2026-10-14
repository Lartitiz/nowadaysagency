// Réglages de l'appel à Claude par étape (modèle, tokens, température, délai,
// outil structuré) pour creative-flow. Extraits À L'IDENTIQUE du handler
// (fiche 3, lot B, 14/10/2026) dans une fonction pure, testable sans réseau
// (call-options_test.ts). Le recyclage n'arrive jamais ici : le handler le
// confie à handleRecycleStep (formats/recycle.ts) avant l'appel (lot F, 14/10/2026 :
// branche morte `recycle ? 12288` retirée).
// Voir docs/creation-contenu/CARTE.md.

import { getModelForAction } from "../_shared/anthropic.ts";
import { GENERATE_ABORT_MS, ADJUST_ABORT_MS, LIGHT_ABORT_MS, QUESTIONS_TOOL, FOLLOW_UP_TOOL } from "./shared.ts";
import { isFactualFictionalLinkedInBrief } from "./formats/linkedin.ts";
import { HOOKS_TOOL } from "./formats/reel.ts";

export function callOptionsForStep(params: {
  step: string;
  isLinkedIn: boolean;
  isPhotoMode: boolean;
  context?: string | null;
}) {
  const { step, isLinkedIn, isPhotoMode, context } = params;
  // 8192 pour la génération de contenu : le JSON reel (script + duplicata `sections`
  // + `lecture_test` + shot list) dépasse le défaut de 4096 de callAnthropicSimple
  // → stop_reason "max_tokens" → échec systématique en ~40 s. Un plafond haut ne
  // coûte rien tant qu'il n'est pas consommé.
  const factualFictionalLinkedIn = step === "generate" && isLinkedIn && !isPhotoMode && isFactualFictionalLinkedInBrief(context);
  const maxTokens = step === "questions" ? 800 : step === "hooks" ? 1400 : factualFictionalLinkedIn ? 1200 : 8192;
  // Même détection du format que le reste du handler (isLinkedIn, format-flags.ts, lot F3).
  const isLinkedInText = isLinkedIn && step !== "questions";
  const tempText = factualFictionalLinkedIn ? 0.2 : isLinkedInText ? 0.7 : 0.85;
  // L1 : Haiku pour les steps `questions` et `follow-up` (3-5× plus rapide que Sonnet,
  // suffisant pour des questions structurées en JSON). Sonnet reste pour la génération de contenu.
  const modelForCall = (step === "questions" || step === "follow-up")
    ? getModelForAction("questions")
    : getModelForAction("content");
  // Questions/follow-up = appels Haiku courts et bornés : on plafonne chaque
  // tentative à 30s pour qu'un fetch qui traîne bascule vite en retry plutôt
  // que de faire patienter l'utilisatrice >1 min sur le chemin d'activation.
  // `generate` (et adjust/angles/dictation) suivaient le même chemin sans
  // aucune limite jusqu'ici — le générateur le plus utilisé de l'outil
  // tournait sans filet (audit latences 17/08).
  const abortMs = (step === "questions" || step === "follow-up") ? 30000
    : step === "hooks" ? 45000
    : step === "generate" ? GENERATE_ABORT_MS
    : step === "adjust" ? ADJUST_ABORT_MS
    : (step === "angles" || step === "dictation") ? LIGHT_ABORT_MS
    : undefined;
  // `hooks` reste sur le modèle content (Sonnet) : le hook est LE levier de
  // rétention du reel, la qualité prime sur les ~5 s gagnées avec Haiku.
  const structuredTool = step === "questions" ? QUESTIONS_TOOL : step === "follow-up" ? FOLLOW_UP_TOOL : step === "hooks" ? HOOKS_TOOL : undefined;
  return { factualFictionalLinkedIn, maxTokens, tempText, modelForCall, abortMs, structuredTool };
}
