// carousel-ai : enchaînement commun de rédaction (`runGenerationAndRespond`)
// pour les accroches, les slides, le carrousel express texte, les idées de
// sujets et d'angles, et les questions texte. Fiche 2, lot 5 de
// docs/robustesse/gros-fichiers.md : déplacé à l'identique depuis index.ts.

import { type CarouselRequestContext, writerTimeoutMs, _deps, pickCarouselModel, echoContext, reviewAllowed, pickCorrectionModel, CORRECTION_ABORT_MS } from "../shared.ts";
import { type UsageSink, type AnthropicOptions, getModelForAction } from "../../_shared/anthropic.ts";
import { PHOTO_QUESTIONS_TOOL, QUESTIONS_TOOL } from "../tools.ts";
import { draftSlidesTracker } from "../../_shared/carousel-draft-stream.ts";
import { emitPlannedTitles } from "../outline.ts";
import { carouselNeedsPolish } from "../../_shared/correction-pass.ts";
import { applyGuardedCarouselCorrection, runRedacGate } from "../../_shared/redac-gate.ts";
import { repairCarouselStructure, finalizeCarousel } from "./finalize.ts";
import { capVisualSchemas, placeTextSchemas, logSchemaFormatting } from "../layout.ts";
import { logContentQuality, threadOutcome, carouselDurations } from "../../_shared/content-quality.ts";
import { carouselLength, autoMaxSlides, longTextSlides } from "../../_shared/carousel-length.ts";
import { tryParseAiJson } from "../../_shared/parse-ai-json.ts";
import { CAROUSEL_WRITING_VERSION } from "../writing-contract.ts";
import { CAROUSEL_WRITER_VERSION } from "../writer.ts";
import { clientStillThere } from "../../_shared/anthropic-stream.ts";

// Partagée par hooks / slides / express_full (texte standard) / suggest_topics /
// suggest_angles / deepening_questions (variante texte) : un seul appel IA,
// passe de correction JSON conditionnelle, quality-gate rédactionnel + cap des
// visual_schema (uniquement express_full/slides), puis logUsage.
export async function runGenerationAndRespond(
  type: string,
  userPrompt: string,
  reqCtx: CarouselRequestContext,
): Promise<Response> {
  const { body, currentAuthoredText, currentBrief, semanticReviewEnabled, userId, workspaceId, category, systemPrompt, gateInputText, researchText, testimonySource, brandGuardText, captionEndingRule, isLinkedIn, previousHooks, corsHeaders, emitStatus, startedAt } = reqCtx;

  // L1 : Haiku pour les deepening_questions (tâche structurée et bornée).
  const isWriting = ["express_full", "slides", "hooks"].includes(type);
  const usage: UsageSink = {};
  if (type !== "deepening_questions") emitStatus("writing");
  const writingOptions: Omit<AnthropicOptions, "model"> = {
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    // Carrousel texte jusqu'à 20 slides (04/10/2026) : la réflexion adaptative
    // compte dans ce plafond, 8192 laissait peu de marge à un texte découpé
    // une idée par slide. Un plafond plus haut ne coûte que ce qui est écrit.
    max_tokens: type === "deepening_questions" ? 1024 : 16000,
    // Le carrousel tournait au défaut API (1.0), plus chaud que les autres
    // canaux (0.8) → on cadre la créativité du format vitrine. Les questions
    // (Haiku, tâche bornée) gardent le comportement par défaut.
    ...(type === "deepening_questions" ? {} : { temperature: 0.85 }),
    // Questions = appel Haiku court et borné : 30s/tentative pour qu'un fetch
    // qui traîne bascule en retry plutôt que de bloquer le chemin d'activation.
    // Les autres types (express_full/slides/hooks) tournaient SANS limite avant
    // ce correctif (audit timeouts 17/08) — 120s aligné sur la convention
    // "génération standard" du reste des edges du repo. Depuis le 04/10/2026 la
    // rédaction suit le budget global (writerTimeoutMs) au lieu de 120 s fixes.
    ...(type === "deepening_questions" ? { abortTimeoutMs: 30000, tool: (body.carousel_type === "photo" || body.carousel_type === "mix") ? PHOTO_QUESTIONS_TOOL : QUESTIONS_TOOL } : { abortTimeoutMs: writerTimeoutMs(startedAt) }),
  };
  // Durées par étape (ms), renvoyées avec la réponse : sans elles la lenteur du
  // 30/09 (~190 s) n'était décomposable qu'en devinant entre deux évènements SSE.
  const timings: Record<string, number> = { prep_ms: Date.now() - startedAt };
  const timed = async <T>(key: string, work: Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try { return await work; } finally { timings[key] = (timings[key] || 0) + Date.now() - t0; }
  };
  // SLIDES EN BROUILLON (07/10/2026) : chaque slide terminée part à l'écran
  // pendant l'écriture (évènement status `draft`), le texte relu la remplace.
  const draftStream = type === "express_full" ? { onText: draftSlidesTracker((slides) => emitStatus("draft", { slides })) } : {};
  // Jetons comptés à part : le rédacteur réécrit `usage` en fin d'appel.
  const outlineUsage: UsageSink = {};
  const outline = type === "express_full" ? emitPlannedTitles(systemPrompt, userPrompt, emitStatus, outlineUsage) : Promise.resolve();
  let content = await timed("write_ms", isWriting
    ? _deps.callCarouselWriter({ ...writingOptions, ...draftStream, model: pickCarouselModel(body) }, usage)
    : _deps.callAnthropic({ ...writingOptions, model: getModelForAction(type === "deepening_questions" ? "questions" : "carousel") }, usage));

  // Contextual review for every generated carousel, legacy scan only on rollback.
  // Ne rejette jamais : une relecture en échec rend le texte reçu.
  const review = async (value: string): Promise<string> => {
    try {
      if (semanticReviewEnabled || carouselNeedsPolish(value) || currentAuthoredText.trim()) {
        emitStatus("correcting");
        const corrected = await applyGuardedCarouselCorrection(value, {
          inputText: gateInputText, researchText, testimonySource, brandGuardText, echo: echoContext(reqCtx),
          correction: { currentBrief, semanticReview: semanticReviewEnabled,
            enabled: reviewAllowed(startedAt),
            skipIfShorterThan: 300,
            logger: (msg) => console.log(msg),
            model: pickCorrectionModel(body),
            authoredText: currentAuthoredText,
            abortTimeoutMs: CORRECTION_ABORT_MS,
          },
        });
        if (corrected && corrected !== value) return corrected;
      } else {
        console.log("[correction-pass:carousel-json] SKIPPED (scan déterministe propre, texte)");
      }
    } catch (correctionError) {
      console.error("Correction pass failed in carousel-ai:", correctionError);
    }
    return value;
  };

  const regenerate=(draft:string,defects:string,sink:UsageSink,abortTimeoutMs=120_000)=>_deps.callCarouselWriter({
    ...writingOptions,abortTimeoutMs,model:pickCarouselModel(body),messages:[{role:"user",content:userPrompt+"\n\nBROUILLON À COMPLÉTER :\n"+draft+"\n\n"+defects}],
  },sink);
  let structuralRepair=false;
  if(type==="express_full" || type==="slides") {
    const repaired=await timed("structure_ms",repairCarouselStructure(content,{body,label:type,emitStatus,usage,startedAt,regenerate}));
    content=repaired.content;structuralRepair=repaired.repaired;
  }
  const editorialBaseline=content;
  if(type==="express_full" || type==="slides" || type==="hooks") content=await timed("review_ms",review(content));

  let gateExpress: Awaited<ReturnType<typeof runRedacGate>> | null = null;

  // Garde DÉTERMINISTE sur les schémas (max 2, jamais consécutifs) : layout.ts.
  if (type === "express_full" || type === "slides") {
    content = capVisualSchemas(content, "carousel-ai");
    // Quality-gate rédactionnel : mesures en code + re-passe ciblée si violations
    gateExpress = await timed("gate_ms", runRedacGate(content, {
      isLinkedIn,
      onStatus: emitStatus,
      inputText: gateInputText,
      researchText,
      researchNumbersCap: reqCtx.researchNumbersCap,
      testimonySource,
      echo: echoContext(reqCtx),
      brandGuardText,
      captionEnding: captionEndingRule,
      correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: reviewAllowed(startedAt), skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
    }));
    content = gateExpress.content;
  }

  if (type === "express_full" || type === "slides") {
    content=await timed("thread_ms",finalizeCarousel(content,reqCtx,{usage,repaired:structuralRepair,regenerate,timings,expectedRepairMs:timings.write_ms}));
    // Mesure écrite APRÈS le contrôle du fil : la ligne porte aussi son issue.
    if (gateExpress) await logContentQuality(userId, `carousel_${type}`, gateExpress, usage.model, workspaceId, body.subject, threadOutcome(content),
      carouselDurations(type, { ...timings, total_ms: Date.now() - startedAt }, { content, avantSchemas: true }));
    // SCHÉMAS décidés après l'écriture et ses relectures, sur le texte final
    // (la rédaction ne les connaît plus : un changement d'écriture ne peut plus
    // les faire disparaître). Échec ou manque de temps → aucun schéma, texte livré.
    const withSchemas = await timed("schemas_ms", placeTextSchemas(content, { usage, startedAt, maxSlides: carouselLength(body).exact ? 0 : autoMaxSlides(body) }));
    content = withSchemas.content;
    const finalParsed = tryParseAiJson<any>(content);
    console.log(JSON.stringify({ event: "carousel_rhythm", label: type, slides: Array.isArray(finalParsed?.slides) ? finalParsed.slides.length : 0, long_slides: longTextSlides(finalParsed, body) }));
    logSchemaFormatting(type, withSchemas.plan);
  }

  // deepening_questions (variante texte) est gratuit — arbitrage 10/07/2026 :
  // un carrousel débite 2 crédits (rédaction express_full + carousel_visual),
  // les questions pré-chargées ne comptent pas (aligné sur creative-flow).
  await outline;
  for (const k of ["input_tokens", "output_tokens", "total_tokens"] as const) if (outlineUsage[k]) usage[k] = (usage[k] || 0) + outlineUsage[k]!;
  if (type !== "deepening_questions") {
    if (clientStillThere(emitStatus, `carousel_${type}`)) await _deps.logUsage(userId, category, `carousel_${type}`, usage.total_tokens, usage.model, workspaceId);
  }

  timings.total_ms = Date.now() - startedAt;
  if (isWriting) console.log(JSON.stringify({ type: "carousel_timings", label: type, review_before_judge: true, ...timings }));
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION,
    ...(isWriting ? { writer: { version: CAROUSEL_WRITER_VERSION, model: usage.model, effort: "medium" }, timings } : {}),
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
