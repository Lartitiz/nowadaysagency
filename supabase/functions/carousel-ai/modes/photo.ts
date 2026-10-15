// carousel-ai : parcours photo avec plan validé ou sans récit continu
// (`handlePhotoCarouselRequest`) et `emptySlidesText`. Fiche 2, lot 6 de
// docs/robustesse/gros-fichiers.md : déplacé à l'identique depuis index.ts.
// N'importe aucun autre mode (boundaries_test.ts).

import { type CarouselRequestContext, stageTimer, firstDraftStream, buildPhotoContextRecap, pushPhotoWithContext, _deps, pickCarouselModel, retryIfTooShort, carouselSlideFloor, carouselMismatchResponse, echoContext, reviewAllowed, pickCorrectionModel, CORRECTION_ABORT_MS } from "../shared.ts";
import { continuousCarouselResponse } from "../steps/continuous.ts";
import { buildPhotoCarouselNewsReactionPrompt, buildPhotoCarouselPrompt } from "../prompts.ts";
import { type UsageSink } from "../../_shared/anthropic.ts";
import { carouselLengthPrompt } from "../../_shared/carousel-length.ts";
import { PHOTO_MISMATCH_SYSTEM_REMINDER, PHOTO_CAROUSEL_TOOL } from "../tools.ts";
import { repairCarouselStructure, finalizeCarousel } from "../steps/finalize.ts";
import { withoutPhotoWriterLayout, normalizeOverlayStyles, capVisualSchemas, assignPhotoTemplates, revalidatePhotoLayoutContent } from "../layout.ts";
import { carouselNeedsPolish } from "../../_shared/correction-pass.ts";
import { applyGuardedCarouselCorrection, runRedacGate, rescoreCaptionOnly } from "../../_shared/redac-gate.ts";
import { mergeConfirmedStructure, maxStructurePhotoIndex, normalizePhotoIndexes } from "../../_shared/photo-slide-structure.ts";
import { addOutlineUsage } from "../outline.ts";
import { logContentQuality, threadOutcome, carouselDurations } from "../../_shared/content-quality.ts";
import { photoMatchPhotoCount } from "../final-photo-match.ts";
import { CAROUSEL_WRITING_VERSION } from "../writing-contract.ts";
import { CAROUSEL_WRITER_VERSION } from "../writer.ts";
import { clientStillThere } from "../../_shared/anthropic-stream.ts";

// ── Photo carousel mode ──
/** « Photos brutes » : slides photo pleine page sans aucun texte (même liste blanche que l'app, src/lib/pure-photo-slides.ts). */
export function emptySlidesText(content: string): string {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return content;
  let parsed: any;
  try { parsed = JSON.parse(m[0]); } catch { return content; }
  const doc = parsed?.carousel?.slides ? parsed.carousel : parsed;
  if (!Array.isArray(doc?.slides)) return content;
  doc.slides = doc.slides.map((s: any, i: number) => ({
    slide_number: i + 1, role: s?.role || "body", slide_type: "photo_full",
    overlay_text: null, title: "", body: "", photo_index: s?.photo_index ?? i + 1,
  }));
  doc.no_overlay = true;
  return content.replace(m[0], JSON.stringify(parsed, null, 2));
}

export async function handlePhotoCarouselRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const continuous = await continuousCarouselResponse(reqCtx);
  if (continuous) return continuous;
  const { body, currentAuthoredText, currentBrief, semanticReviewEnabled, userId, workspaceId, category, isLinkedIn, systemPrompt, gateInputText, researchText, testimonySource, brandGuardText, captionEndingRule, newsContext, previousHooks, corsHeaders, emitStatus, startedAt } = reqCtx;

  const hasNews = typeof newsContext === "string" && newsContext.trim().length > 0;
  const photoPrompt = hasNews
    ? buildPhotoCarouselNewsReactionPrompt(body, isLinkedIn)
    : buildPhotoCarouselPrompt(body, isLinkedIn);
  let content: string;
  let doGenerate: (sink: UsageSink) => Promise<string>;
  // Shares the same source-preserving repair and deadline as mixed carousels.
  let doRepair: ((draft: string, defects: string, sink: UsageSink, abortTimeoutMs?: number) => Promise<string>) | undefined;
  const photoUsage: UsageSink = {};
  const clock = stageTimer(startedAt);
  const draftStream = firstDraftStream(emitStatus);
  emitStatus("writing");

  // Cible affichée à l'IA, réutilisée dans le rappel de fin de message (recency,
  // audit timeouts 17/08) — même valeur que la clause "Nombre de slides cible"
  // du 1er bloc ci-dessous.
  const photoSlideTarget = carouselLengthPrompt(body);

  if (body.photos && body.photos.length > 0 && !body.confirmed_structure) {
    // Vision mode: send photos to Claude
    const messageContent: any[] = [];
    const photoCtxRecap = buildPhotoContextRecap(body.photos);

    // 1. Brief + recap contexte AVANT les photos
    messageContent.push({
      type: "text",
      text: `Voici ${body.photos.length} photo(s) pour un carrousel photo ${isLinkedIn ? "LinkedIn" : "Instagram"}.\n\nSujet : "${body.subject || "non précisé"}"\nObjectif : ${body.objective || "non précisé ; déduire une intention prudente du brief et du contexte de marque"}\n${carouselLengthPrompt(body)}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${photoCtxRecap}`,
    });

    // 2. Photos (avec contexte par photo s'il existe — l'ordre = ordre d'envoi front)
    body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
      pushPhotoWithContext(messageContent, photo, idx);
    });

    // 3. Instruction finale après les photos (le rappel anti-refus vit aussi ici,
    // en dernière position avant la génération — cf. PHOTO_MISMATCH_SYSTEM_REMINDER).
    // Rappel de longueur ajouté ici aussi (audit timeouts 17/08) : la cible posée
    // tout en haut du 1er bloc se dilue après plusieurs photos — carrousel écrasé
    // à 1 slide sur 6 demandées, vu en live ~1 run/2, qui déclenchait un retry
    // complet (2e appel vision de plein tarif) plutôt qu'une exception rare.
    messageContent.push({
      type: "text",
      text: `Construis un propos étayé à partir du brief et de la marque, puis écris ses paragraphes successifs. Les photos accompagnent ce texte ; ne les décris pas l’une après l’autre.\n\n${photoSlideTarget}\n\nRappel : tu GÉNÈRES avec ces photos. Le refus photo_mismatch est réservé à une contradiction frontale entre les photos et une chose concrète que le sujet tapé promet de montrer — jamais à un décalage d'esthétique ou d'univers de marque.`,
    });

    doGenerate = (sink: UsageSink) => _deps.callCarouselWriter({
      ...draftStream(),
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + photoPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: messageContent }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
    doRepair = (draft, defects, sink, abortTimeoutMs = 120_000) => _deps.callCarouselWriter({
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + photoPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: [...messageContent, {type:"text",text:"BROUILLON À COMPLÉTER :\n"+draft+"\n"+defects}] }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs,
    }, sink);
  } else {
    // Text-only mode: description without actual photos
    const textPrompt = photoPrompt + buildPhotoContextRecap(body.photo_contexts || body.photos) + `\n\nSujet : "${body.subject || "non précisé"}"\nDescription des photos : "${body.photo_description || "non fournie"}"\n${carouselLengthPrompt(body)}\nObjectif : ${body.objective || "non précisé ; déduire une intention prudente du brief et du contexte de marque"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}`;

    doGenerate = (sink: UsageSink) => _deps.callCarouselWriter({
      ...draftStream(),
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
    doRepair = (draft, defects, sink, abortTimeoutMs = 120_000) => _deps.callCarouselWriter({
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt + "\n\nBROUILLON À COMPLÉTER :\n" + draft + "\n\n" + defects }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs,
    }, sink);
  }

  content = await clock.timed("write_ms", doGenerate(photoUsage));
  // Plancher déterministe de slides (audit carrousel photo 12/07) : 1 slide
  // livrée sur 6 demandées vue en live ~1 run/2. 0 slide = refus légitime
  // (photo_mismatch), laissé au check ci-dessous.
  // « Photos brutes » (09/10/2026) : l'app efface le texte des slides et ne
  // garde que la légende. Le texte est écrit (la légende naît du même appel),
  // puis vidé tout de suite : relecture et chasse aux tics ne portent plus que
  // sur la légende, et ce qui ne sert qu'aux slides (2e essai si trop court,
  // structure, gabarits, juge du fil, couverture) est sauté.
  const photosOnly = body.photos_only === true;
  if (!photosOnly) content = await clock.timed("write_ms", retryIfTooShort(content, doGenerate, photoUsage, carouselSlideFloor(body, 6), "photo"));

  {
    const mismatch = carouselMismatchResponse(content, body, photoUsage, "photo", corsHeaders);
    if (mismatch) return mismatch;
  }
  const threadPhoto = photosOnly
    ? { content: emptySlidesText(content), repaired: false }
    : await clock.timed("structure_ms", repairCarouselStructure(content, { body, label: "photo", emitStatus, usage: photoUsage, regenerate: doRepair, startedAt }));
  // Mise en page hors de l'écriture : gabarit, chiffre, liste, étape et
  // attribution sont posés ensuite, à partir du texte FINAL (assignPhotoTemplates,
  // après la relecture et le redac-gate, plus bas).
  content = withoutPhotoWriterLayout(threadPhoto.content);
  const editorialBaseline = content;
  // Short photo overlays need the same contextual review as text slides.
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
      console.log("[correction-pass:carousel-json] SKIPPED (scan déterministe propre, photo)");
    }
  } catch (correctionError) {
    console.error("Correction pass failed in carousel-ai (photo):", correctionError);
  }

  // Restaure l'intention de la structure confirmée (photo_index/slide_type)
  // AVANT le filet séquentiel — le modèle les omet en sortie (audit 12/07 :
  // null 13/13 malgré la consigne). En photo pur, une slide sans slide_type
  // EST une slide photo (le renderer front fait déjà cette hypothèse).
  content = mergeConfirmedStructure(content, body.confirmed_structure?.length ? body.confirmed_structure : body.slide_structure, { automatic: body.scenario_origin === "automatic" });
  {
    const photoCountForIndexes = body.photos?.length || body.photo_contexts?.length || maxStructurePhotoIndex(body.confirmed_structure?.length ? body.confirmed_structure : body.slide_structure);
    content = normalizePhotoIndexes(content, photoCountForIndexes, { assumePhotoWhenTypeMissing: true });
  }
  // Un overlay long en style « minimal »/« technique » rend un pavé (lot E).
  content = normalizeOverlayStyles(content);
  content = capVisualSchemas(content, "carousel-ai(photo)");
  const gatePhoto = await clock.timed("gate_ms", runRedacGate(content, {
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
  // La re-passe du gate réécrit tout le JSON : rien ne doit revenir sur les slides.
  content = photosOnly ? emptySlidesText(gatePhoto.content) : gatePhoto.content;
  // Relecture-gabarits (13/07) : sur les textes DÉFINITIFS (post relecture
  // éditoriale et redac-gate), pose le gabarit visuel de chaque slide. Avant le
  // 04/10/2026 elle tournait AVANT la relecture sémantique quand celle-ci était
  // active (pour que la relecture « voie » liste/attribution) : la relecture
  // pouvait alors corriger l'overlay ou patcher big_number/points, et l'extrait
  // mis en valeur ne correspondait plus au texte final. Ces champs sont
  // désormais des extraits EXACTS du texte relu (aucune matière nouvelle à
  // relire) et la relecture ne les patche plus (carouselReviewFields).
  if (!photosOnly) content = await clock.timed("templates_ms", assignPhotoTemplates(content, {
    model: pickCorrectionModel(body),
    logger: (m) => console.log(m),
  }));
  content = await clock.timed("thread_ms", finalizeCarousel(content,reqCtx,{usage:photoUsage,repaired:threadPhoto.repaired,regenerate:doRepair,timings:clock.timings}));
  // Une réparation globale du fil (finalizeCarousel) peut réécrire les textes
  // après l'assignation : la mise en page est revérifiée contre le texte final,
  // un extrait qui n'y figure plus est retiré (reçus ré-empreints s'ils étaient
  // à jour).
  content = await revalidatePhotoLayoutContent(content, (m) => console.log(m));
  // « Photos brutes » : l'app effacera le texte des slides, la note affichée
  // juge la légende seule (sinon « 60/100 » sur un carrousel sans texte).
  if (body.photos_only === true) {
    content = rescoreCaptionOnly(content, { inputText: gateInputText, researchText, researchNumbersCap: reqCtx.researchNumbersCap, brandGuardText, echo: echoContext(reqCtx), testimonySource, authoredText: currentAuthoredText });
  }
  await addOutlineUsage(reqCtx, photoUsage);
  const timings = clock.done("photo");
  if (clientStillThere(emitStatus, "carousel_photo")) await _deps.logUsage(userId, category, "carousel_photo", photoUsage.total_tokens, photoUsage.model, workspaceId);
  await logContentQuality(userId, "carousel_photo", gatePhoto, photoUsage.model, workspaceId, body.subject, threadOutcome(content),
    carouselDurations("photo", timings, { content, photos: photoMatchPhotoCount(body) }));
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION,
    writer: { version: CAROUSEL_WRITER_VERSION, model: photoUsage.model, effort: "medium" }, timings,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
