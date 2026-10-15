import { callAnthropic, getModelForAction, type UsageSink } from "../_shared/anthropic.ts";
import { logUsage } from "../_shared/plan-limiter.ts";
import { DIAGNOSTIC_TOOL } from "./tool.ts";
import { robustJsonParse, isDegenerateDiagnostic, stripMarkupFromSummary } from "./parse.ts";
import { hasScreenshotFinding } from "./evidence.ts";
import { buildFallbackDiagnostic } from "./fallback.ts";

// Phase 1 du diagnostic (fiche 12, lot 3 : sorti d'index.ts à l'identique).
// logUsage reste DANS cette fonction : c'est elle qui sait si l'IA a réussi
// (règle checkQuota → appel IA → logUsage, fix #843). abortTimeoutMs 90_000
// (#859) : le délai du front (120 / 180 s) est calculé dessus.

/**
 * Phase 1 : diagnostic rapide (Sonnet) + décision de facturation.
 *
 * Extraite de serve() pour être testable : le serve() de std/http ouvre un
 * vrai socket TCP au chargement du module, incompatible avec la CI
 * (`deno test` sans --allow-net) — même contrainte que creative-flow, voir
 * son index_test.ts.
 *
 * Règle projet : logUsage UNIQUEMENT après un succès IA réel. Quand le
 * fallback générique est servi, `usageLog` vaut null et aucun crédit n'est
 * débité (fix #843, régression couverte par index_test.ts).
 */
export async function runFastDiagnostic(opts: {
  systemPrompt: string;
  userPrompt: string;
  instagramScreenshots: Array<{ mediaType: string; base64: string }>;
  connectedImages?: Array<{ mediaType: string; base64: string }>;
  profile: any;
  freeformAnswers: any;
  sourcesUsed: string[];
  userId: string;
  workspaceId: string | null;
  isOnboarding: boolean;
}): Promise<{ analysisResult: Record<string, unknown>; usageLog: Promise<unknown> | null }> {
  const { systemPrompt, userPrompt, instagramScreenshots, connectedImages = [], profile, freeformAnswers, sourcesUsed, userId, workspaceId, isOnboarding } = opts;

  let analysisResult: Record<string, unknown>;
  const diagUsage: UsageSink = {};
  let aiSucceeded = false;

  try {
    const fastModel = getModelForAction("content"); // Sonnet — rapide

    // Build user message content blocks for vision support
    const userContentBlocks: any[] = [];
    userContentBlocks.push({ type: "text", text: userPrompt });

    // Add Instagram screenshots as vision
    for (const screenshot of instagramScreenshots) {
      userContentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: screenshot.mediaType,
          data: screenshot.base64,
        },
      });
      userContentBlocks.push({
        type: "text",
        text: "Ci-dessus : une capture sociale fournie pendant l'onboarding. Identifie Instagram ou LinkedIn seulement si l'interface le montre ; sinon utilise social_screenshot. Décris uniquement les éléments lisibles (bio, grille, publications ou messages visibles). Si illisible, aucun constat. Aucun rythme ou performance ne peut être déduit d'une capture partielle.",
      });
    }
    for (const image of connectedImages) {
      userContentBlocks.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } });
      userContentBlocks.push({ type: "text", text: "Ci-dessus : visuel d'une publication Instagram récupérée via le compte connecté. Analyse seulement ce qui est visible dans cette image, sans déduire la performance." });
    }

    // Sortie structurée par tool forcé : le JSON est valide par construction.
    // (Cause du bug « domaine Mattioli » : en texte libre, une réponse riche
    // dépassait max_tokens 2000 → JSON tronqué imparsable → fallback silencieux.
    // Reproduit avec type "consultante" + site web analysé.)
    //
    // abortTimeoutMs obligatoire (audit timeouts 17/08) : sans lui, un appel qui
    // pend ne libère JAMAIS la requête tant que le retry sur sortie dégénérée
    // (ci-dessous) n'a rien à réessayer — c'était un appel IA totalement non
    // borné après le scraping (déjà borné, lui, par GLOBAL_TIMEOUT_MS). 90 s :
    // ce diagnostic est la phase RAPIDE (Sonnet) — l'enrichissement lourd
    // (Opus) est en phase 2 séparée à 120_000, voir diagnostic-enrichment.
    // Un timeout ici tombe direct dans le catch → fallback honnête, PAS de
    // retry (le retry ne se déclenche que sur une réponse reçue mais dégénérée,
    // jamais sur un abort) : pire cas borné à 2×90 s, pas illimité.
    const runDiagnosticCall = async (extraInstruction?: string) => {
      const blocks = extraInstruction
        ? [...userContentBlocks, { type: "text", text: extraInstruction }]
        : userContentBlocks;
      const rawText = await callAnthropic({
        model: fastModel,
        system: systemPrompt,
        messages: [{ role: "user", content: blocks }],
        temperature: instagramScreenshots.length > 0 ? 0.6 : 0.7,
        max_tokens: 4000,
        tool: DIAGNOSTIC_TOOL,
        abortTimeoutMs: 90_000,
      }, diagUsage);
      return robustJsonParse(rawText);
    };

    analysisResult = await runDiagnosticCall();

    // Le tool forcé garantit le TRANSPORT (JSON valide), pas le contenu :
    // vu en prod le 26/07, le modèle peut fourrer toute sa réponse en
    // pseudo-XML dans le seul champ `summary` et laisser les tableaux vides
    // (affichage de balises brutes + score 0). Un réessai avec consigne
    // corrective suffit (raté stochastique) ; sinon → fallback honnête.
    if (isDegenerateDiagnostic(analysisResult)) {
      console.warn("Degenerate tool output (XML-in-summary / empty arrays) — retrying once");
      analysisResult = await runDiagnosticCall(
        "⚠️ ATTENTION : ta précédente réponse était invalide. Remplis CHAQUE champ du tool séparément : `summary` = 3-4 phrases de texte pur SANS AUCUNE balise <...>, `strengths`/`weaknesses`/`priorities` = tableaux remplis conformément au schéma. N'écris JAMAIS de XML dans un champ texte."
      );
    }
    if (!isDegenerateDiagnostic(analysisResult) && instagramScreenshots.length > 0 &&
      analysisResult.screenshot_readable !== false && !hasScreenshotFinding(analysisResult)) {
      console.warn("Readable screenshot missing from findings — retrying once");
      analysisResult = await runDiagnosticCall(
        "Ta réponse n'a aucun constat sourcé par la capture. Relis chaque image. Si une image est lisible, cite un élément précisément visible dans strengths ou weaknesses avec source instagram_screenshot, linkedin_screenshot ou social_screenshot et fais-en découler une priorité. Si elles sont toutes illisibles, mets screenshot_readable=false et n'invente aucun constat."
      );
    }
    if (isDegenerateDiagnostic(analysisResult)) {
      throw new Error("Sortie IA dégénérée après réessai (XML dans summary ou sections vides)");
    }
    analysisResult = stripMarkupFromSummary(analysisResult);
    aiSucceeded = true;
  } catch (claudeError) {
    console.error("Claude fast diagnostic failed, using fallback:", claudeError);
    analysisResult = buildFallbackDiagnostic(profile, freeformAnswers, sourcesUsed);
  }

  const usageLog = !isOnboarding && aiSucceeded
    ? logUsage(userId, "audit", "deep_diagnostic", diagUsage.total_tokens, diagUsage.model, workspaceId)
        .catch(e => console.error("logUsage failed:", e))
    : null;

  return { analysisResult, usageLog };
}
