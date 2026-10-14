import { carouselEditorialFields } from "./carousel-editorial-review.ts";
// ── Quality-gate rédactionnel des carrousels (audit du 10/07/2026) ──
//
// Constat de l'audit corpus : le `quality_check` auto-déclaré par le modèle est
// FAUX (déclarait « slides < 50 mots » et « caption ≠ slide » sur des carrousels
// qui violaient les deux), et les règles ANTI_SLOP restent probabilistes (le
// retournement par négation sortait 3-4× par carrousel malgré la règle « 1 max »).
//
// Ce module fait la seule chose fiable : MESURER en code, puis demander UNE
// re-passe LLM ciblée sur les phrases fautives (jamais plus d'une), et re-mesurer.
// Le quality_check émis au front est celui calculé ici (source: "code").

import { applyCorrectionPass, applyCorrectionPassCarousel, extractCarouselTexts, reinjectCarouselTexts, type CorrectionFormat, type CorrectionOptions } from "./correction-pass.ts";
import { MOULDED_VERBATIMS, findReversals, dropUserSourcedReversals } from "./redac-gate/reversals.ts";
import { numbersIn, findFabricatedNumbers } from "./redac-gate/numbers.ts";
// Découpage (fiche 7) : les familles sorties vivent dans ./redac-gate/ ; ce
// fichier réexporte ce qui était public, sous le même nom.
export { dropUserSourcedReversals } from "./redac-gate/reversals.ts";
export { numbersIn } from "./redac-gate/numbers.ts";
import { slideTexts } from "./redac-gate/carousel-analysis.ts";
import { type EchoContext, findHookEchoes, findBrandCopyOverlap, hookEchoesBefore, textHook } from "./redac-gate/echoes.ts";
export type { EchoContext } from "./redac-gate/echoes.ts";
export { findHookEchoes, findBrandCopyOverlap, findSharedPassages, findRecentEchoes, hookEchoesBefore, textHook } from "./redac-gate/echoes.ts";
export { fixFrenchElisions, fixElisionsInFields, countStaccatoAcrossSlides, countAnaphoraAcrossSlides, countResultConclusionOpeners, isOpeningRhetoricalQuestion, countEmptyAdjectives, hookEndingSimilarity, findChoppyFragments, countChoppyFragments, measureSlopSignals } from "./redac-gate/slop-signals.ts";
export type { SlopSignals } from "./redac-gate/slop-signals.ts";
import { type RedacAnalysis, type TextRedacAnalysis, redacViolations, carouselRedacRawCount, redacScore, textRedacViolations, textRedacRawCount } from "./redac-gate/scoring.ts";
export type { RedacAnalysis, TextRedacAnalysis } from "./redac-gate/scoring.ts";
export { redacViolations, carouselRedacRawCount, redacScore, textRedacViolations, textRedacRawCount } from "./redac-gate/scoring.ts";
import { type ResearchNumbers, researchNumbers, baseInputText, findUnsourcedResearchNumbers, enforceResearchNumberSources, emptiedMarkers, enforceResearchNumberCap } from "./redac-gate/research-numbers.ts";
export type { ResearchNumbers } from "./redac-gate/research-numbers.ts";
export { researchNumbers, findUnsourcedResearchNumbers, findResearchNumbersUsed, enforceResearchNumberSources, emptiedMarkers, enforceResearchNumberCap } from "./redac-gate/research-numbers.ts";
import { findInventedTestimonials, findInventedExperiences, enforceNoInventedTestimonials } from "./redac-gate/testimony.ts";
export { findInventedTestimonials, findInventedExperiences, enforceNoInventedTestimonials } from "./redac-gate/testimony.ts";
import { analyzeCarouselRedac, normalizeCaptionHashtags, buildQualityCheck, captionEndingViolated, type CaptionEndingRule, emptyAnalysis } from "./redac-gate/carousel-analysis.ts";
export { analyzeCarouselRedac, normalizeCaptionHashtags, rescoreCaptionOnly, captionEndingViolated } from "./redac-gate/carousel-analysis.ts";
export type { CaptionEndingRule } from "./redac-gate/carousel-analysis.ts";
import { buildFixInstructions, buildTextFixInstructions } from "./redac-gate/fix-instructions.ts";
export { buildTextFixInstructions } from "./redac-gate/fix-instructions.ts";


export interface RedacGateResult {
  content: string;
  repassed: boolean;
  before: RedacAnalysis;
  after: RedacAnalysis;
  /** Score rédactionnel 0-100 du document final (null si contenu illisible). */
  score: number | null;
  /** Nombre de violations du document final (null si contenu illisible). */
  violations: number | null;
  /** Échos d'accroche avant la re-passe ; absent si la garde n'était pas armée. */
  hookEchoesBefore?: number;
}

interface CarouselCorrectionContext {
  correction: CorrectionOptions;
  inputText?: string;
  /** Matière de recherche (incluse dans inputText) : ses chiffres seuls exigent leur source. */
  researchText?: string;
  brandGuardText?: string;
  echo?: EchoContext;
  /** Brief + réponses + actu (jamais branding ni recherche) : seule source d'un témoignage ou d'un vécu. Absent = non mesuré. */
  testimonySource?: string;
}

// Numéro d'ordre en tête d'un titre de slide (« 1. », « 2) », « Étape 3 ») :
// la relecture ne doit jamais le faire disparaître (audit du 04/10/2026). Le
// garde-fou « lost-number » ne protège que les chiffres de la source, et les
// ordinaux en sont exclus : un « 2. » écrit par la rédaction n'y est pas.
const ORDER_PREFIX = /^\s*(?:[ée]tape\s+(\d{1,2})(?!\d)|(\d{1,2})\s*[.)](?=\s))/i;
const ORDER_PREFIX_FIELDS = new Set(["title", "hook", "accroche", "kicker", "overlay_text"]);
const orderNumber = (text: string) => { const m = ORDER_PREFIX.exec(text || ""); return m ? Number(m[1] ?? m[2]) : null; };

/** Une correction qui retire (ou change) le numéro d'ordre en tête d'un titre
 * est refusée POUR CE CHAMP : il reprend sa version d'avant relecture, le reste
 * de la correction est gardé (« dégrader la correction, pas le texte »).
 * Modifie `candidate` en place ; renvoie les champs restaurés. */
export function protectOrderPrefixes(original: any, candidate: any): string[] {
  const after = new Map(carouselEditorialFields(candidate).map(f => [f.id, f.text]));
  const restored: string[] = [];
  for (const field of carouselEditorialFields(original)) {
    const key = String(field.path[field.path.length - 1]);
    if (!field.path.includes("slides") || field.path.includes("visual_schema") || !ORDER_PREFIX_FIELDS.has(key)) continue;
    const n = orderNumber(field.text);
    if (n === null || orderNumber(after.get(field.id) ?? "") === n) continue;
    let target = candidate;
    for (const step of field.path.slice(0, -1)) target = target?.[step];
    if (!target || typeof target !== "object") continue;
    target[key] = field.text;
    restored.push(field.id);
  }
  return restored;
}

/** Shared by the preliminary polish and the final gate. No extra model call. */
export async function applyGuardedCarouselCorrection(content: string, opts: CarouselCorrectionContext): Promise<string> {
  const source = opts.correction.sourceContext ?? opts.inputText;
  const corrected = await applyCorrectionPassCarousel(content, { ...opts.correction, sourceContext: source });
  if (!corrected || corrected === content) return content;
  try {
    const parse = (s: string) => JSON.parse(s.match(/\{[\s\S]*\}/)?.[0] || "null");
    const originalDoc = parse(content), candidateDoc = parse(corrected);
    if (!originalDoc || !candidateDoc) return content;
    const orderKept = protectOrderPrefixes(originalDoc, candidateDoc);
    if (orderKept.length) {
      opts.correction.logger?.(`[carousel-correction] numéro d'ordre conservé, champ gardé avant relecture ${JSON.stringify(orderKept)}`);
      console.log(JSON.stringify({ event: "carousel_order_prefix_protected", fields: orderKept, semantic: Boolean(opts.correction.semanticReview) }));
      if (candidateDoc.editorial_review && typeof candidateDoc.editorial_review === "object") candidateDoc.editorial_review.order_prefix_kept = orderKept;
    }
    // Legacy nested carousels use the same textual fields as the flat response.
    const original = originalDoc.carousel?.slides ? originalDoc.carousel : originalDoc;
    const candidate = candidateDoc.carousel?.slides ? candidateDoc.carousel : candidateDoc;
    const allowed = source === undefined ? undefined : numbersIn(source);
    const research = allowed ? researchNumbers(numbersIn(baseInputText(opts.inputText, opts.researchText)), opts.researchText, baseInputText(opts.inputText, opts.researchText)) : undefined;
    const before = dropUserSourcedReversals(analyzeCarouselRedac(original, allowed, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
    const after = dropUserSourcedReversals(analyzeCarouselRedac(candidate, allowed, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
    // Compare raw counts, not the capped score: a fifth invented number is
    // still a regression even when the score already caps that penalty at 3.
    const counts = (a: RedacAnalysis) => [a.reversals.length, Number(a.ctaDuplicated), a.moulded.length,
      a.fabricatedNumbers.length, a.durationConflicts.length, a.brandCopyOverlap.length, a.hookEchoes.length,
      a.unsourcedResearchNumbers?.length ?? 0, a.inventedTestimonials?.length ?? 0, a.inventedExperiences?.length ?? 0,
      a.recentEchoes?.length ?? 0];
    const beforeCounts = counts(before);
    const COUNT_NAMES = ["reversals", "cta-duplicated", "moulded",
      "fabricated-numbers", "duration-conflicts", "brand-copy", "hook-echoes", "unsourced-research-numbers",
      "invented-testimonials", "invented-experiences", "recent-echoes"];
    const regressions = counts(after).map((n, i) => n > beforeCounts[i] ? `regression:${COUNT_NAMES[i]}` : "").filter(Boolean);
    // Equal counts can still hide a new unsupported value (5 days → 9 days).
    // Reuse the detector's ordinal exclusions and decimal normalization.
    const unsupportedValue = (finding: string) => finding.split(" ")[0].replace(",", ".");
    const originalUnsupported = new Set(before.fabricatedNumbers.map(unsupportedValue));
    const newUnsupported = after.fabricatedNumbers.map(unsupportedValue).filter(v => !originalUnsupported.has(v));
    const prose = (doc: any) => [
      ...(Array.isArray(doc.slides) ? doc.slides.map(slideTexts) : []),
      typeof doc.caption === "string" ? doc.caption : [doc.caption?.hook, doc.caption?.body, doc.caption?.cta].filter(Boolean).join(" "),
    ].join("\n");
    const originalText = opts.correction.semanticReview ? carouselEditorialFields(originalDoc).map(f => f.text).join("\n") : prose(original);
    const candidateText = opts.correction.semanticReview ? carouselEditorialFields(candidateDoc).map(f => f.text).join("\n") : prose(candidate);
    const candidateNumbers = numbersIn(candidateText);
    // Un chiffre de recherche repris sans source peut légitimement disparaître
    // (passé en formulation qualitative) : ce n'est pas une donnée perdue.
    const unsourced = new Set((before.unsourcedResearchNumbers ?? []).map(unsupportedValue));
    const lostNumbers = allowed ? [...numbersIn(originalText)].filter(n => allowed.has(n) && !candidateNumbers.has(n) && !unsourced.has(n)) : [];
    // Protect sourced quotations; unrelated quotation marks in the brand
    // profile do not force material into the output. This is not a fact checker.
    const quotes = [...originalText.matchAll(/«\s*([^»]+?)\s*»|“([^”]+)”|"([^"\n]{6,})"/g)]
      .map(m => (m[1] || m[2] || m[3]).trim());
    const lostQuote = Boolean(source) && quotes.some(q => source!.includes(q) && !candidateText.includes(q));
    // Named reasons: the rejection used to be silent, so 2/2 real reviews were
    // thrown away (28/09) without any way to tell which check tripped.
    const guard = [...regressions, ...newUnsupported.map(v => `new-unsupported-number:${v}`),
      ...lostNumbers.map(n => `lost-number:${n}`), ...(lostQuote ? ["lost-quote"] : [])];
    if (guard.length) {
      opts.correction.logger?.(`[carousel-correction] original conservé : contrôle dégradé ou donnée source supprimée ${JSON.stringify(guard)}`);
      if (opts.correction.semanticReview) {
        originalDoc.editorial_review = { ...candidateDoc.editorial_review, status: "rejected", edits: 0,
          proposed_edits: candidateDoc.editorial_review?.edits ?? null, guard,
          total_edits: originalDoc.editorial_review?.total_edits || 0, error: "fidelity-guard" };
        return content.replace(content.match(/\{[\s\S]*\}/)![0], () => JSON.stringify(originalDoc));
      }
      return content;
    }
    return orderKept.length ? corrected.replace(corrected.match(/\{[\s\S]*\}/)![0], () => JSON.stringify(candidateDoc)) : corrected;
  } catch {
    return content;
  }
}

/**
 * Gate complet sur le `content` (JSON fenced) d'un carrousel :
 * mesure → si violations, UNE re-passe LLM ciblée → re-mesure → hashtags
 * normalisés → quality_check remplacé par la version calculée.
 * En cas de JSON illisible, renvoie le contenu tel quel (même contrat que les
 * autres gardes de carousel-ai).
 */
export async function runRedacGate(
  content: string,
  opts: {
    isLinkedIn: boolean;
    correction: CorrectionOptions;
    onStatus?: (s: string) => void;
    /** Texte d'entrée (brief, réponses, branding, actu) : liste blanche des chiffres autorisés. */
    inputText?: string;
    /** Matière de recherche (déjà incluse dans inputText) : ses chiffres seuls exigent leur source. */
    researchText?: string;
    /** Forme de chute de caption imposée par le tirage code (caption v2). */
    captionEnding?: CaptionEndingRule;
    /** Champs de marque bruts (buildBrandGuardText) : passages à ne jamais recopier tels quels. */
    brandGuardText?: string;
    /** Contenus DÉJÀ générés sur ce sujet : garde anti-redite d'accroche. */
    echo?: EchoContext;
    /** Brief + réponses + actu (jamais branding ni recherche) : témoignages et vécus au passé mesurés contre elle. Absent = non mesurés. */
    testimonySource?: string;
    /** Cas personnel fourni (lived-case.ts) : au plus N chiffres venus de la seule recherche. Absent = pas de plafond. */
    researchNumbersCap?: number;
  },
): Promise<RedacGateResult> {
  const parseFenced = (c: string): { parsed: any; raw: string } | null => {
    const m = c.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return { parsed: JSON.parse(m[0]), raw: m[0] };
    } catch {
      return null;
    }
  };

  const first = parseFenced(content);
  if (!first) return { content, repassed: false, before: emptyAnalysis(), after: emptyAnalysis(), score: null, violations: null };

  const allowedNumbers = opts.inputText !== undefined ? numbersIn(opts.inputText) : undefined;
  const research = allowedNumbers ? researchNumbers(numbersIn(baseInputText(opts.inputText, opts.researchText)), opts.researchText, baseInputText(opts.inputText, opts.researchText)) : undefined;
  const before = dropUserSourcedReversals(analyzeCarouselRedac(first.parsed, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
  let out = content;
  let repassed = false;

  let fixes = buildFixInstructions(before);
  const endingViolatedBefore = captionEndingViolated(first.parsed, opts.captionEnding);
  if (endingViolatedBefore && opts.captionEnding) {
    fixes += (fixes ? "\n\n" : "") +
      `CHUTE DE CAPTION NON CONFORME : la forme imposée pour cette génération est « ${opts.captionEnding.instruction} ». ` +
      (opts.captionEnding.requiresQuestion
        ? `La caption ne contient aucune question : réécris le champ "cta" de la CAPTION en question spécifique au sujet.`
        : `La caption se termine par une question alors que la forme imposée n'en est pas une : réécris le champ "cta" de la CAPTION dans la forme imposée, SANS aucun point d'interrogation. Garde le sens, change la forme.`);
  }
  const review = first.parsed.editorial_review;
  // Second review only to retry a technical failure (invalid/unavailable).
  // - Rejected by the fidelity guard: the draft is untouched, re-asking the
  //   same model about the same text is the same call again (28/09).
  // - Reviewed, with or without edits: no verification pass any more (30/09,
  //   arbitrage Laetitia). It cost ~40 s of the ~190 s text phase; kept edits
  //   are already checked in code by the fidelity guard (numbers, quotes,
  //   regressions). Findings measured by the gate (`fixes`) still trigger
  //   their targeted re-pass below.
  const verifySemanticReview = opts.correction.semanticReview && opts.correction.reviewBaseline &&
    review?.status !== "rejected" && review?.status !== "reviewed";
  if (fixes || verifySemanticReview) {
    try {
      opts.onStatus?.("correcting");
      const corrected = await applyGuardedCarouselCorrection(out, {
        inputText: opts.inputText,
        researchText: opts.researchText,
        brandGuardText: opts.brandGuardText,
        echo: opts.echo,
        testimonySource: opts.testimonySource,
        correction: { ...opts.correction, extraInstructions: fixes },
      });
      if (corrected && corrected !== out) {
        out = corrected;
        // A rejected review only rewrites its own report, never the text.
        repassed = parseFenced(corrected)?.parsed?.editorial_review?.status !== "rejected";
      }
    } catch (e) {
      console.error("[redac-gate] re-passe ciblée échouée, contenu conservé :", e);
    }
  }

  const finalDoc = parseFenced(out) || parseFenced(content);
  if (!finalDoc) return { content: out, repassed, before, after: before, score: redacScore(before), violations: redacViolations(before), hookEchoesBefore: hookEchoesBefore(before, opts.echo) };

  // « Ton cas d'abord » (04/10/2026) : avec un cas personnel fourni, au plus
  // `researchNumbersCap` chiffres de la seule recherche. Au-delà, passe dédiée
  // courte qui retire l'excédent ; gardée seulement si le compte baisse, qu'aucun
  // autre compteur ne monte, qu'aucun chiffre du brief ne disparaît et qu'aucun
  // passage ne reste vide. Avant la passe de sources : moins de chiffres à sourcer.
  const cap = opts.researchNumbersCap;
  if (research && cap !== undefined && opts.correction.enabled !== false) {
    try {
      const doc = finalDoc.parsed;
      const analyzeDoc = (d: any) => dropUserSourcedReversals(analyzeCarouselRedac(d, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
      const current = analyzeDoc(doc);
      if ((current.researchNumbersUsed?.length ?? 0) > cap) {
        const block = extractCarouselTexts(doc);
        const unmarked = (t: string) => t.replace(/\[[^\]\n]{1,40}\]/g, " ");
        // Chiffres du brief, des réponses, du branding ou de l'actu : jamais retirés.
        const briefNumbers = allowedNumbers ? [...numbersIn(unmarked(block))].filter((n) => allowedNumbers.has(n) && !research.only.has(n)) : [];
        const trimmed = await enforceResearchNumberCap(block, (b) => analyzeDoc(reinjectCarouselTexts(doc, b)), cap, {
          logger: opts.correction.logger, abortTimeoutMs: opts.correction.abortTimeoutMs, before: current,
          otherCount: (a) => carouselRedacRawCount(a),
          reject: (candidate) => {
            const kept = numbersIn(unmarked(candidate));
            const lost = briefNumbers.filter((n) => !kept.has(n));
            if (lost.length) return `chiffre du brief perdu ${JSON.stringify(lost)}`;
            const emptied = emptiedMarkers(block, candidate);
            return emptied.length ? `passage vidé ${JSON.stringify(emptied)}` : null;
          },
        });
        if (trimmed.applied) {
          finalDoc.parsed = reinjectCarouselTexts(doc, trimmed.content);
          repassed = true;
        }
      }
    } catch (e) {
      console.error("[redac-gate] passe chiffres de recherche en trop échouée, contenu conservé :", e);
    }
  }

  // Chiffres de la recherche encore sans source après la re-passe : passe dédiée
  // sur les textes balisés (jamais après le juge final : correction désactivée).
  if (research && opts.correction.enabled !== false) {
    try {
      const doc = finalDoc.parsed;
      const analyzeDoc = (d: any) => dropUserSourcedReversals(analyzeCarouselRedac(d, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
      const current = analyzeDoc(doc);
      if (current.unsourcedResearchNumbers?.length) {
        const sourced = await enforceResearchNumberSources(extractCarouselTexts(doc), (b) => analyzeDoc(reinjectCarouselTexts(doc, b)), research, {
          logger: opts.correction.logger, abortTimeoutMs: opts.correction.abortTimeoutMs, before: current,
          otherCount: (a) => carouselRedacRawCount(a) - (a.unsourcedResearchNumbers?.length ?? 0),
        });
        if (sourced.applied) {
          finalDoc.parsed = reinjectCarouselTexts(doc, sourced.content);
          repassed = true;
        }
      }
    } catch (e) {
      console.error("[redac-gate] passe chiffres de recherche échouée, contenu conservé :", e);
    }
  }

  // Témoignages ou vécus au passé inventés encore là après la relecture : passe
  // dédiée courte sur les textes balisés (même patron que les chiffres de
  // recherche ; jamais quand la correction est désactivée). Gardée seulement si
  // le compte baisse, qu'aucun autre compteur ne monte et qu'aucun chiffre
  // sourcé ne disparaît.
  if (opts.testimonySource !== undefined && opts.correction.enabled !== false) {
    try {
      const doc = finalDoc.parsed;
      const analyzeDoc = (d: any) => dropUserSourcedReversals(analyzeCarouselRedac(d, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
      const current = analyzeDoc(doc);
      if (current.inventedTestimonials?.length || current.inventedExperiences?.length) {
        const block = extractCarouselTexts(doc);
        // Les marqueurs « [SLIDE 3 - BODY] » ne sont pas des chiffres du texte.
        const unmarked = (t: string) => t.replace(/\[[^\]\n]{1,40}\]/g, " ");
        const sourcedNumbers = allowedNumbers ? [...numbersIn(unmarked(block))].filter((n) => allowedNumbers.has(n)) : [];
        const cleaned = await enforceNoInventedTestimonials(block, (b) => analyzeDoc(reinjectCarouselTexts(doc, b)), {
          logger: opts.correction.logger, abortTimeoutMs: opts.correction.abortTimeoutMs, before: current,
          otherCount: (a) => carouselRedacRawCount(a) - (a.inventedTestimonials?.length ?? 0) - (a.inventedExperiences?.length ?? 0),
          reject: (candidate) => {
            const kept = numbersIn(unmarked(candidate));
            const lost = sourcedNumbers.filter((n) => !kept.has(n));
            return lost.length ? `chiffre sourcé perdu ${JSON.stringify(lost)}` : null;
          },
        });
        if (cleaned.applied) {
          finalDoc.parsed = reinjectCarouselTexts(doc, cleaned.content);
          repassed = true;
        }
      }
    } catch (e) {
      console.error("[redac-gate] passe témoignages inventés échouée, contenu conservé :", e);
    }
  }

  // Filet schémas : la re-passe ne voit que les textes — un visual_schema qui
  // porte encore des chiffres sans source est retiré en code (la slide redevient
  // texte au rendu). Vu au re-test v3 : slides propres mais schéma stats
  // « 20 % d'eau / 7-14j / 1000°C+ » entièrement inventé.
  if (allowedNumbers) {
    const slides = Array.isArray(finalDoc.parsed?.slides) ? finalDoc.parsed.slides : [];
    for (const sl of slides) {
      if (!sl?.visual_schema) continue;
      const fab = findFabricatedNumbers(JSON.stringify(sl.visual_schema), allowedNumbers);
      if (fab.length) {
        console.log(`[redac-gate] visual_schema slide ${sl.slide_number} retiré (chiffres sans source : ${fab.map((f) => f.split(" ")[0]).join(", ")})`);
        sl.visual_schema = null;
      }
    }
    // Filet gabarits photo : la re-passe LLM ne réécrit que les textes — elle ne
    // peut pas corriger un big_number ou un point de liste. Un chiffre encore
    // sans source ici est retiré EN CODE ; le rendu dégrade proprement le
    // gabarit (resolvePhotoTemplate) plutôt que d'afficher une stat inventée en 170px.
    for (const sl of slides) {
      if (sl?.big_number && findFabricatedNumbers(String(sl.big_number), allowedNumbers).length) {
        console.log(`[redac-gate] big_number slide ${sl.slide_number} retiré (chiffre sans source : ${sl.big_number})`);
        sl.big_number = null;
        if (sl.template === "chiffre") sl.template = null;
      }
      if (Array.isArray(sl?.points) && sl.points.length) {
        const kept = sl.points.filter((p: any) => !findFabricatedNumbers(String(p), allowedNumbers).length);
        if (kept.length !== sl.points.length) {
          console.log(`[redac-gate] points slide ${sl.slide_number} : ${sl.points.length - kept.length} item(s) retiré(s) (chiffres sans source)`);
          sl.points = kept.length >= 2 ? kept : null;
          if (!sl.points && sl.template === "liste") sl.template = null;
        }
      }
    }
  }

  let after = dropUserSourcedReversals(analyzeCarouselRedac(finalDoc.parsed, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
  // Duplication caption/slide PERSISTANTE malgré la re-passe (vue livrée avec le
  // flag true, audit 12/07 lot D) : suppression déterministe — le CTA vit sur la
  // slide, la caption garde sa chute (dernière ligne du body). Supprimer > inventer.
  if (after.ctaDuplicated && finalDoc.parsed?.caption) {
    console.log("[redac-gate] caption.cta supprimé (duplication de la dernière slide persistante après re-passe)");
    finalDoc.parsed.caption.cta = "";
    after = dropUserSourcedReversals(analyzeCarouselRedac(finalDoc.parsed, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
  }
  normalizeCaptionHashtags(finalDoc.parsed, opts.isLinkedIn);
  const echoesBefore = hookEchoesBefore(before, opts.echo);
  finalDoc.parsed.quality_check = buildQualityCheck(after, repassed, opts.researchNumbersCap, echoesBefore);

  out = out.includes(finalDoc.raw)
    ? out.replace(finalDoc.raw, JSON.stringify(finalDoc.parsed, null, 2))
    : content.replace(first.raw, JSON.stringify(finalDoc.parsed, null, 2));

  console.log(
    `[redac-gate] retournements ${before.reversals.length}→${after.reversals.length}, slides>50 ${before.overlongSlides.length}→${after.overlongSlides.length}, ctaDup ${before.ctaDuplicated}→${after.ctaDuplicated}, moulés ${before.moulded.length}→${after.moulded.length}, chiffres inventés ${before.fabricatedNumbers.length}→${after.fabricatedNumbers.length}, chiffres de recherche sans source ${before.unsourcedResearchNumbers?.length ?? 0}→${after.unsourcedResearchNumbers?.length ?? 0}, chiffres de recherche repris ${before.researchNumbersUsed?.length ?? 0}→${after.researchNumbersUsed?.length ?? 0}${opts.researchNumbersCap !== undefined ? ` (plafond ${opts.researchNumbersCap}, cas personnel fourni)` : ""}, témoignages inventés ${before.inventedTestimonials?.length ?? 0}→${after.inventedTestimonials?.length ?? 0}, vécus inventés ${before.inventedExperiences?.length ?? 0}→${after.inventedExperiences?.length ?? 0}, durées contradictoires ${before.durationConflicts.length}→${after.durationConflicts.length}, recopie fiche marque ${before.brandCopyOverlap.length}→${after.brandCopyOverlap.length}, échos d'accroche ${before.hookEchoes.length}→${after.hookEchoes.length}, redites récentes ${before.recentEchoes?.length ?? 0}→${after.recentEchoes?.length ?? 0}, hashtags ${before.hashtagsCount}→${Math.min(before.hashtagsCount, opts.isLinkedIn ? 2 : 3)}, re-passe=${repassed}${opts.captionEnding ? `, chute caption ${endingViolatedBefore ? "NON CONFORME" : "ok"}→${captionEndingViolated(finalDoc.parsed, opts.captionEnding) ? "NON CONFORME" : "ok"} (forme ${opts.captionEnding.requiresQuestion ? "question" : "non-question"})` : ""}`,
  );

  return { content: out, repassed, before, after, score: redacScore(after), violations: redacViolations(after), hookEchoesBefore: echoesBefore };
}


// ── Variante TEXTE (lot 4) : LinkedIn et newsletter ──
// Mêmes mesures que le gate carrousel, sur un texte brut. Le résultat s'injecte
// en `extraInstructions` dans la passe de correction DÉJÀ existante de
// creative-flow (aucun appel IA supplémentaire).


/** `testimonySource` : brief + réponses + actu ; absent = témoignages non mesurés. */
export function analyzeTextRedac(text: string, allowedNumbers?: Set<string>, brandGuardText?: string, echo?: EchoContext, research?: ResearchNumbers, testimonySource?: string): TextRedacAnalysis {
  const reversals = findReversals(text || "");
  const moulded = MOULDED_VERBATIMS.map((re) => (text || "").match(re)?.[0]).filter(Boolean) as string[];
  const fabricatedNumbers = allowedNumbers ? findFabricatedNumbers(text || "", allowedNumbers) : [];
  const unsourcedResearchNumbers = findUnsourcedResearchNumbers(text || "", research);
  const brandCopyOverlap = findBrandCopyOverlap(text || "", brandGuardText);
  const hookEchoes = findHookEchoes(textHook(text), echo?.previousHooks, echo?.subject);
  const inventedTestimonials = findInventedTestimonials(text || "", testimonySource);
  const inventedExperiences = findInventedExperiences(text || "", testimonySource);
  return { reversals, moulded, fabricatedNumbers, unsourcedResearchNumbers, inventedTestimonials, inventedExperiences, brandCopyOverlap, hookEchoes };
}


// ── Gate texte complet : mesure → correction → RE-mesure → garde anti-régression ──
// Diagnostic 18/08 (recyclage, échantillon live) : la passe de correction Haiku
// peut INTRODUIRE les tics qu'elle chasse (contenus conformes avant correction,
// 2-3 retournements après). Tous les appelants texte gardaient la version
// corrigée les yeux fermés — la mesure `after` ne servait qu'à la télémétrie.
// Ce helper est le pendant texte de runRedacGate (carrousels) : il ne rend la
// version corrigée QUE si elle ne dégrade aucun compteur mesuré, et rejoue UNE
// re-passe ciblée quand des violations subsistent (même politique « une seule
// re-passe » que le gate carrousel).


export interface TextGateResult {
  content: string;
  before: TextRedacAnalysis;
  after: TextRedacAnalysis;
  /** Au moins une version corrigée a été conservée. */
  repassed: boolean;
  /** Une correction a été rejetée car mesurablement pire que la meilleure version connue. */
  reverted: boolean;
  score: number;
  violations: number;
  /** Échos d'accroche avant toute correction ; absent si la garde n'était pas armée. */
  hookEchoesBefore?: number;
}

export async function runTextRedacGate(
  text: string,
  opts: {
    format: CorrectionFormat;
    correction: CorrectionOptions;
    /** Liste blanche des chiffres autorisés (numbersIn du brief/réponses/branding/actu). */
    allowedNumbers?: Set<string>;
    /** Chiffres que seule la recherche fournit (researchNumbers) : autorisés avec leur source. */
    research?: ResearchNumbers;
    brandGuardText?: string;
    /** Passes LLM max (défaut 2 : 1 relecture générale + 1 rattrapage si violations restantes). */
    maxPasses?: number;
    /** Contenus DÉJÀ générés sur ce sujet : garde anti-redite d'accroche. */
    echo?: EchoContext;
    /** Brief + réponses + actu : un témoignage absent de ces sources est inventé (non mesuré si absent). */
    testimonySource?: string;
  },
): Promise<TextGateResult> {
  const analyze = (t: string) => dropUserSourcedReversals(
    analyzeTextRedac(t, opts.allowedNumbers, opts.brandGuardText, opts.echo, opts.research, opts.testimonySource), opts.correction.authoredText,
  );
  const before = analyze(text);
  let best = text;
  let bestA = before;
  let current = text;
  let currentA = before;
  let repassed = false;
  let reverted = false;
  const maxPasses = opts.maxPasses ?? 2;

  for (let pass = 1; pass <= maxPasses; pass++) {
    // La 1re passe tourne toujours (relecture générale + instructions ciblées
    // si mesures) ; les suivantes seulement s'il reste des violations au sens
    // du score officiel (chaque effet ajouté compte).
    if (pass > 1 && textRedacViolations(bestA) === 0) break;
    const corrected = await applyCorrectionPass(current, opts.format, {
      ...opts.correction,
      extraInstructions: [opts.correction.extraInstructions, buildTextFixInstructions(currentA)].filter(Boolean).join("\n\n") || undefined,
    });
    if (!corrected || corrected === current) break;
    const a = analyze(corrected);
    if (textRedacRawCount(a) <= textRedacRawCount(bestA)) {
      // Égalité incluse : la correction porte aussi des améliorations que la
      // mesure ne voit pas (broetry, anaphores…), on garde la plus récente.
      best = corrected;
      bestA = a;
      current = corrected;
      currentA = a;
      repassed = true;
    } else {
      // La correction dérive (elle a introduit plus de tics qu'elle n'en a
      // retiré) : on s'arrête sur la meilleure version connue.
      reverted = true;
      break;
    }
  }

  if (bestA.unsourcedResearchNumbers?.length) {
    const sourced = await enforceResearchNumberSources(best, analyze, opts.research, {
      logger: opts.correction.logger, abortTimeoutMs: opts.correction.abortTimeoutMs, before: bestA,
    });
    if (sourced.applied) {
      best = sourced.content;
      bestA = sourced.analysis;
      repassed = true;
    }
  }

  if (bestA.inventedTestimonials?.length || bestA.inventedExperiences?.length) {
    const cleaned = await enforceNoInventedTestimonials(best, analyze, {
      logger: opts.correction.logger, abortTimeoutMs: opts.correction.abortTimeoutMs, before: bestA,
    });
    if (cleaned.applied) {
      best = cleaned.content;
      bestA = cleaned.analysis;
      repassed = true;
    }
  }

  const violations = textRedacViolations(bestA);
  const score = Math.max(40, 100 - 10 * violations);
  opts.correction.logger?.(
    `[text-gate:${opts.format}] retournements ${before.reversals.length}→${bestA.reversals.length}, moulés ${before.moulded.length}→${bestA.moulded.length}, chiffres inventés ${before.fabricatedNumbers.length}→${bestA.fabricatedNumbers.length}, chiffres de recherche sans source ${before.unsourcedResearchNumbers?.length ?? 0}→${bestA.unsourcedResearchNumbers?.length ?? 0}, témoignages inventés ${before.inventedTestimonials?.length ?? 0}→${bestA.inventedTestimonials?.length ?? 0}, vécus inventés ${before.inventedExperiences?.length ?? 0}→${bestA.inventedExperiences?.length ?? 0}, recopie marque ${before.brandCopyOverlap.length}→${bestA.brandCopyOverlap.length}, échos d'accroche ${before.hookEchoes.length}→${bestA.hookEchoes.length}, repassé=${repassed}, rejeté=${reverted}`,
  );
  return { content: best, before, after: bestA, repassed, reverted, score, violations, hookEchoesBefore: hookEchoesBefore(before, opts.echo) };
}
