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
//
// Sommaire (fiche 7 de docs/robustesse/gros-fichiers.md, terminée le
// 14/10/2026) : chaque famille vit dans son fichier de ./redac-gate/. Ce
// fichier ne fait que réexporter, sous le même nom, ce qui était public (43
// valeurs et 8 types, vérifiés par redac-gate-exports_test.ts). Pour retoucher
// une mesure, une consigne ou un gate, modifie le fichier de sa mission.

export { dropUserSourcedReversals } from "./redac-gate/reversals.ts";
export { numbersIn } from "./redac-gate/numbers.ts";
export type { EchoContext } from "./redac-gate/echoes.ts";
export { findHookEchoes, findBrandCopyOverlap, findSharedPassages, findRecentEchoes, hookEchoesBefore, textHook } from "./redac-gate/echoes.ts";
export { fixFrenchElisions, fixElisionsInFields, countStaccatoAcrossSlides, countAnaphoraAcrossSlides, countResultConclusionOpeners, isOpeningRhetoricalQuestion, countEmptyAdjectives, hookEndingSimilarity, findChoppyFragments, countChoppyFragments, measureSlopSignals } from "./redac-gate/slop-signals.ts";
export type { SlopSignals } from "./redac-gate/slop-signals.ts";
export type { RedacAnalysis, TextRedacAnalysis } from "./redac-gate/scoring.ts";
export { redacViolations, carouselRedacRawCount, redacScore, textRedacViolations, textRedacRawCount } from "./redac-gate/scoring.ts";
export type { ResearchNumbers } from "./redac-gate/research-numbers.ts";
export { researchNumbers, findUnsourcedResearchNumbers, findResearchNumbersUsed, enforceResearchNumberSources, emptiedMarkers, enforceResearchNumberCap } from "./redac-gate/research-numbers.ts";
export { findInventedTestimonials, findInventedExperiences, enforceNoInventedTestimonials } from "./redac-gate/testimony.ts";
export { analyzeCarouselRedac, normalizeCaptionHashtags, rescoreCaptionOnly, captionEndingViolated } from "./redac-gate/carousel-analysis.ts";
export type { CaptionEndingRule } from "./redac-gate/carousel-analysis.ts";
export { buildTextFixInstructions } from "./redac-gate/fix-instructions.ts";
export { protectOrderPrefixes, applyGuardedCarouselCorrection, runRedacGate } from "./redac-gate/carousel-gate.ts";
export type { RedacGateResult } from "./redac-gate/carousel-gate.ts";
export { analyzeTextRedac, runTextRedacGate } from "./redac-gate/text-gate.ts";
export type { TextGateResult } from "./redac-gate/text-gate.ts";
