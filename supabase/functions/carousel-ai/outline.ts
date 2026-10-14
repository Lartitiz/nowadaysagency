// carousel-ai : « plan envisagé » affiché pendant que le rédacteur réfléchit
// (titres prévus, jamais réutilisés dans le carrousel). Fiche 2, lot 2 de
// docs/robustesse/gros-fichiers.md : déplacé à l'identique depuis index.ts.

import { type StatusEmitter } from "../_shared/anthropic-stream.ts";
import { type UsageSink, getModelForAction } from "../_shared/anthropic.ts";
import { _deps, type CarouselRequestContext, buildPhotoContextRecap } from "./shared.ts";
import { OUTLINE_INSTRUCTION, OUTLINE_TOOL } from "./tools.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";
import { buildMixCarouselPrompt, buildPhotoCarouselPrompt } from "./prompts.ts";
import { carouselLengthPrompt } from "../_shared/carousel-length.ts";

export function plannedTitles(value: any): string[] {
  const titles = Array.isArray(value?.titles) ? value.titles : [];
  return titles
    .filter((t: unknown): t is string => typeof t === "string")
    .map((t: string) => t.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 20);
}

export async function emitPlannedTitles(system: string, userPrompt: string, emitStatus: StatusEmitter, sink: UsageSink): Promise<void> {
  try {
    const raw = await _deps.callAnthropic({
      model: getModelForAction("questions"), system,
      messages: [{ role: "user", content: userPrompt + OUTLINE_INSTRUCTION }],
      tool: OUTLINE_TOOL, max_tokens: 800, abortTimeoutMs: 20_000, maxRetries: 0,
    }, sink);
    const titles = plannedTitles(tryParseAiJson(raw));
    if (titles.length >= 3) emitStatus("outline", { titles });
  } catch {
    /* Simple repère d'attente : son échec ne change rien à la génération. */
  }
}

/**
 * Plan envisagé des carrousels photo et mixte (08/10/2026). Plan déjà validé à
 * l'étape « structure » : ses titres partent tout de suite, sans aucun appel.
 * Sinon, mêmes titres prévus que le carrousel texte (Haiku, texte seul : les
 * photos ne lui sont pas envoyées). Jamais pour un photo dump sans texte.
 */
export function startPhotoOutline(reqCtx: Pick<CarouselRequestContext, "body" | "emitStatus" | "isLinkedIn" | "systemPrompt">): { done: Promise<void>; usage: UsageSink } {
  const { body, emitStatus, isLinkedIn } = reqCtx;
  const usage: UsageSink = {};
  if (body.no_overlay) return { done: Promise.resolve(), usage };
  if (body.confirmed_structure?.length) {
    const titles = plannedTitles({ titles: body.confirmed_structure.map((s: any) => s.title_suggestion) });
    if (titles.length >= 2) emitStatus("outline", { titles });
    return { done: Promise.resolve(), usage };
  }
  const prompt = (body.carousel_type === "mix" ? buildMixCarouselPrompt(body, isLinkedIn) : buildPhotoCarouselPrompt(body, isLinkedIn)) +
    buildPhotoContextRecap(body.photo_contexts || body.photos) +
    `\n\nSujet : "${body.subject || "non précisé"}"\n${body.photo_description ? `Description des photos : "${body.photo_description}"\n` : ""}${carouselLengthPrompt(body)}\nObjectif : ${body.objective || "non précisé"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}\n` : ""}${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}`;
  return { done: emitPlannedTitles(reqCtx.systemPrompt, prompt, emitStatus, usage), usage };
}

/** Attend le plan envisagé et ajoute ses jetons à la ligne de crédit (une seule ligne). */
export async function addOutlineUsage(reqCtx: CarouselRequestContext, usage: UsageSink): Promise<void> {
  if (!reqCtx.outline) return;
  await reqCtx.outline.done;
  for (const k of ["input_tokens", "output_tokens", "total_tokens"] as const) {
    if (reqCtx.outline.usage[k]) usage[k] = (usage[k] || 0) + reqCtx.outline.usage[k]!;
  }
  reqCtx.outline = undefined;
}
