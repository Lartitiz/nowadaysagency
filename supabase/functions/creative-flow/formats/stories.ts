// Stories (creative-flow) : passe de correction de la séquence, finition des
// stories recyclées, champs publiés. Extrait À L'IDENTIQUE d'index.ts au
// lot 3 (13/10/2026). Modifier les stories = modifier CE fichier (la mise en
// forme visuelle vit dans _shared/story-formatting.ts) ; les briques communes à
// tous les formats sont dans ../shared.ts. Voir docs/creation-contenu/CARTE.md.

import { authoredContentSource, testimonySourceText } from "../../_shared/editorial-voice.ts";
import { type AudienceAddress } from "../../_shared/audience-address.ts";
import { enforceAudienceAddressInFields } from "../../_shared/audience-address-fields.ts";
import { applyCorrectionPassStories, extractStoriesTexts, reinjectStoriesTexts, storiesAuditableText } from "../../_shared/correction-pass.ts";
import { analyzeTextRedac, buildTextFixInstructions, enforceNoInventedTestimonials, enforceResearchNumberSources, textRedacRawCount, textRedacViolations, dropUserSourcedReversals, findChoppyFragments, hookEchoesBefore } from "../../_shared/redac-gate.ts";
import { coerceStoriesSequence, finalizeStoriesLayout, stripStoriesWriterLayout } from "../../_shared/story-formatting.ts";
import { CORRECTION_ABORT_MS, addrOpts, gateNumbers } from "../shared.ts";

// ═══ PASSE DE CORRECTION STORIES (audit stories 07/09/2026) ═══
// Historique : depuis le 18/08 (#896) cette passe tournait en mode « ombre » :
// elle mesurait, appelait la correction sur violation… et jetait le résultat
// dans un console.log que personne ne lisait. Les stories étaient donc le SEUL
// format sans filet, alors que 4 séquences sur 4 du corpus du 07/09 (et la
// séquence réelle de Laetitia du même jour, score 80) auraient déclenché la
// re-passe. Ici la boucle est refermée, avec les mêmes garde-fous que le
// texte libre (runTextRedacGate) :
// - on mesure ce que l'abonnée LIT : le texte de chaque story
//   (extractStoriesTexts ; les pastilles de l'image en sont des extraits
//   posés APRÈS par la mise en forme, depuis le 04/10/2026) ;
// - la correction ne tourne QUE s'il y a violation (0 appel IA sinon) ;
// - elle est réinjectée story par story, par marqueur, avec garde de
//   fidélité (reinjectStoriesTexts) ;
// - garde anti-régression : une correction qui laisse plus de tics bruts
//   qu'avant est rejetée, l'original reste ;
// - le ton brut est protégé par le prompt (« retirer les tics, rien d'autre »).
// Le résultat est posé dans parsed.quality_check (source:"code"), comme pour
// les carrousels : preuve de version lisible dans la réponse, et la
// télémétrie reprend ces chiffres au lieu de re-mesurer à vide.
export interface StoriesGateResult {
  source: "code";
  score: number;
  violations: number;
  repassed: boolean;
  reverted: boolean;
  /** Échos d'accroche AVANT correction ; absent si la garde n'était pas armée. */
  hook_echoes_before?: number;
}

export async function applyStoriesCorrectionPass(parsed: any, params: { body: any; fullContext: string; researchSource?: string; brandGuardText?: string; echoSubject?: string; previousHooks?: string[] }): Promise<StoriesGateResult | null> {
  const { body, fullContext, researchSource, brandGuardText, echoSubject, previousHooks } = params;
  if (!Array.isArray(parsed?.stories) || parsed.stories.length === 0) return null;
  const auditable = storiesAuditableText(parsed.stories);
  if (!auditable || auditable.length < 150) return null;
  try {
    const { allowed: storiesAllowed, research: storiesResearch } = gateNumbers([
      typeof body.context === "string" ? body.context : "",
      body.answers ? JSON.stringify(body.answers) : "",
      (body.preGenAnswers || body.pre_gen_answers) ? JSON.stringify(body.preGenAnswers || body.pre_gen_answers) : "",
      fullContext || "",
    ], researchSource);
    const echo = { previousHooks, subject: echoSubject };
    // Un retournement écrit PAR l'utilisatrice (message clé, réponses) n'est pas un tic.
    const userSource = [
      typeof body.context === "string" ? body.context : "",
      body.answers ? JSON.stringify(body.answers) : "",
      (body.preGenAnswers || body.pre_gen_answers) ? JSON.stringify(body.preGenAnswers || body.pre_gen_answers) : "",
    ].join("\n");
    const analyze = (stories: any[]) => dropUserSourcedReversals(analyzeTextRedac(storiesAuditableText(stories), storiesAllowed, brandGuardText, echo, storiesResearch, testimonySourceText(body)), userSource);
    const before = analyze(parsed.stories);
    let best = parsed.stories;
    let bestA = before;
    let repassed = false;
    let reverted = false;
    if (textRedacViolations(before) > 0 || authoredContentSource(body).trim()) {
      const out = await applyCorrectionPassStories(parsed.stories, {
        logger: (msg) => console.log(msg),
        authoredText: authoredContentSource(body),
        sourceContext: [authoredContentSource(body), fullContext, researchSource].filter(Boolean).join("\n"),
        model: "claude-haiku-4-5",
        extraInstructions: buildTextFixInstructions(before) || undefined,
        abortTimeoutMs: CORRECTION_ABORT_MS,
      });
      if (out.changed > 0) {
        const after = analyze(out.stories);
        if (textRedacRawCount(after) <= textRedacRawCount(before)) {
          best = out.stories;
          bestA = after;
          repassed = true;
        } else {
          reverted = true;
        }
      }
    }
    // Chiffres de la recherche encore sans source : passe dédiée sur les textes balisés.
    if (storiesResearch && bestA.unsourcedResearchNumbers?.length) {
      const base = best;
      const sourced = await enforceResearchNumberSources(
        extractStoriesTexts(base), (b) => analyze(reinjectStoriesTexts(base, b).stories), storiesResearch,
        { logger: (msg) => console.log(msg), abortTimeoutMs: CORRECTION_ABORT_MS, before: bestA },
      );
      if (sourced.applied) {
        best = reinjectStoriesTexts(base, sourced.content).stories;
        bestA = sourced.analysis;
        repassed = true;
      }
    }
    // Témoignage ou vécu au passé inventé encore présent : passe dédiée sur
    // les textes balisés (marqueurs [STORY n - …] conservés), gardée seulement
    // si le compte baisse sans autre compteur dégradé.
    if (bestA.inventedTestimonials?.length || bestA.inventedExperiences?.length) {
      const base = best;
      const cleaned = await enforceNoInventedTestimonials(
        extractStoriesTexts(base), (b) => analyze(reinjectStoriesTexts(base, b).stories),
        { logger: (msg) => console.log(msg), abortTimeoutMs: CORRECTION_ABORT_MS, before: bestA },
      );
      if (cleaned.applied) {
        best = reinjectStoriesTexts(base, cleaned.content).stories;
        bestA = cleaned.analysis;
        repassed = true;
      }
    }
    const violations = textRedacViolations(bestA);
    const echoesBefore = hookEchoesBefore(before, echo);
    const result: StoriesGateResult = {
      source: "code", score: Math.max(40, 100 - 10 * violations), violations, repassed, reverted,
      ...(echoesBefore === undefined ? {} : { hook_echoes_before: echoesBefore }),
    };
    // Style haché (mesure seulement, 05/10/2026) : sur le texte des stories, sans les petits titres.
    const storyTexts = (stories: any[]) => stories.map((st: any) => (typeof st?.text === "string" ? st.text : "")).join("\n");
    const choppyBefore = findChoppyFragments(storyTexts(parsed.stories));
    const choppyAfter = findChoppyFragments(storyTexts(best));
    if (choppyAfter.runs.length) console.log(`[stories-gate] style haché : ${choppyAfter.runs.map((r) => `« ${r.slice(0, 80)} »`).join(" ; ")}`);
    console.log(
      `[stories-gate] retournements ${before.reversals.length}→${bestA.reversals.length}, moulés ${before.moulded.length}→${bestA.moulded.length}, chiffres inventés ${before.fabricatedNumbers.length}→${bestA.fabricatedNumbers.length}, chiffres de recherche sans source ${before.unsourcedResearchNumbers?.length ?? 0}→${bestA.unsourcedResearchNumbers?.length ?? 0}, témoignages inventés ${before.inventedTestimonials?.length ?? 0}→${bestA.inventedTestimonials?.length ?? 0}, vécus inventés ${before.inventedExperiences?.length ?? 0}→${bestA.inventedExperiences?.length ?? 0}, recopie marque ${before.brandCopyOverlap.length}→${bestA.brandCopyOverlap.length}, échos d'accroche ${before.hookEchoes.length}→${bestA.hookEchoes.length}, fragments hachés ${choppyBefore.fragments}→${choppyAfter.fragments} (rafales ${choppyBefore.runs.length}→${choppyAfter.runs.length}), repassé=${repassed}, rejeté=${reverted}`,
    );
    parsed.stories = best;
    parsed.quality_check = result;
    return result;
  } catch (e) {
    console.error("[creative-flow] passe de correction stories ignorée (génération intacte) :", (e as any)?.message || e);
    return null;
  }
}

// ═══ STORIES RECYCLÉES (04/10/2026) ═══
// Le recyclage écrivait les stories en prose (« texte + indication visuelle »),
// affichée telle quelle. Elles suivent désormais la chaîne du flux principal :
// séquence normalisée → retrait de toute mise en page écrite → correction du
// texte (source = contenu recyclé, comme l'ancienne garde texte) → mise en
// forme par le code + garde photo d'abord. null si aucune story n'a de texte.
export async function finalizeRecycledStories(value: unknown, params: { sourceText: string; fullContext: string; brandGuardText?: string; audienceAddress?: AudienceAddress | null }): Promise<{ sequence: { stories: any[] } & Record<string, unknown>; gate: StoriesGateResult | null } | null> {
  const sequence = coerceStoriesSequence(value);
  if (!sequence) return null;
  stripStoriesWriterLayout(sequence);
  const gate = await applyStoriesCorrectionPass(sequence, {
    body: { context: params.sourceText },
    fullContext: params.fullContext,
    brandGuardText: params.brandGuardText,
  });
  // Le contenu recyclé suit le réglage tu/vous (jamais le texte source, qui n'est pas réécrit).
  await enforceAudienceAddressInFields(sequence, STORIES_ADDRESS_FIELDS, params.audienceAddress, addrOpts("recycle-stories"));
  finalizeStoriesLayout(sequence, { storiesPhotoCatalog: [], logger: (m) => console.log(`[creative-flow recycle stories] ${m}`) });
  return { sequence, gate };
}

/** Champs publiés d'une séquence de stories (texte, petit titre, sticker), AVANT la mise en forme. */
export const STORIES_ADDRESS_FIELDS = ["stories[].text", "stories[].visual.title_pill", "stories[].sticker.label", "stories[].sticker.question", "stories[].sticker.options[]"];
