// Déplacé à l'identique depuis _shared/correction-pass.ts (lot 4 du découpage,
// 14/10/2026, docs/robustesse/gros-fichiers.md fiche 9). correction-pass.ts le réexporte.
// Seuls changements : chemins d'import relatifs (dont l'import dynamique de
// reel-postprocess.ts) et le commentaire du reel, recollé au-dessus de sa fonction.

import { claritySourceBlock } from "../content-clarity.ts";
import { keepStructureOrRevert } from "../text-structure-guard.ts";
import { callAnthropicSimple, type UsageSink } from "../anthropic.ts";
import { callCarouselWriter, carouselWriterDiagnostic } from "../carousel-model.ts";
import { applyEditorialReview, carouselEditorialSequence, carouselReviewFields, CAROUSEL_EDITORIAL_REVIEW_PROMPT, CAROUSEL_REVIEW_VERSION, CAROUSEL_REVIEW_MODEL, CAROUSEL_REVIEW_TOOL } from "../carousel-editorial-review.ts";
import { CAROUSEL_CORRECTION_PROMPT, CORRECTION_PROMPTS } from "./prompts.ts";
import { correctionModel, sourceFirstCorrectionPrompt, unwrapCorrectionOutput, type CorrectionFormat, type CorrectionOptions } from "./options.ts";
import { extractCarouselTexts, extractStoriesTexts, reinjectCarouselTexts, reinjectStoriesTexts } from "./fields.ts";

/**
 * Applique une passe de correction sur du contenu généré par l'IA.
 * Utilise un 2e appel Anthropic court avec température basse (0.3) pour 
 * détecter et corriger les patterns IA.
 * 
 * Comportement de fallback : si la correction échoue, retourne le contenu original.
 */
export async function applyCorrectionPass(
  content: string,
  format: CorrectionFormat,
  options: CorrectionOptions = {}
): Promise<string> {
  const { skipIfShorterThan = 200, enabled = true, logger, extraInstructions, abortTimeoutMs } = options;

  if (!enabled) {
    logger?.(`[correction-pass:${format}] SKIPPED (disabled)`);
    return content;
  }

  if (!content || (!extraInstructions && content.length < skipIfShorterThan)) {
    logger?.(`[correction-pass:${format}] SKIPPED (too short: ${content?.length})`);
    return content;
  }

  const correctionPrompt = CORRECTION_PROMPTS[format];
  if (!correctionPrompt) {
    logger?.(`[correction-pass:${format}] SKIPPED (no prompt for format)`);
    return content;
  }

  try {
    logger?.(`[correction-pass:${format}] STARTED, content length: ${content.length}`);

    const rawCorrected = await callAnthropicSimple(
      correctionModel(options),
      sourceFirstCorrectionPrompt(options, correctionPrompt),
      claritySourceBlock(options.sourceContext, options.authoredText) + (extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici le contenu à corriger :\n\n"""\n${content}\n"""`
        : `Voici le contenu à corriger :\n\n"""\n${content}\n"""`),
      0.3,
      4096,
      undefined,
      abortTimeoutMs
    );
    const corrected = unwrapCorrectionOutput(rawCorrected);

    if (!corrected || corrected.length < Math.min(skipIfShorterThan, content.length * 0.5)) {
      logger?.(`[correction-pass:${format}] FALLBACK (corrected too short: ${corrected?.length})`);
      return content;
    }

    // Garde de structure par le CODE (règles d'écriture inchangées) : une
    // correction qui fait disparaître une liste voulue, sa numérotation ou les
    // paragraphes est rejetée entière ; le texte d'avant reste intact.
    const guarded = keepStructureOrRevert(content, corrected, format, logger);
    if (guarded.reverted) return content;

    logger?.(`[correction-pass:${format}] DONE, corrected length: ${corrected.length}`);
    return corrected;
  } catch (error) {
    logger?.(`[correction-pass:${format}] ERROR: ${error}`);
    console.error(`[correction-pass:${format}] Failed, using original:`, error);
    return content;
  }
}

/**
 * Correction pass JSON-aware pour carrousels.
 * Extrait les textes du JSON, les corrige, puis les réinjecte sans casser la structure.
 * Fallback : retourne le contenu original si quoi que ce soit échoue.
 */
export async function applyCorrectionPassCarousel(
  jsonContent: string,
  options: CorrectionOptions = {}
): Promise<string> {
  const { skipIfShorterThan = 300, enabled = true, logger, extraInstructions, abortTimeoutMs } = options;

  if (!enabled) {
    logger?.(`[correction-pass:carousel-json] SKIPPED (disabled)`);
    return jsonContent;
  }

  try {
    // Step 1: Find and parse JSON from content
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger?.(`[correction-pass:carousel-json] SKIPPED (no JSON found)`);
      return jsonContent;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      logger?.(`[correction-pass:carousel-json] SKIPPED (invalid JSON)`);
      return jsonContent;
    }

    // Step 2: Extract text fields into annotated block
    if (options.semanticReview) {
      const fields = carouselReviewFields(parsed);
      if ((options.sourceContext?.length || 0) + (options.currentBrief?.length || 0) + jsonContent.length > 100_000) {
        parsed.editorial_review = {version: CAROUSEL_REVIEW_VERSION, status:"skipped", reason:"context-budget", edits:0};
        return JSON.stringify(parsed);
      }
      if (!fields.length) return jsonContent;
      let report: { status: string; fields: number; edits: number; error?: string };
      const reviewUsage: UsageSink = {};
      try {
        let baseline = "";
        if (options.reviewBaseline) {
          try {
            const draft = JSON.parse(options.reviewBaseline.match(/\{[\s\S]*\}/)?.[0] || "null");
            baseline = "\nBROUILLON AVANT RELECTURE (comparaison uniquement, PAS une source factuelle) :\n" + JSON.stringify(carouselReviewFields(draft).map(({ id, text }) => ({ id, text }))) +
              "\nVérifie les modifications déjà faites : elles doivent améliorer le texte sans slogan de remplacement, perte de sens ou voix aplatie. Corrige aussi un défaut résiduel ailleurs. Les extraits before doivent venir des CHAMPS ÉDITABLES actuels, jamais de cet ancien brouillon.\n";
          } catch { /* A missing baseline does not change the patch contract. */ }
        }
        const raw = await callCarouselWriter({
          // Replace the existing bounded review, never add another model pass.
          // Other formats and the legacy rollback correction remain unchanged.
          model: CAROUSEL_REVIEW_MODEL, system: CAROUSEL_EDITORIAL_REVIEW_PROMPT,
          messages: [{ role: "user", content:
          claritySourceBlock(options.sourceContext, options.authoredText, true) +
          "\nALERTES À EXAMINER EN CONTEXTE :\n" + (extraInstructions || "Aucune alerte automatique ; effectuer la relecture de tous les champs.") +
          (options.currentBrief ? "\nBRIEF ACTUEL PRIORITAIRE (faits, ton et limites de la demande ; respecter ces contraintes) :\n" + JSON.stringify(options.currentBrief) +
            "\nUne information déclarée absente dans CE brief reste absente, même si la marque décrit ailleurs une boutique, un produit disponible ou une habitude. Ne transpose pas ces informations à cet objet.\n" : "") +
          baseline + "\nSÉQUENCE DES SLIDES (repères de lecture uniquement, non modifiables) :\n" + JSON.stringify(carouselEditorialSequence(parsed)) +
          "\nCHAMPS ÉDITABLES DANS L'ORDRE DU CARROUSEL :\n" + JSON.stringify(fields.map(({ id, text }) => ({ field_id: id, text }))),
          }],
          max_tokens: 8192, abortTimeoutMs,
          tool: CAROUSEL_REVIEW_TOOL,
          // These strings include exact source excerpts, not freely generated prose.
          keepDashes: true,
        }, reviewUsage);
        const review = applyEditorialReview(parsed, raw, options.authoredText);
        parsed = review.doc;
        report = { status: review.status, fields: review.fields, edits: review.edits, ...(review.error ? { error: review.error } : {}) };
      } catch (error) {
        // No opaque full-document rewrite fallback. Preserve recoverable text.
        // Safe diagnostic code only (e.g. openai_http_429_insufficient_quota).
        report = { status: "unavailable", fields: fields.length, edits: 0, error: carouselWriterDiagnostic(error) };
      }
      logger?.(`[carousel-editorial:${CAROUSEL_REVIEW_VERSION}] ${JSON.stringify(report)}`);
      const previous = parsed.editorial_review?.version === CAROUSEL_REVIEW_VERSION ? parsed.editorial_review : undefined;
      parsed.editorial_review = { version: CAROUSEL_REVIEW_VERSION, ...report, pass: options.reviewBaseline ? 2 : 1,
        total_edits: (options.reviewBaseline ? Number(previous?.total_edits || 0) : 0) + report.edits,
        requested_model: CAROUSEL_REVIEW_MODEL, model: reviewUsage.model ?? null, effort: "medium",
        // Diagnostic provider usage, separate from user credits and writer usage.
        usage: reviewUsage,
        total_usage: Object.fromEntries(["input_tokens", "output_tokens", "total_tokens"].map(key => [key,
          (options.reviewBaseline ? Number(previous?.total_usage?.[key] || 0) : 0) + Number(reviewUsage[key as keyof UsageSink] || 0)])),
      };
      return jsonContent.replace(jsonMatch[0], () => JSON.stringify(parsed));
    }
    const textBlock = extractCarouselTexts(parsed);
    if (!textBlock || textBlock.length < skipIfShorterThan) {
      logger?.(`[correction-pass:carousel-json] SKIPPED (text too short: ${textBlock?.length})`);
      return jsonContent;
    }

    logger?.(`[correction-pass:carousel-json] STARTED, text block length: ${textBlock.length}`);

    // Step 3: Send only text to correction
    const rawCorrectedBlock = await callAnthropicSimple(
      correctionModel(options),
      sourceFirstCorrectionPrompt(options, CAROUSEL_CORRECTION_PROMPT),
      claritySourceBlock(options.sourceContext, options.authoredText) + (extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici les textes du carrousel à corriger :\n\n${textBlock}`
        : `Voici les textes du carrousel à corriger :\n\n${textBlock}`),
      0.3,
      4096,
      undefined,
      abortTimeoutMs
    );
    const correctedBlock = unwrapCorrectionOutput(rawCorrectedBlock);

    if (!correctedBlock || correctedBlock.length < 100) {
      logger?.(`[correction-pass:carousel-json] FALLBACK (corrected too short: ${correctedBlock?.length})`);
      return jsonContent;
    }

    // Step 4: Reinject corrected texts into original JSON
    const correctedParsed = reinjectCarouselTexts(parsed, correctedBlock);

    // Step 5: Reconstruct the full content string
    const correctedJson = JSON.stringify(correctedParsed);
    
    // Preserve any text before/after the JSON in the original content
    const jsonStart = jsonContent.indexOf(jsonMatch[0]);
    const jsonEnd = jsonStart + jsonMatch[0].length;
    const result = jsonContent.substring(0, jsonStart) + correctedJson + jsonContent.substring(jsonEnd);

    logger?.(`[correction-pass:carousel-json] DONE, result length: ${result.length}`);
    return result;
  } catch (error) {
    logger?.(`[correction-pass:carousel-json] ERROR: ${error}`);
    console.error(`[correction-pass:carousel-json] Failed, using original:`, error);
    return jsonContent;
  }
}

/**
 * Passe de correction d'une séquence de stories, story par story (même
 * mécanique que le carrousel : extraction annotée → Haiku → réinjection par
 * marqueur). Renvoie une nouvelle liste ; l'original n'est jamais muté. En cas
 * d'échec ou de réponse inexploitable, renvoie l'original avec changed = 0.
 */
export async function applyCorrectionPassStories(
  stories: any[],
  options: CorrectionOptions = {},
): Promise<{ stories: any[]; changed: number }> {
  const { skipIfShorterThan = 150, enabled = true, logger, extraInstructions, abortTimeoutMs } = options;
  const unchanged = { stories, changed: 0 };
  if (!enabled || !Array.isArray(stories) || stories.length === 0) return unchanged;
  const textBlock = extractStoriesTexts(stories);
  if (!textBlock || textBlock.length < skipIfShorterThan) {
    logger?.(`[correction-pass:stories] SKIPPED (text too short: ${textBlock?.length})`);
    return unchanged;
  }
  try {
    logger?.(`[correction-pass:stories] STARTED, text block length: ${textBlock.length}`);
    const rawCorrectedBlock = await callAnthropicSimple(
      correctionModel(options),
      sourceFirstCorrectionPrompt(options, CORRECTION_PROMPTS.stories),
      claritySourceBlock(options.sourceContext, options.authoredText) + (extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici les textes de la séquence à corriger :\n\n${textBlock}`
        : `Voici les textes de la séquence à corriger :\n\n${textBlock}`),
      0.3,
      4096,
      undefined,
      abortTimeoutMs,
    );
    const correctedBlock = unwrapCorrectionOutput(rawCorrectedBlock);
    if (!correctedBlock || !/\[STORY 1 - /.test(correctedBlock)) {
      logger?.(`[correction-pass:stories] FALLBACK (réponse sans marqueurs: ${correctedBlock?.length})`);
      return unchanged;
    }
    const out = reinjectStoriesTexts(stories, correctedBlock);
    logger?.(`[correction-pass:stories] DONE, ${out.changed} champ(s) modifié(s)`);
    return out;
  } catch (error) {
    logger?.(`[correction-pass:stories] ERROR: ${error}`);
    console.error(`[correction-pass:stories] Failed, using original:`, error);
    return unchanged;
  }
}

/**
 * Correction pass JSON-aware pour scripts Reel (audit qualité reels 12/07).
 * Même approche que la variante carrousel : on extrait les textes corrigibles
 * en bloc balisé, on corrige, on réinjecte — la structure JSON (timings, cuts,
 * plan_tournage, checklist) ne passe jamais par le correcteur et ne peut pas
 * casser. Fallback : retourne l'objet original si quoi que ce soit échoue.
 */
export async function applyCorrectionPassReel(
  parsedReel: unknown,
  options: CorrectionOptions = {},
): Promise<unknown> {
  const { skipIfShorterThan = 150, enabled = true, logger, extraInstructions, abortTimeoutMs } = options;

  if (!enabled) {
    logger?.(`[correction-pass:reel-json] SKIPPED (disabled)`);
    return parsedReel;
  }

  try {
    const { extractReelTexts, reinjectReelTexts } = await import("../reel-postprocess.ts");
    const textBlock = extractReelTexts(parsedReel);
    if (!textBlock || textBlock.length < skipIfShorterThan) {
      logger?.(`[correction-pass:reel-json] SKIPPED (text too short: ${textBlock?.length})`);
      return parsedReel;
    }

    logger?.(`[correction-pass:reel-json] STARTED, text block length: ${textBlock.length}`);

    const rawCorrectedBlock = await callAnthropicSimple(
      correctionModel(options),
      sourceFirstCorrectionPrompt(options, CORRECTION_PROMPTS.reel),
      claritySourceBlock(options.sourceContext, options.authoredText) + (extraInstructions
        ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${extraInstructions}\n\nVoici les textes du reel à corriger :\n\n${textBlock}`
        : `Voici les textes du reel à corriger :\n\n${textBlock}`),
      0.3,
      4096,
      undefined,
      abortTimeoutMs,
    );
    const correctedBlock = unwrapCorrectionOutput(rawCorrectedBlock);

    if (!correctedBlock || correctedBlock.length < 100 || !correctedBlock.includes("[SECTION 1")) {
      logger?.(`[correction-pass:reel-json] FALLBACK (corrected block invalid: ${correctedBlock?.length})`);
      return parsedReel;
    }

    const corrected = reinjectReelTexts(parsedReel, correctedBlock);
    logger?.(`[correction-pass:reel-json] DONE`);
    return corrected;
  } catch (error) {
    logger?.(`[correction-pass:reel-json] ERROR: ${error}`);
    console.error(`[correction-pass:reel-json] Failed, using original:`, error);
    return parsedReel;
  }
}
