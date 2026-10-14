// carousel-ai : parcours texte (accroches, slides, idées de sujets et
// d'angles). Fiche 2, lot 5 de docs/robustesse/gros-fichiers.md : déplacé à
// l'identique depuis index.ts.

import { type CarouselRequestContext } from "../shared.ts";
import { buildHooksPrompt, buildSlidesPrompt, buildSuggestTopicsPrompt, buildSuggestAnglesPrompt } from "../prompts.ts";
import { runGenerationAndRespond } from "../steps/generate.ts";

export async function handleHooksRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildHooksPrompt(reqCtx.body, reqCtx.isLinkedIn);
  return runGenerationAndRespond("hooks", userPrompt, reqCtx);
}

export async function handleSlidesRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildSlidesPrompt(reqCtx.body, reqCtx.isLinkedIn);
  return runGenerationAndRespond("slides", userPrompt, reqCtx);
}

export async function handleSuggestTopicsRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildSuggestTopicsPrompt(reqCtx.body, reqCtx.isLinkedIn);
  return runGenerationAndRespond("suggest_topics", userPrompt, reqCtx);
}

export async function handleSuggestAnglesRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildSuggestAnglesPrompt(reqCtx.body, reqCtx.isLinkedIn);
  return runGenerationAndRespond("suggest_angles", userPrompt, reqCtx);
}
