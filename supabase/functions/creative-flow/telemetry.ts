// Télémétrie qualité de creative-flow (stories / reel / LinkedIn) : note le
// texte final dans content_quality_events, sans appel IA. Déplacée À
// L'IDENTIQUE depuis index.ts (fiche 3, lot B, 14/10/2026). Voir
// docs/creation-contenu/CARTE.md.

import { analyzeTextRedac, textRedacViolations } from "../_shared/redac-gate.ts";
import { logContentQuality } from "../_shared/content-quality.ts";
import { storiesAuditableText } from "../_shared/correction-pass.ts";
import { reelAuditableText } from "../_shared/reel-postprocess.ts";
import { type UsageSink } from "../_shared/anthropic.ts";
import { gateNumbers } from "./shared.ts";
import type { StoriesGateResult } from "./formats/stories.ts";


// ═══ TÉLÉMÉTRIE QUALITÉ (stories / reel / LinkedIn) ═══
// Les carrousels loggent leur score de gate à chaque génération (Brique 1,
// content_quality_events) → le juge du bilan hebdo les note. Les autres
// formats en étaient absents (angle mort connu). Mesure LÉGÈRE
// (analyzeTextRedac, zéro appel LLM) sur le texte FINAL, MÊME formule de
// score que redacScore sur les dimensions du texte libre (retournements /
// formules moulées / chiffres inventés), + aperçu pour l'échantillon du juge.
// Fire-and-forget : logContentQuality n'interrompt jamais la génération et
// exclut déjà les comptes QA. La newsletter (retour SSE anticipé) se logge
// dans son propre bloc ; le LinkedIn STREAMÉ reste hors couverture ici (il
// ne passe pas par cette queue) — angle mort résiduel connu.
export async function logGenerationQualityTelemetry(parsed: any, params: {
  userId: string;
  context: string;
  body: any;
  newsContext?: string | null;
  fullContext: string;
  researchSource?: string;
  brandGuardText?: string;
  finalUsage: UsageSink;
  workspace_id?: string | null;
  isStories: boolean;
  isReel: boolean;
  isLinkedIn: boolean;
  /** Accroches déjà écrites sur ce sujet : la redite compte dans le score mesuré (24/08). */
  previousHooks?: string[];
  /** Résultat de la passe stories (score APRÈS correction) : loggé tel quel, sans re-mesure. */
  storiesGate?: StoriesGateResult | null;
  /** Échos d'accroche AVANT correction (reel / LinkedIn), rendus par leur passe. */
  hookEchoesBefore?: number;
}): Promise<void> {
  const { userId, context, body, newsContext, fullContext, researchSource, brandGuardText, finalUsage, workspace_id, isStories, isReel, isLinkedIn, previousHooks, storiesGate, hookEchoesBefore: echoesBefore } = params;
  const qualityNumbers = () =>
    gateNumbers([
      typeof context === "string" ? context : "",
      body.answers ? JSON.stringify(body.answers) : "",
      (body.preGenAnswers || body.pre_gen_answers) ? JSON.stringify(body.preGenAnswers || body.pre_gen_answers) : "",
      typeof newsContext === "string" ? newsContext : "",
      fullContext || "",
    ], researchSource);
  const logTextQuality = async (format: string, text: string, previewDoc: unknown, gate?: StoriesGateResult | null, hookEchoesBefore?: number) => {
    try {
      let score: number, violations: number, repassed = false;
      if (gate) {
        ({ score, violations, repassed } = gate);
      } else {
        const { allowed, research } = qualityNumbers();
        const a = analyzeTextRedac(text, allowed, brandGuardText, {
          previousHooks,
          subject: typeof context === "string" ? context : undefined,
        }, research);
        violations = textRedacViolations(a);
        score = Math.max(40, 100 - 10 * violations);
      }
      await logContentQuality(
        userId,
        format,
        { score, violations, repassed, content: JSON.stringify(previewDoc), hookEchoesBefore: gate ? gate.hook_echoes_before : hookEchoesBefore },
        finalUsage.model,
        workspace_id ?? undefined,
        typeof context === "string" ? context : undefined,
      );
    } catch (e) {
      console.error(`[creative-flow] log qualité ${format} ignoré (génération intacte):`, (e as any)?.message || e);
    }
  };

  if (isStories && Array.isArray(parsed?.stories)) {
    // Texte audité = texte des stories (les pastilles en sont des extraits depuis le 04/10/2026), même mesure que la passe.
    await logTextQuality("stories", storiesAuditableText(parsed.stories), { stories: parsed.stories }, storiesGate);
  } else if (isReel && Array.isArray(parsed?.script)) {
    await logTextQuality("reel", reelAuditableText(parsed), { script: parsed.script }, null, echoesBefore);
  } else if (isLinkedIn && typeof parsed?.content === "string" && parsed.content.trim()) {
    // Sans `subject` : l'accroche enregistrée est la 1re ligne du POST (avec
    // `subject`, c'était le sujet lui-même, inutile à la garde anti-redite qui
    // retire les mots du sujet avant de comparer).
    await logTextQuality("linkedin", parsed.content, { content: parsed.content }, null, echoesBefore);
  }
}
