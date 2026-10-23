// « On affine ensemble » en une seule passe, pendant l'onboarding (chantier 3
// du plan plan-onboarding-comprehension.md, choix de Laetitia du 23/10/2026).
// La conversation de branding-coaching coûtait ~7 crédits et ~5 minutes par
// carte (mesuré le 22/10) : ici, 2 ou 3 réponses à des questions fixes, UN
// appel à l'IA, et la carte réécrite au format de la relecture (AnalysisResult
// côté site), que l'écran montre avant d'enregistrer avec les mêmes fonctions
// d'écriture que « C'est bon ».
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic, getModelForAction, type UsageSink } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";

/** Format attendu pour chaque carte : les champs que la relecture affiche et sait enregistrer. */
export const SECTION_FORMATS: Record<string, string> = {
  story: `{ "full_story": "l'histoire en 4 à 8 phrases, à la première personne" }`,
  persona: `{ "description": "une phrase sur la personne aidée", "goals": ["…"], "frustrations": ["…"], "desires": ["…"] }`,
  value_proposition: `{ "key_phrase": "une phrase qui dit ce que la personne apporte et à qui", "problem": "…", "solution": "…", "differentiator": "…" }`,
  tone_style: `{ "voice_description": "deux phrases sur sa façon de parler", "tone_keywords": ["3 à 5 mots"], "i_do": ["…"], "i_never_do": ["…"], "fights": ["…"] }`,
  content_strategy: `{ "pillars": ["2 à 4 sujets, le premier est le principal"], "creative_twist": "…", "editorial_line": "une phrase", "rhythm": "…" }`,
  offers: `{ "offers": [{ "name": "…", "price": "…", "description": "…", "target": "…", "promise": "…" }] }`,
  charter: `{ "mood_keywords": ["3 à 5 mots"], "visual_style_description": "…", "color_primary": "#rrggbb ou null", "color_secondary": "#rrggbb ou null", "color_accent": "#rrggbb ou null", "color_background": "#rrggbb ou null" }`,
};

export function buildSystemPrompt(section: string): string {
  return BASE_SYSTEM_RULES + `

Tu aides une personne à relire une carte de sa fiche de marque (section « ${section} »).
Tu reçois ce que la carte contient déjà, quelques infos sur le reste de sa fiche, et ses réponses à 2 ou 3 questions.
Réécris la carte en t'appuyant d'abord sur SES réponses, avec SES mots. Garde de la carte actuelle ce que ses réponses ne contredisent pas.
N'invente rien : aucun chiffre, aucun client, aucun vécu, aucune promesse qu'elle n'a pas donnés. Si une info manque, laisse le champ vide ("" ou []).
Écris en français simple, au tutoiement quand tu t'adresses à elle, à la première personne pour son histoire. Phrases courtes, sans jargon.
Réponds UNIQUEMENT avec un objet JSON de cette forme, sans texte autour :
${SECTION_FORMATS[section]}`;
}

export async function handleQuickRefineRequest(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    validateInput(body, z.object({
      section: z.enum(["story", "persona", "value_proposition", "tone_style", "content_strategy", "offers", "charter"]),
      current: z.record(z.unknown()).optional().nullable(),
      context: z.record(z.unknown()).optional().nullable(),
      answers: z.array(z.object({ question: z.string().max(300), answer: z.string().max(3000) })).min(1).max(5),
      workspace_id: z.string().uuid().optional().nullable(),
    }));
    const { userId } = await authenticateRequest(req);
    const rate = checkRateLimit(userId);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterMs!, cors);

    const { section, current, context, answers, workspace_id } = body;
    const filled = answers.filter((a: { answer: string }) => a.answer.trim());
    if (filled.length === 0) return json({ error: "Réponds au moins à une question." }, 400);

    const quota = await checkQuota(userId, "coach", workspace_id || undefined);
    if (!quota.allowed) return quotaDeniedResponse(quota, cors);

    const userMessage = [
      `Carte actuelle : ${JSON.stringify(current || {}).slice(0, 4000)}`,
      context ? `Reste de sa fiche (pour rester cohérente) : ${JSON.stringify(context).slice(0, 4000)}` : "",
      "Ses réponses :",
      ...filled.map((a: { question: string; answer: string }) => `- ${a.question}\n  ${a.answer.trim()}`),
    ].filter(Boolean).join("\n");

    const usage: UsageSink = {};
    const raw = await callAnthropic({
      model: getModelForAction("coaching_light"),
      system: buildSystemPrompt(section),
      messages: [{ role: "user", content: userMessage }],
      temperature: 0.5,
      max_tokens: 1500,
      abortTimeoutMs: 60_000,
    }, usage);

    const parsed = tryParseAiJson<Record<string, unknown>>(raw, "branding-quick-refine");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Je n'ai pas réussi à réécrire la carte. Réessaie." }, 502);
    }

    await logUsage(userId, "coach", "branding_quick_refine", usage.total_tokens, usage.model, workspace_id || undefined);
    return json({ section_data: parsed });
  } catch (error) {
    if (error instanceof ValidationError) return json({ error: error.message }, 400);
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    console.error("branding-quick-refine error:", error);
    return json({ error: "Erreur interne du serveur" }, 500);
  }
}

// Même patron que branding-coaching : le handler est exporté pour les tests,
// et le serveur ne démarre que lancé comme fonction.
if (import.meta.main) {
  serve(handleQuickRefineRequest);
}
