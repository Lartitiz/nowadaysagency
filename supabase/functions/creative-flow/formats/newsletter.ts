// Newsletter (creative-flow) : génération en deux temps, passe de correction,
// champs publiés. Extrait À L'IDENTIQUE d'index.ts au lot 3 (13/10/2026).
// Modifier la newsletter = modifier CE fichier ; les briques communes à
// tous les formats sont dans ../shared.ts. Voir docs/creation-contenu/CARTE.md.

import { extractNewsletterTexts, reinjectNewsletterTexts } from "../../_shared/correction-pass.ts";
import { authoredContentSource, testimonySourceText } from "../../_shared/editorial-voice.ts";
import { type AudienceAddress } from "../../_shared/audience-address.ts";
import { enforceAudienceAddressInFields } from "../../_shared/audience-address-fields.ts";
import { logUsage } from "../../_shared/plan-limiter.ts";
import { tryParseAiObject } from "../../_shared/parse-ai-json.ts";
import { callAnthropicSimple, type UsageSink, type AnthropicModel, HAIKU_MODEL } from "../../_shared/anthropic.ts";
import { clientStillThere, type StatusEmitter } from "../../_shared/anthropic-stream.ts";
import { analyzeTextRedac, runTextRedacGate, textRedacViolations, hookEchoesBefore } from "../../_shared/redac-gate.ts";
import { logContentQuality } from "../../_shared/content-quality.ts";
import { stripMarkdownFromNewsletter } from "../../_shared/strip-markdown.ts";
import { CORRECTION_ABORT_MS, GENERATE_ABORT_MS, addrOpts, gateNumbers } from "../shared.ts";

/** Newsletter : objet, aperçu (deux noms selon le chemin), corps, accroche, invitation. */
export const NEWSLETTER_ADDRESS_FIELDS = ["subject", "preview_text", "preheader", "content", "accroche", "cta_suggestion"];

// Newsletter : même pattern que LinkedIn — pas de streaming de texte,
// mais heartbeat SSE + étapes réelles (writing → correcting).
export async function applyNewsletterCorrectionPass(parsed: any, params: {
  body: any; fullContext: string; researchSource?: string; context?: string | null; newsContext?: string | null;
  brandGuardText?: string; previousHooks?: string[];
  /** Tu ou vous de la fiche de marque : objet, aperçu et corps contrôlés après la relecture (04/10/2026). */
  audienceAddress?: AudienceAddress | null;
}, emitStatus: StatusEmitter = () => {}): Promise<number | undefined> {
  const { body, fullContext, researchSource, context, newsContext, brandGuardText, previousHooks } = params;
  // Échos d'accroche AVANT correction (undefined = garde non armée ou passe non lancée).
  let echoesBefore: number | undefined;
  if (parsed.content && typeof parsed.content === "string" && parsed.content.length >= 200) {
    try {
      emitStatus("correcting");
      const { allowed: nlAllowed, research: nlResearch } = gateNumbers([
        typeof body.context === "string" ? body.context : "",
        body.answers ? JSON.stringify(body.answers) : "",
        typeof body.news_context === "string" ? body.news_context : "",
        fullContext || "",
      ], researchSource);
      // runTextRedacGate = mesure → correction → RE-mesure → garde anti-régression
      // (cf. échantillon live 18/08 : la passe Haiku introduisait des retournements).
      const gate = await runTextRedacGate(extractNewsletterTexts(parsed), {
        format: "newsletter",
        correction: {
          logger: (m) => console.log(`[creative-flow newsletter] ${m}`),
          sourceContext: [newsContext, context, JSON.stringify(body.answers || []), JSON.stringify(body.followUpAnswers || []), researchSource].filter(Boolean).join("\n"),
          authoredText: authoredContentSource(body),
          // Édition mécanique à règles fermées → Haiku (cf. #364)
          model: HAIKU_MODEL,
          abortTimeoutMs: CORRECTION_ABORT_MS,
        },
        allowedNumbers: nlAllowed,
        research: nlResearch,
        brandGuardText,
        echo: { previousHooks, subject: typeof context === "string" ? context : undefined },
        testimonySource: testimonySourceText(body),
      });
      Object.assign(parsed, reinjectNewsletterTexts(parsed, gate.content));
      echoesBefore = gate.hookEchoesBefore;
    } catch (e) {
      console.error("[creative-flow newsletter] correction pass failed:", e);
    }
  }
  // Tu ou vous : objet, texte d'aperçu et corps (même quand le corps est trop
  // court pour la relecture). Aucun appel si le texte est conforme.
  await enforceAudienceAddressInFields(parsed, NEWSLETTER_ADDRESS_FIELDS, params.audienceAddress, addrOpts("newsletter"));
  return echoesBefore;
}

export async function runNewsletterTwoStep(params: {
  model: AnthropicModel;
  systemPrompt: string;
  userPrompt: string;
  corsHeaders: Record<string, string>;
  userId: string;
  workspace_id?: string | null | undefined;
  body: any;
  context?: string | null;
  newsContext?: string | null;
  fullContext: string;
  researchSource?: string;
  brandGuardText?: string;
  /** Accroches déjà écrites sur ce sujet : garde déterministe anti-redite (24/08). */
  previousHooks?: string[];
  /** Tu ou vous de la fiche de marque (04/10/2026). */
  audienceAddress?: AudienceAddress | null;
}, emitStatus: StatusEmitter = () => {}): Promise<Response> {
  const { model, systemPrompt, userPrompt, corsHeaders, userId, body, context, newsContext, fullContext, researchSource, brandGuardText, previousHooks } = params;
  const workspace_id = params.workspace_id ?? undefined;
  const nlUsage: UsageSink = {};
  emitStatus("writing");
  const rawContent = await callAnthropicSimple(model, systemPrompt, userPrompt!, 0.7, 4096, nlUsage, GENERATE_ABORT_MS);

  // Lecture tolérante : sinon le JSON brut s'affichait comme texte de la newsletter.
  let parsed: any = tryParseAiObject(rawContent, "creative-flow:newsletter") ?? { content: rawContent };

  console.log(
    `[creative-flow newsletter] subject:`,
    parsed.subject?.length,
    "preview:",
    parsed.preview_text?.length,
  );

  const nlEchoesBefore = await applyNewsletterCorrectionPass(parsed, params, emitStatus);

  // Nettoyage déterministe : un email part en texte brut, le markdown
  // résiduel (**gras**, *italique*) s'afficherait tel quel (audit 09/07).
  parsed = stripMarkdownFromNewsletter(parsed);

  if (parsed.content && typeof parsed.content === "string") {
    parsed.word_count = parsed.content.split(/\s+/).filter(Boolean).length;
  }

  // Télémétrie qualité newsletter (retour SSE anticipé → loggée ici, pas
  // dans la queue commune). Même mesure légère que les autres formats.
  if (typeof parsed.content === "string" && parsed.content.trim()) {
    try {
      const { allowed: nlAllowed, research: nlResearch } = gateNumbers([
        typeof context === "string" ? context : "",
        body.answers ? JSON.stringify(body.answers) : "",
        typeof newsContext === "string" ? newsContext : "",
        fullContext || "",
      ], researchSource);
      const a = analyzeTextRedac(parsed.content, nlAllowed, brandGuardText, undefined, nlResearch);
      const violations = textRedacViolations(a);
      const score = Math.max(40, 100 - 10 * violations);
      await logContentQuality(
        userId,
        "newsletter",
        { score, violations, repassed: false, content: JSON.stringify({ subject: parsed.subject, content: parsed.content }), hookEchoesBefore: nlEchoesBefore },
        nlUsage.model,
        workspace_id,
        typeof context === "string" ? context : undefined,
      );
    } catch (e) {
      console.error("[creative-flow] log qualité newsletter ignoré (génération intacte):", (e as any)?.message || e);
    }
  }

  if (clientStillThere(emitStatus, "newsletter")) await logUsage(userId, "content", "creative_flow", nlUsage.total_tokens, nlUsage.model, workspace_id);
  return new Response(JSON.stringify(parsed), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
