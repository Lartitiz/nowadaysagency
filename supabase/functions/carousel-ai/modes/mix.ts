// carousel-ai : parcours mixte avec plan validé ou sans récit continu
// (`handleMixCarouselRequest`) et nettoyage du régime « texte d'abord »
// (`enforceTextFirstDirectives`, utilisé seulement ici). Fiche 2, lot 6 de
// docs/robustesse/gros-fichiers.md : déplacé à l'identique depuis index.ts.
// N'importe aucun autre mode (boundaries_test.ts).

import { type CarouselRequestContext, stageTimer, firstDraftStream, buildPhotoContextRecap, pushPhotoWithContext, _deps, pickCarouselModel, retryIfTooShort, carouselSlideFloor, carouselMismatchResponse, echoContext, reviewAllowed, pickCorrectionModel, CORRECTION_ABORT_MS } from "../shared.ts";
import { continuousCarouselResponse } from "../steps/continuous.ts";
import { buildMixCarouselNewsReactionPrompt, buildMixCarouselPrompt } from "../prompts.ts";
import { type UsageSink } from "../../_shared/anthropic.ts";
import { carouselLengthPrompt, carouselStructureIssues, longMixSlideIssues } from "../../_shared/carousel-length.ts";
import { PHOTO_MISMATCH_SYSTEM_REMINDER, MIX_CAROUSEL_TOOL } from "../tools.ts";
import { withoutMixWriterLayout, normalizeOverlayStyles, capVisualSchemas, placeMixSchemas, logSchemaFormatting } from "../layout.ts";
import { repairCarouselStructure, finalizeCarousel } from "../steps/finalize.ts";
import { tryParseAiJson } from "../../_shared/parse-ai-json.ts";
import { carouselNeedsPolish } from "../../_shared/correction-pass.ts";
import { applyGuardedCarouselCorrection, runRedacGate } from "../../_shared/redac-gate.ts";
import { mergeConfirmedStructure, maxStructurePhotoIndex, normalizePhotoIndexes, analyzeMixComposition } from "../../_shared/photo-slide-structure.ts";
import { addOutlineUsage } from "../outline.ts";
import { logContentQuality, threadOutcome, carouselDurations } from "../../_shared/content-quality.ts";
import { photoMatchPhotoCount } from "../final-photo-match.ts";
import { CAROUSEL_WRITING_VERSION } from "../writing-contract.ts";
import { CAROUSEL_WRITER_VERSION } from "../writer.ts";
import { clientStillThere } from "../../_shared/anthropic-stream.ts";

// Post-traitement text_first : force photo_index à null partout (l'IA recopie
// parfois le photo_index des exemples JSON) et télémétrie des directives manquantes.
export function enforceTextFirstDirectives(content: string): string {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return content;
    const parsed = JSON.parse(jsonMatch[0]);
    const slides = parsed?.slides;
    if (!Array.isArray(slides) || slides.length === 0) return content;
    let missingDirectives = 0;
    slides.forEach((s: any) => {
      if (!s) return;
      s.photo_index = null;
      const isPhoto = s.slide_type === "photo_full" || s.slide_type === "photo_integrated";
      if (isPhoto && !(typeof s.photo_directive === "string" && s.photo_directive.trim())) {
        missingDirectives += 1;
        // Repli (vu en sonde le 10/07) : sans directive, la carte de casting se
        // dégrade en simple « Ajouter une photo » et la slide échappe au
        // verrouillage du CTA. On synthétise depuis ce que la slide fournit.
        const fallback = [s.visual_suggestion, s.overlay_text, s.title]
          .find((x: unknown) => typeof x === "string" && (x as string).trim());
        s.photo_directive = typeof fallback === "string" && fallback.trim()
          ? `Une image qui illustre : ${fallback.trim()}`
          : "Une image cohérente avec l'univers de la marque, qui illustre le propos de cette slide.";
      }
      if (!isPhoto) {
        delete s.photo_directive;
        delete s.photo_query_en;
        delete s.library_photo_index;
        delete s.news_entity;
      }
    });
    if (missingDirectives > 0) {
      console.warn(`[carousel-ai] text_first: ${missingDirectives} slide(s) photo sans photo_directive`);
    }
    return content.replace(jsonMatch[0], JSON.stringify(parsed, null, 2));
  } catch (err) {
    console.warn("[carousel-ai] enforceTextFirstDirectives: échec, content laissé tel quel", err);
    return content;
  }
}

export async function handleMixCarouselRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const continuous = await continuousCarouselResponse(reqCtx);
  if (continuous) return continuous;
  const { body, currentAuthoredText, currentBrief, semanticReviewEnabled, userId, workspaceId, category, isLinkedIn, systemPrompt, gateInputText, researchText, testimonySource, brandGuardText, captionEndingRule, newsContext, previousHooks, corsHeaders, emitStatus, startedAt } = reqCtx;

  const hasNews = typeof newsContext === "string" && newsContext.trim().length > 0;
  const mixPrompt = hasNews
    ? buildMixCarouselNewsReactionPrompt(body, isLinkedIn)
    : buildMixCarouselPrompt(body, isLinkedIn);
  let content: string;
  let doGenerate: (sink: UsageSink) => Promise<string>;
  // One bounded repair shares the original sources, including selected photos.
  let doRepair: ((draft: string, defects: string, sink: UsageSink, abortTimeoutMs?: number) => Promise<string>) | undefined;
  const mixUsage: UsageSink = {};
  const clock = stageTimer(startedAt);
  const draftStream = firstDraftStream(emitStatus);
  emitStatus("writing");

  // Cible affichée à l'IA — même valeur que le plancher de retryIfTooShort plus
  // bas (carouselSlideFloor(body, 8)) : sans elle, un mix sans slide_count explicite
  // n'avait AUCUN chiffre de longueur nulle part dans le prompt.
  const mixSlideTarget = carouselLengthPrompt(body);

  if (body.photos && body.photos.length > 0 && !body.confirmed_structure) {
    const messageContent: any[] = [];

    // 1. Brief créatif EN PREMIER (avant les photos)
    const photoCtxRecap = buildPhotoContextRecap(body.photos);
    messageContent.push({
      type: "text",
      text: `BRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer TOUT le carrousel.\n\nObjectif : ${body.objective || "non précisé ; déduire une intention prudente du brief et du contexte de marque"}\n${carouselLengthPrompt(body)}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${body.slide_structure ? `\nStructure imposée : ${body.slide_structure.length} slides définies par l'utilisateur·ice.` : ""}${photoCtxRecap}\n\nVoici ${body.photos.length} photo(s) à intégrer dans le carrousel :`,
    });

    // 2. Photos (avec contexte par photo s'il existe — l'ordre = ordre d'envoi front)
    body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
      pushPhotoWithContext(messageContent, photo, idx);
    });

    // 3. Instruction finale après les photos (le rappel anti-refus vit aussi ici,
    // en dernière position avant la génération — cf. PHOTO_MISMATCH_SYSTEM_REMINDER).
    // Rappel de longueur ajouté ici aussi (audit timeouts 17/08) : en vision, la
    // cible de slides posée tout en haut du 1er bloc se dilue après plusieurs
    // photos — un carrousel écrasé à 1 slide déclenchait un retry complet ~1
    // run/2 en photo (même symptôme probable ici, jamais mesuré côté mix).
    messageContent.push({
      type: "text",
      text: `Analyse ces ${body.photos.length} photo(s) et crée un carrousel mixte qui respecte le brief créatif ci-dessus. Le concept "${body.subject || ""}" doit être la colonne vertébrale de chaque slide.\n\n${mixSlideTarget}\n\nRappel : tu GÉNÈRES avec ces photos (en écarter une individuellement est permis). Le refus photo_mismatch est réservé à une contradiction frontale entre les photos et une chose concrète que le sujet tapé promet de montrer — jamais à un décalage d'esthétique ou d'univers de marque.`,
    });

    doGenerate = (sink: UsageSink) => _deps.callCarouselWriter({
      ...draftStream(),
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + mixPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: messageContent }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
    doRepair = (draft, defects, sink, abortTimeoutMs = 120_000) => _deps.callCarouselWriter({
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + mixPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: [...messageContent, {type:"text",text:"BROUILLON À COMPLÉTER :\n"+draft+"\n"+defects}] }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs,
    }, sink);
  } else {
    const photoDescLine = body.text_first
      ? ""
      : `\nDescription des photos : "${body.photo_description || "non fournie"}"`;
    const textPrompt = mixPrompt + buildPhotoContextRecap(body.photo_contexts || body.photos) + `\n\nBRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer tout le carrousel.\n${photoDescLine}\n${carouselLengthPrompt(body)}\nObjectif : ${body.objective || "non précisé ; déduire une intention prudente du brief et du contexte de marque"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${body.slide_structure ? `\nStructure imposée : ${body.slide_structure.length} slides définies par l'utilisateur·ice.` : ""}`;

    doGenerate = (sink: UsageSink) => _deps.callCarouselWriter({
      ...draftStream(),
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
    doRepair = (draft, defects, sink, abortTimeoutMs = 120_000) => _deps.callCarouselWriter({
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt + "\n\nBROUILLON À COMPLÉTER :\n" + draft + "\n\n" + defects }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs,
    }, sink);
  }

  // DISPOSITION hors de la rédaction (04/10/2026) : ce que la rédaction du
  // mixte écrirait quand même en disposition est ignoré (layout.ts).
  ({ write: doGenerate, repair: doRepair } = withoutMixWriterLayout(doGenerate, doRepair));
  content = await clock.timed("write_ms", doGenerate(mixUsage));
  // Plancher déterministe de slides (audit carrousel photo 12/07) : le modèle
  // peut renvoyer un carrousel écrasé (1 slide vue en live ~1 run/2 en photo).
  // 0 slide = refus légitime (photo_mismatch), laissé au check ci-dessous ;
  // entre 1 et le plancher → UN retry, puis on livre ce qu'on a (gates ensuite).
  content = await clock.timed("write_ms", retryIfTooShort(content, doGenerate, mixUsage, carouselSlideFloor(body, 8), "mix"));

  {
    const mismatch = carouselMismatchResponse(content, body, mixUsage, "mix", corsHeaders);
    if (mismatch) return mismatch;
  }
  const threadMix = await clock.timed("structure_ms", repairCarouselStructure(content, { body, label: "mix", inspect: (v) => { const p = tryParseAiJson(v); return [...carouselStructureIssues(p, body), ...longMixSlideIssues(p, body)]; }, emitStatus, usage: mixUsage, regenerate: doRepair, startedAt }));
  content = threadMix.content;

  const editorialBaseline = content;
  // Contextual review includes photo overlays and every visible text field.
  try {
    if (semanticReviewEnabled || carouselNeedsPolish(content) || currentAuthoredText.trim()) {
      emitStatus("correcting");
      const corrected = await clock.timed("review_ms", applyGuardedCarouselCorrection(content, {
        inputText: gateInputText, researchText, testimonySource, brandGuardText, echo: echoContext(reqCtx),
        correction: { currentBrief, semanticReview: semanticReviewEnabled,
          enabled: reviewAllowed(startedAt),
          skipIfShorterThan: 300,
          logger: (msg) => console.log(msg),
          model: pickCorrectionModel(body),
            authoredText: currentAuthoredText,
          abortTimeoutMs: CORRECTION_ABORT_MS,
        },
      }));
      if (corrected && corrected !== content) {
        content = corrected;
      }
    } else {
      console.log("[correction-pass:carousel-json] SKIPPED (scan déterministe propre, mix)");
    }
  } catch (correctionError) {
    console.error("Correction pass failed in carousel-ai (mix):", correctionError);
  }

  if (body.text_first) {
    content = enforceTextFirstDirectives(content);
  } else {
    // Restaure l'intention de la structure confirmée (photo_index/slide_type)
    // AVANT le filet séquentiel — le modèle les omet en sortie (audit 12/07).
    content = mergeConfirmedStructure(content, body.confirmed_structure?.length ? body.confirmed_structure : body.slide_structure, { automatic: body.scenario_origin === "automatic" });
    const photoCountForIndexes = body.photos?.length || body.photo_contexts?.length || maxStructurePhotoIndex(body.confirmed_structure?.length ? body.confirmed_structure : body.slide_structure);
    content = normalizePhotoIndexes(content, photoCountForIndexes);
    content = normalizeOverlayStyles(content);
    // Télémétrie composition (lot D, audit 12/07) : ratio photo < 40 % ou 3 slides
    // de même type d'affilée — mesure seule, fix éventuel après lecture des logs.
    const comp = analyzeMixComposition(content);
    if (comp && (comp.violatesRatio || comp.violatesRun)) {
      console.warn(JSON.stringify({ event: "carousel_mix_composition", ...comp }));
    }
  }
  content = capVisualSchemas(content, "carousel-ai(mix)");
  // Quality-gate rédactionnel : mesures en code + re-passe ciblée si violations
  const gateMix = await clock.timed("gate_ms", runRedacGate(content, {
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
  content = gateMix.content;
  content = await clock.timed("thread_ms", finalizeCarousel(content,reqCtx,{usage:mixUsage,repaired:threadMix.repaired,regenerate:doRepair,timings:clock.timings}));
  {
    // SCHÉMAS du mixte : slide « pause » dessinée par le code (layout.ts).
    const withSchemas = await clock.timed("schemas_ms", placeMixSchemas(content, { usage: mixUsage, startedAt }));
    content = withSchemas.content;
    logSchemaFormatting("mix", withSchemas.plan);
  }
  await addOutlineUsage(reqCtx, mixUsage);
  const timings = clock.done("mix");
  if (clientStillThere(emitStatus, "carousel_mix")) await _deps.logUsage(userId, category, "carousel_mix", mixUsage.total_tokens, mixUsage.model, workspaceId);
  await logContentQuality(userId, "carousel_mix", gateMix, mixUsage.model, workspaceId, body.subject, threadOutcome(content),
    carouselDurations("mix", timings, { content, photos: photoMatchPhotoCount(body) }));
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION,
    writer: { version: CAROUSEL_WRITER_VERSION, model: mixUsage.model, effort: "medium" }, timings,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
