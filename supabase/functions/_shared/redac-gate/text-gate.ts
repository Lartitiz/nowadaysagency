// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 5, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Gate texte (LinkedIn, newsletter, post, reel, stories, recyclage) : même
// logique sur un texte brut, jusqu'à 2 passes, retour à la meilleure version
// si la correction dérive.

import { applyCorrectionPass, type CorrectionFormat, type CorrectionOptions } from "../correction-pass.ts";
import { MOULDED_VERBATIMS, findReversals, dropUserSourcedReversals } from "./reversals.ts";
import { findFabricatedNumbers } from "./numbers.ts";
import { type EchoContext, findHookEchoes, findBrandCopyOverlap, hookEchoesBefore, textHook } from "./echoes.ts";
import { type TextRedacAnalysis, textRedacViolations, textRedacRawCount } from "./scoring.ts";
import { type ResearchNumbers, findUnsourcedResearchNumbers, enforceResearchNumberSources } from "./research-numbers.ts";
import { findInventedTestimonials, findInventedExperiences, enforceNoInventedTestimonials } from "./testimony.ts";
import { buildTextFixInstructions } from "./fix-instructions.ts";

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
