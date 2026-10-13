// Post Instagram / légende (creative-flow) : génération diffusée (SSE) avec
// outil forcé, correction du texte diffusé. Extrait À L'IDENTIQUE d'index.ts
// au lot 3 (13/10/2026). Modifier le post = modifier CE fichier (le brief de
// rédaction est dans _shared/format-briefs.ts, captionBrief) ; les briques
// communes à tous les formats sont dans ../shared.ts.
// Voir docs/creation-contenu/CARTE.md.

import { authoredContentSource, testimonySourceText } from "../../_shared/editorial-voice.ts";
import { type AudienceAddress } from "../../_shared/audience-address.ts";
import { enforceAudienceAddressInJsonText } from "../../_shared/audience-address-fields.ts";
import { logUsage } from "../../_shared/plan-limiter.ts";
import { type AnthropicModel } from "../../_shared/anthropic.ts";
import { streamAnthropicToolSSE, createClientSSEStream } from "../../_shared/anthropic-stream.ts";
import { analyzeTextRedac, runTextRedacGate, textRedacViolations, dropUserSourcedReversals, hookEchoesBefore } from "../../_shared/redac-gate.ts";
import { logContentQuality } from "../../_shared/content-quality.ts";
import { CORRECTION_ABORT_MS, POST_ADDRESS_FIELDS, addrOpts, gateNumbers } from "../shared.ts";

// ── Sortie structurée pour le POST (Instagram) et le Pinterest en streaming ──
// Même remède que les questions : le tool forcé fait garantir le JSON par l'API.
// Le post streamait en TEXTE LIBRE avec un prompt « Réponds UNIQUEMENT en JSON »
// (forme identique au schéma ci-dessous) — Sonnet (thinking off) cassait ce JSON
// par intermittence (saut de ligne ET guillemet droit non échappé dans `content`)
// → le blob ```json fuyait au rendu (filets front #511/#524). En passant par le
// tool, le JSON assemblé côté Anthropic est valide par construction. Le schéma
// REPREND À L'IDENTIQUE la forme demandée dans le prompt (cf. bloc « Réponds
// UNIQUEMENT en JSON » du step generate) — le prompt reste inchangé, seule la
// couche de transport devient déterministe.
export const POST_TOOL = {
  name: "rediger_post",
  description: "Retourne le post rédigé (contenu prêt à poster) au format structuré.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string", description: "Le contenu complet, prêt à poster." },
      accroche: { type: "string", description: "La première phrase / accroche." },
      format: { type: "string" },
      pillar: { type: "string" },
      objectif: { type: "string" },
      personal_tip: {
        type: ["string", "null"],
        description: "Conseil d'incarnation SEULEMENT si demandé plus haut, sinon null.",
      },
    },
    required: ["content", "accroche"],
  },
};

// Non-LinkedIn, non-Carousel (= POST Instagram + Pinterest) : streaming
// par TOOL FORCÉ. Le prompt demande déjà un JSON `{content, accroche, …}` ;
// en texte libre Sonnet le cassait par intermittence (fuite du blob ```json
// au rendu). Le tool fait garantir le JSON par l'API — le stream recolle
// les `input_json_delta`, donc le live « rédige en temps réel » est
// préservé à l'identique (cf. streamAnthropicToolSSE). Relance serveur sur
// overloaded / complétion vide conservée (bug post IG intermittent 10/07).
// Gate rédactionnel du post streamé (audit slop 18/08, constat 2) : ce chemin
// — celui réellement utilisé en prod pour post Instagram/Pinterest — n'avait
// ni détection ni re-passe de correction, contrairement à LinkedIn/newsletter/
// carrousel. Le live déjà streamé au client n'est pas rejoué : cette fonction
// tourne dans le onDone de createClientSSEStream, juste avant l'émission de
// l'event `done` final, dont elle peut remplacer la valeur `full`. Extraite
// (plutôt qu'inline) pour être testable directement, même principe que
// `runDeepResearchWebSearch` ci-dessus.
/** Mesure du post final, pour la télémétrie (content_quality_events). */
export interface PostStreamQuality {
  score: number;
  violations: number;
  repassed: boolean;
  content: string;
  /** Échos d'accroche AVANT correction ; absent si la garde n'était pas armée. */
  hookEchoesBefore?: number;
}

export async function correctPostStreamContent(
  full: string,
  params: {
    body: any; fullContext: string; researchSource?: string; brandGuardText?: string; echoSubject?: string; previousHooks?: string[];
    /** Reçoit la mesure du post (avant/après garde) dès qu'elle existe. */
    onQuality?: (q: PostStreamQuality) => void;
  },
): Promise<string | undefined> {
  const { body, fullContext, researchSource, brandGuardText, echoSubject, previousHooks, onQuality } = params;
  let parsed: any;
  try {
    parsed = JSON.parse(full);
  } catch {
    return undefined; // JSON déjà invalide en amont (failOnTruncation l'aurait signalé)
  }
  if (typeof parsed?.content !== "string" || !parsed.content.trim()) return undefined;

  try {
    const { allowed: postAllowed, research: postResearch } = gateNumbers([
      typeof body.context === "string" ? body.context : "",
      body.answers ? JSON.stringify(body.answers) : "",
      typeof body.news_context === "string" ? body.news_context : "",
      fullContext || "",
    ], researchSource);
    // L'écho d'accroche est mesuré DÈS ce contrôle : sans lui, un post dont le
    // seul défaut est de redire une accroche précédente sortait « déjà propre »
    // et la garde anti-redite (#915) ne se déclenchait jamais seule.
    const echo = { previousHooks, subject: echoSubject };
    const postRedac = dropUserSourcedReversals(analyzeTextRedac(parsed.content, postAllowed, brandGuardText, echo, postResearch, testimonySourceText(body)), authoredContentSource(body));
    const preViolations = textRedacViolations(postRedac);
    const reportAsIs = () => onQuality?.({
      score: Math.max(40, 100 - 10 * preViolations), violations: preViolations, repassed: false,
      content: parsed.content, hookEchoesBefore: hookEchoesBefore(postRedac, echo),
    });
    // Trop court pour une relecture, ou déjà propre : pas d'appel IA de plus.
    if (parsed.content.length < 200 || preViolations === 0) {
      reportAsIs();
      return undefined;
    }

    // runTextRedacGate = correction → RE-mesure → garde anti-régression (la
    // correction n'est gardée que si elle ne dégrade aucun compteur mesuré,
    // cf. échantillon live 18/08 : Haiku introduisait des retournements).
    const gate = await runTextRedacGate(parsed.content, {
      format: "instagram_caption",
      correction: {
        logger: (m) => console.log(`[creative-flow post-stream] ${m}`),
        authoredText: authoredContentSource(body),
        sourceContext: [authoredContentSource(body), fullContext, researchSource].filter(Boolean).join("\n"),
        // Édition mécanique à règles fermées → Haiku (cf. #364)
        model: "claude-haiku-4-5",
        abortTimeoutMs: CORRECTION_ABORT_MS,
      },
      allowedNumbers: postAllowed,
      research: postResearch,
      brandGuardText,
      echo,
      testimonySource: testimonySourceText(body),
    });
    onQuality?.({ score: gate.score, violations: gate.violations, repassed: gate.repassed, content: gate.content, hookEchoesBefore: gate.hookEchoesBefore });
    if (!gate.repassed || gate.content === parsed.content) return undefined;

    parsed.content = gate.content;
    return JSON.stringify(parsed);
  } catch (e) {
    console.error("[creative-flow post-stream] correction pass failed:", e);
    return undefined;
  }
}

export function streamDefaultPostSSE(params: {
  apiKey: string;
  model: AnthropicModel;
  systemPrompt: string;
  userPrompt: string;
  corsHeaders: Record<string, string>;
  userId: string;
  workspace_id?: string | null | undefined;
  body: any;
  fullContext: string;
  researchSource?: string;
  brandGuardText?: string;
  /** Sujet + accroches déjà écrites dessus : garde déterministe anti-redite (24/08). */
  echoSubject?: string;
  previousHooks?: string[];
  /** Tu ou vous de la fiche de marque (04/10/2026). */
  audienceAddress?: AudienceAddress | null;
  /** Format enregistré dans content_quality_events (post_instagram, post_pinterest…). */
  qualityFormat?: string;
}): Response {
  const { apiKey, model, systemPrompt, userPrompt, corsHeaders, userId, body, fullContext, researchSource, brandGuardText, echoSubject, previousHooks } = params;
  const workspace_id = params.workspace_id ?? undefined;
  return createClientSSEStream(
    () => streamAnthropicToolSSE(
      apiKey,
      model,
      systemPrompt,
      [{ role: "user", content: userPrompt! }],
      0.85,
      4096,
      POST_TOOL,
      60_000,
    ),
    corsHeaders,
    async (full, usage) => {
      await logUsage(userId, "content", "creative_flow", usage?.total_tokens, usage?.model, workspace_id);
      let quality: PostStreamQuality | undefined;
      const corrected = await correctPostStreamContent(full, { body, fullContext, researchSource, brandGuardText, echoSubject, previousHooks, onQuality: (q) => { quality = q; } });
      // Tu ou vous APRÈS la relecture (même place que les autres passes du flux).
      const addressed = await enforceAudienceAddressInJsonText(corrected ?? full, POST_ADDRESS_FIELDS, params.audienceAddress, addrOpts("post-stream"));
      // Télémétrie : sans cette ligne, le post n'existait pas pour le bilan hebdo
      // ni pour la garde anti-redite des contenus suivants (elle lit les accroches ici).
      if (quality) {
        let finalContent = quality.content;
        try { const doc = JSON.parse(addressed ?? corrected ?? full); if (typeof doc?.content === "string") finalContent = doc.content; } catch { /* mesure gardée */ }
        await logContentQuality(
          userId,
          params.qualityFormat || "post",
          { score: quality.score, violations: quality.violations, repassed: quality.repassed, content: JSON.stringify({ content: finalContent }), hookEchoesBefore: quality.hookEchoesBefore },
          usage?.model,
          workspace_id,
          echoSubject,
        );
      }
      return addressed ?? corrected;
    },
    { failOnTruncation: true },
  );
}
