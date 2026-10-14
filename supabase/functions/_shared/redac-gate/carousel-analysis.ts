// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lots 2 et 4, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Analyse du carrousel : textes d'une slide (lot 2), mesures du document,
// hashtags, quality_check calculé par le code, chute de légende (lot 4).

import { carouselEditorialFields } from "../carousel-editorial-review.ts";
import { wordCount, sentencesOf, tokenSimilarity } from "./text-utils.ts";
import { MOULDED_VERBATIMS, findReversals, dropUserSourcedReversals } from "./reversals.ts";
import { numbersIn, findFabricatedNumbers } from "./numbers.ts";
import { findDurationConflicts } from "./durations.ts";
import { type EchoContext, findHookEchoes, findBrandCopyOverlap, findRecentEchoes } from "./echoes.ts";
import { type RedacAnalysis, redacViolations, redacScore } from "./scoring.ts";
import { type ResearchNumbers, researchNumbers, baseInputText, findUnsourcedResearchNumbers, findResearchNumbersUsed } from "./research-numbers.ts";
import { findInventedTestimonials, findInventedExperiences } from "./testimony.ts";

export function slideTexts(s: any): string {
  return [...carouselEditorialFields({ slides: [s] }).map(f => f.text),
    ...(typeof s?.big_number === "number" ? [String(s.big_number)] : []),
  ].join(" ");
}

/** Corps mesurable d'une slide pour la règle « 50 mots » (titre exclu). */
export function slideBody(s: any): string {
  return [s?.body, s?.overlay_text].filter(Boolean).join(" ");
}

/** `testimonySource` : brief + réponses + actu ; absent = témoignages et vécus non mesurés. */
export function analyzeCarouselRedac(parsed: any, allowedNumbers?: Set<string>, brandGuardText?: string, echo?: EchoContext, research?: ResearchNumbers, testimonySource?: string): RedacAnalysis {
  const doc = parsed?.carousel?.slides ? parsed.carousel : parsed;
  const slides: any[] = Array.isArray(doc?.slides) ? doc.slides : [];
  const caption = doc?.caption ?? doc?.instagram_caption ?? parsed?.caption ?? parsed?.instagram_caption ?? {};
  const slidesText = slides.map(slideTexts).join("\n");
  const captionText = typeof caption === "string" ? caption : [caption.hook, caption.body, caption.cta].filter(Boolean).join(" ");
  const allText = [slidesText, captionText].join("\n");

  const reversals = findReversals(allText);
  const brandCopyOverlap = findBrandCopyOverlap(allText, brandGuardText);

  const overlongSlides = slides
    .map((s: any) => ({ slide: s?.slide_number ?? 0, words: wordCount(slideBody(s)) }))
    .filter((x) => x.words > 55); // 50 (règle, corps seul) + tolérance de comptage

  // Overlay = phrase posée SUR la photo : la règle 5-25 mots n'avait aucun gate
  // (30 mots vus en live, audit 12/07 lot D). Seuil 28 = 25 + tolérance.
  const overlongOverlays = slides
    .filter((s: any) => typeof s?.overlay_text === "string" && s.overlay_text.trim())
    .map((s: any) => ({ slide: s?.slide_number ?? 0, words: wordCount(s.overlay_text) }))
    .filter((x) => x.words > 28);

  // CTA de caption ≡ CTA de la dernière slide (la caption doit COMPLÉTER, pas répéter)
  const lastSlide = slides[slides.length - 1];
  const ctaDuplicated = Boolean(
    caption?.cta && lastSlide && tokenSimilarity(caption.cta, slideTexts(lastSlide)) >= 0.7,
  );

  const moulded = MOULDED_VERBATIMS.map((re) => allText.match(re)?.[0]).filter(Boolean) as string[];

  const hashtagsCount = Array.isArray(caption?.hashtags) ? caption.hashtags.length : 0;

  // Chiffres : on analyse aussi les schémas visuels (stats affichées sur les slides)
  const schemaText = slides
    .map((s: any) => (s?.visual_schema ? JSON.stringify(s.visual_schema) : ""))
    .join("\n");
  const fabricatedNumbers = allowedNumbers
    ? findFabricatedNumbers(allText + "\n" + schemaText, allowedNumbers)
    : [];
  // Une slide se lit d'un bloc (titre + corps) : la source peut être dans l'un, le chiffre dans l'autre.
  const unsourcedResearchNumbers = findUnsourcedResearchNumbers(
    "", research, [...slides.map(slideTexts), ...sentencesOf(captionText)],
  );
  const researchNumbersUsed = findResearchNumbersUsed([...slides.map(slideTexts), captionText, schemaText], research);

  const durationConflicts = findDurationConflicts(slidesText, captionText);
  // L'accroche d'un carrousel = le texte de sa slide 1, quel que soit le format
  // (le mixte et le photo portent `overlay_text`, pas `title`).
  const hookEchoes = findHookEchoes(slideTexts(slides[0]) || caption.hook || "", echo?.previousHooks, echo?.subject);
  // Redite d'un contenu récent de la marque, tous sujets (bilan hebdo 05/10/2026).
  const recentEchoes = findRecentEchoes(allText, echo?.recentTexts, echo?.currentRequest);

  // Témoignages et vécus au passé inventés (04/10/2026) : mêmes détecteurs que
  // la variante texte, sur slides + légende. Chaque slide est un paragraphe.
  const inventedTestimonials = findInventedTestimonials(allText, testimonySource);
  const inventedExperiences = findInventedExperiences(allText, testimonySource);

  return {
    reversals, overlongSlides, overlongOverlays, ctaDuplicated, moulded,
    hashtagsCount, fabricatedNumbers, unsourcedResearchNumbers, researchNumbersUsed, durationConflicts, brandCopyOverlap, hookEchoes,
    recentEchoes, inventedTestimonials, inventedExperiences,
  };
}

/**
 * Normalise les hashtags de la caption : cap par canal (3 Instagram, 2 LinkedIn),
 * sans « # » (convention du schéma), dédoublonnés, espaces retirés. Le prompt
 * demandait 3 et le modèle en sortait 7-8, tantôt avec tantôt sans « # ».
 */
export function normalizeCaptionHashtags(parsed: any, isLinkedIn: boolean): void {
  const caption = parsed?.caption;
  if (!caption || !Array.isArray(caption.hashtags)) return;
  const max = isLinkedIn ? 2 : 3;
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const h of caption.hashtags) {
    if (typeof h !== "string") continue;
    const tag = h.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(tag);
    if (clean.length >= max) break;
  }
  caption.hashtags = clean;
}


/** quality_check calculé (remplace l'auto-déclaré, qui rapportait faux). */
export function buildQualityCheck(a: RedacAnalysis, repassed: boolean, researchCap?: number, echoesBefore?: number) {
  const violations = redacViolations(a);
  return {
    source: "code",
    scope: "lexical_only_not_editorial_progression",
    length_policy: "layout_telemetry_only",
    score: redacScore(a),
    reversal_negation_count: a.reversals.length,
    slides_over_50_words: a.overlongSlides,
    overlays_over_28_words: a.overlongOverlays,
    caption_cta_duplicates_slide: a.ctaDuplicated,
    moulded_verbatims: a.moulded,
    fabricated_numbers: a.fabricatedNumbers.length,
    unsourced_research_numbers: a.unsourcedResearchNumbers?.length ?? 0,
    research_numbers_used: a.researchNumbersUsed?.length ?? 0,
    research_numbers_cap: researchCap ?? null,
    invented_testimonials: a.inventedTestimonials?.length ?? 0,
    invented_experiences: a.inventedExperiences?.length ?? 0,
    duration_conflicts: a.durationConflicts,
    brand_copy_overlap: a.brandCopyOverlap.length,
    hook_echoes: a.hookEchoes,
    recent_echoes: a.recentEchoes?.length ?? 0,
    // Avant la re-passe (null = garde non armée) : hook_echoes ci-dessus est l'après.
    hook_echoes_before: echoesBefore ?? null,
    hashtags_count: a.hashtagsCount,
    corrected_by_repass: repassed,
  };
}

/**
 * « Photos brutes » (08/10/2026) : l'app efface tout le texte des slides et ne
 * garde que la légende. La note affichée doit juger ce qui reste : on la
 * recalcule sur la légende seule, avec les mêmes sources que le gate. La
 * mesure du gate (redac_score loggué) reste celle de l'écriture complète.
 */
export function rescoreCaptionOnly(
  content: string,
  opts: { inputText?: string; researchText?: string; researchNumbersCap?: number; brandGuardText?: string; echo?: EchoContext; testimonySource?: string; authoredText?: string },
): string {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return content;
  let parsed: any;
  try { parsed = JSON.parse(m[0]); } catch { return content; }
  const doc = parsed?.carousel?.slides ? parsed.carousel : parsed;
  if (!doc || typeof doc !== "object") return content;
  const allowedNumbers = opts.inputText !== undefined ? numbersIn(opts.inputText) : undefined;
  const base = baseInputText(opts.inputText, opts.researchText);
  const research = allowedNumbers ? researchNumbers(numbersIn(base), opts.researchText, base) : undefined;
  const a = dropUserSourcedReversals(analyzeCarouselRedac({ caption: doc.caption ?? parsed.caption, slides: [] }, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.authoredText);
  const prior = doc.quality_check ?? parsed.quality_check;
  const qc = { ...buildQualityCheck(a, Boolean(prior?.corrected_by_repass), opts.researchNumbersCap), scored_on: "caption_only", full_writing_score: prior?.score ?? null };
  if (doc !== parsed) doc.quality_check = qc;
  parsed.quality_check = qc;
  return content.replace(m[0], JSON.stringify(parsed, null, 2));
}

// ── Chute de caption imposée (caption v2, 12/07) ──
// Le tirage par code d'une forme de chute (question / affirmation / invitation
// impérative / confidence / sobre) n'est PAS respecté de façon fiable par le
// modèle (re-test v3 : 5/7 questions pour ~1-2 attendues). Le gate mesure la
// conformité et la re-passe ciblée corrige — même patron que le reste du gate.

export interface CaptionEndingRule {
  /** true = la chute imposée est une question ; false = toute autre forme (aucun « ? »). */
  requiresQuestion: boolean;
  /** Description de la forme imposée, réinjectée telle quelle dans la re-passe. */
  instruction: string;
}

/** La caption viole-t-elle la forme de chute imposée ? */
export function captionEndingViolated(parsed: any, rule?: CaptionEndingRule): boolean {
  if (!rule) return false;
  const caption = parsed?.caption;
  if (!caption || typeof caption !== "object") return false;
  const cta = String(caption.cta || "").trim();
  const bodyTail = String(caption.body || "").trim().split("\n").filter(Boolean).pop() || "";
  const tail = (cta || bodyTail).trim();
  if (rule.requiresQuestion) return !/\?/.test(cta + " " + bodyTail);
  // Forme non-question : un « ? » dans le cta, ou une fin de caption en question, = violation.
  return /\?/.test(cta) || /\?\s*$/.test(tail);
}

export function emptyAnalysis(): RedacAnalysis {
  return { reversals: [], overlongSlides: [], overlongOverlays: [], ctaDuplicated: false, moulded: [], hashtagsCount: 0, fabricatedNumbers: [], durationConflicts: [], brandCopyOverlap: [], hookEchoes: [] };
}
