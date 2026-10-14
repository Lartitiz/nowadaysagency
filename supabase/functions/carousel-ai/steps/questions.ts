// carousel-ai : questions d'approfondissement (`deepening_questions`,
// gratuites), avec ou sans photos. Fiche 2, lot 5 de
// docs/robustesse/gros-fichiers.md (prévu au lot 3, attendait
// steps/generate.ts) : déplacé à l'identique depuis index.ts.

import { type CarouselRequestContext, pushPhotoWithContext, buildPhotoContextRecap, _deps } from "../shared.ts";
import { CAROUSEL_WRITING_VERSION } from "../writing-contract.ts";
import { PHOTO_NARRATIVE_CONTRACT, PHOTO_QUESTIONS_CONTRACT } from "../photo-narrative.ts";
import { type UsageSink, getModelForAction } from "../../_shared/anthropic.ts";
import { PHOTO_QUESTIONS_TOOL } from "../tools.ts";
import { buildDeepeningQuestionsPrompt } from "../prompts.ts";
import { runGenerationAndRespond } from "./generate.ts";

// ── Photo / mix carousel: vision-informed questions ──
export async function handleDeepeningQuestionsVisionRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const { body, isLinkedIn, brandingContext, brandVocabBlock, recentBriefsContext, systemPrompt, corsHeaders } = reqCtx;
  const isMix = body.carousel_type === "mix";
  const channelLabel = isLinkedIn ? "LinkedIn" : "Instagram";
  const formatLabel = isMix
    ? `carrousel ${channelLabel} MIXTE (slides photo + slides texte alternées)`
    : `carrousel photo ${channelLabel}`;

  // Détecte si l'utilisatrice a vraiment écrit un sujet, ou si c'est juste un fallback automatique
  const rawSubject = (body.subject || "").trim();
  const isFallbackSubject = !rawSubject || rawSubject === "Carrousel basé sur les photos uploadées";
  const hasWrittenIntent = !isFallbackSubject || !!(body.photo_description && body.photo_description.trim().length > 0);

  // A photo-only discovery needs no invented objective or new questionnaire.
  // Explicit subjects/angles still reach the factual clarification pass.
  if (!hasWrittenIntent && !body.objective && !body.editorial_angle) {
    return new Response(JSON.stringify({ content: JSON.stringify({ questions: [] }), writing_version: CAROUSEL_WRITING_VERSION }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const messageContent: any[] = [];
  body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
    pushPhotoWithContext(messageContent, photo, idx);
  });
  const photoCtxRecap = buildPhotoContextRecap(body.photos);

  messageContent.push({
    type: "text",
    text: `Prépare les éventuelles précisions pour un ${formatLabel}.
Sujet : ${hasWrittenIntent ? rawSubject : "aucun sujet explicite ; photos sélectionnées"}
Description : ${body.photo_description || ""}
Objectif : ${body.objective || "non précisé"}
Réponses déjà fournies : ${JSON.stringify(body.deepening_answers || {})}
${photoCtxRecap}
CONTEXTE DE MARQUE : ${brandingContext}
${recentBriefsContext || ""}
${PHOTO_NARRATIVE_CONTRACT}
${PHOTO_QUESTIONS_CONTRACT}
Réponds en JSON : {"questions":[{"question":"...","placeholder":"..."}]}. Tableau vide si aucune précision essentielle.`,
  });

  const deepeningUsage: UsageSink = {};
  const content = await _deps.callAnthropic({
    model: getModelForAction("questions"),
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
    max_tokens: 4096,
    // Questions ancrées sur photos : borne chaque tentative à 60s pour
    // éviter le blocage indéfini d'un fetch qui traîne.
    abortTimeoutMs: 60000,
    tool: PHOTO_QUESTIONS_TOOL,
  }, deepeningUsage);

  // PAS de logUsage — les questions d'approfondissement sont gratuites
  // (arbitrage 10/07/2026 : un carrousel débite 2 crédits, rédaction +
  // visuel ; aligné sur creative-flow où le step "questions" est gratuit).
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleDeepeningQuestionsRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const { body, brandingContext, isLinkedIn, recentBriefsContext, brandVocabBlock } = reqCtx;

  // ── Photo / mix carousel: vision-informed questions ──
  if ((body.carousel_type === "photo" || body.carousel_type === "mix") && body.photos && body.photos.length > 0) {
    return handleDeepeningQuestionsVisionRequest(reqCtx);
  }

  // The same optional-question contract applies when images are unavailable.
  const isPhotoNarrative = body.carousel_type === "photo" || body.carousel_type === "mix";
  const userPrompt = isPhotoNarrative
    ? `Prépare les éventuelles précisions pour un carrousel ${body.carousel_type}.
Sujet : ${body.subject || "aucun sujet explicite"}
Objectif : ${body.objective || "non précisé"}
Description des photos : ${body.photo_description || "non fournie"}
Réponses déjà fournies : ${JSON.stringify(body.deepening_answers || {})}
Angle proposé : ${body.editorial_angle || "non précisé"}
Structure proposée : ${body.content_structure || "non précisée"}
CONTEXTE DE MARQUE : ${brandingContext}
${brandVocabBlock || ""}
${recentBriefsContext || ""}
${PHOTO_NARRATIVE_CONTRACT}
${PHOTO_QUESTIONS_CONTRACT}
Réponds en JSON : {"questions":[{"question":"...","placeholder":"..."}]}. Tableau vide si aucune précision essentielle.`
    : buildDeepeningQuestionsPrompt(body, brandingContext, isLinkedIn, recentBriefsContext, brandVocabBlock);

  return runGenerationAndRespond("deepening_questions", userPrompt, reqCtx);
}
