import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { scrapeInstagram, scrapeLinkedin, processScreenshots, scrapeWebsite, extractVisualInfo, fetchExternalCss, isSafePublicUrl } from "../_shared/scraping.ts";
import { callAnthropic, getModelForAction, type UsageSink, type AnthropicTool } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";
import { readSocialDiagnosticEvidence } from "../_shared/diagnostic-social.ts";

const MAX_TEXT_PER_SOURCE = 8000;
const GLOBAL_TIMEOUT_MS = 55000;
const DIAGNOSTIC_ROUTES = new Set([
  "/branding", "/branding/proposition/recap", "/branding/offres", "/branding/charter",
  "/instagram/audit", "/instagram/profil/bio", "/instagram/routine", "/linkedin/profil", "/site/audit",
  "/site/accueil", "/site/capture", "/calendrier", "/creer", "/idees",
]);
const LEGACY_DIAGNOSTIC_ROUTES: Record<string, string> = {
  "/audit-instagram": "/instagram/audit", "/bio-profile": "/instagram/profil/bio",
  "/storytelling": "/branding", "/persona": "/branding",
  "/proposition": "/branding/proposition/recap", "/offre": "/branding/offres",
  "/charte-graphique": "/branding/charter", "/strategie": "/branding",
  "/engagement": "/instagram/routine",
};

export function normalizeDiagnosticRoute(route: unknown): string {
  const candidate = typeof route === "string" ? route : "";
  const mapped = LEGACY_DIAGNOSTIC_ROUTES[candidate] || candidate;
  return DIAGNOSTIC_ROUTES.has(mapped) ? mapped : "/branding";
}

// Sortie structurée forcée : l'API garantit un `input` conforme — élimine la
// classe d'échecs « JSON tronqué/illisible » du parsing texte (cf #640).
const DIAGNOSTIC_TOOL: AnthropicTool = {
  name: "rendre_diagnostic",
  description: "Renvoie le diagnostic de communication structuré.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "3-4 phrases qui reformulent les mots de la personne" },
      screenshot_readable: { type: "boolean", description: "Au moins une capture fournie est lisible et permet un constat concret" },
      strengths: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            source: { type: "string", enum: ["website", "profile", "about", "instagram_public", "instagram_screenshot", "linkedin_screenshot", "social_screenshot", "instagram_connected", "instagram_insights", "linkedin", "linkedin_analytics"] },
          },
          required: ["title", "detail"],
        },
      },
      weaknesses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            source: { type: "string", enum: ["website", "profile", "about", "instagram_public", "instagram_screenshot", "linkedin_screenshot", "social_screenshot", "instagram_connected", "instagram_insights", "linkedin", "linkedin_analytics"] },
            fix_hint: { type: "string" },
          },
          required: ["title", "detail"],
        },
      },
      scores: {
        type: "object",
        properties: {
          total: { type: ["number", "null"] },
          branding: { type: ["number", "null"] },
          instagram: { type: ["number", "null"] },
          website: { type: ["number", "null"] },
          linkedin: { type: ["number", "null"] },
        },
        required: ["total", "branding"],
      },
      priorities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            why: { type: "string" },
            first_step: { type: "string", description: "Premier geste réalisable maintenant, précis et vérifiable" },
            example: { type: "string", description: "Exemple de formulation ou de contrôle adapté à cette personne, sans inventer de faits" },
            time: { type: "string" },
            route: { type: "string" },
            impact: { type: "string", enum: ["high", "medium"] },
            source: { type: "string", enum: ["website", "profile", "about", "instagram_public", "instagram_screenshot", "linkedin_screenshot", "social_screenshot", "instagram_connected", "instagram_insights", "linkedin", "linkedin_analytics"] },
          },
          required: ["title", "why", "first_step", "example", "route"],
        },
      },
      branding_prefill: {
        type: "object",
        properties: {
          positioning: { type: ["string", "null"] },
          mission: { type: ["string", "null"] },
          target_description: { type: ["string", "null"] },
          tone_keywords: { type: "array", items: { type: "string" } },
          values: { type: "array", items: { type: "string" } },
          offers: { type: "array" },
        },
      },
    },
    required: ["summary", "strengths", "weaknesses", "scores", "priorities"],
  },
};

/**
 * Robust JSON parser that handles common AI response issues:
 * - Trailing commas before } or ]
 * - Markdown code blocks wrapping
 * - Truncated JSON (attempts to close open brackets)
 * - Control characters inside strings
 */
function robustJsonParse(raw: string): Record<string, unknown> {
  // Parsing robuste centralisé (fences, extraction, réparations courantes).
  const parsed = tryParseAiJson<Record<string, unknown>>(raw, "deep-diagnostic");
  if (parsed !== null) return parsed;

  // Dernier recours, spécifique à cette fonction : le module partagé ne gère
  // ni les caractères de contrôle ni un JSON TRONQUÉ (réponse coupée à
  // max_tokens) — cause historique du bug « domaine Mattioli » (#640/#645).

  // Strip markdown code blocks
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  // Extract the outermost JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) cleaned = objMatch[0];

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");

  // Remove control characters (except newline/tab) that break JSON
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  // Try parsing cleaned version
  try { return JSON.parse(cleaned); } catch {}

  // Try to fix truncated JSON by closing open brackets
  let attempt = cleaned;
  const opens = (attempt.match(/\{/g) || []).length;
  const closes = (attempt.match(/\}/g) || []).length;
  const openBrackets = (attempt.match(/\[/g) || []).length;
  const closeBrackets = (attempt.match(/\]/g) || []).length;

  // Remove trailing incomplete key-value (e.g. `"key": "incomplete...`)
  attempt = attempt.replace(/,?\s*"[^"]*":\s*"[^"]*$/, "");
  attempt = attempt.replace(/,?\s*"[^"]*":\s*$/, "");

  for (let i = 0; i < openBrackets - closeBrackets; i++) attempt += "]";
  for (let i = 0; i < opens - closes; i++) attempt += "}";

  // Clean trailing commas again after surgery
  attempt = attempt.replace(/,\s*([\]}])/g, "$1");

  try { return JSON.parse(attempt); } catch {}

  throw new Error("Réponse IA invalide : impossible de parser le JSON après nettoyage");
}

/** Balise XML/HTML dans une chaîne (ex. `</summary>`, `<strengths>`). */
const MARKUP_RE = /<\/?[a-z_][a-z0-9_-]*\s*\/?>/i;

/**
 * Sortie « dégénérée » du tool forcé : le modèle a mis sa réponse en
 * pseudo-XML dans `summary` au lieu de remplir les champs, ou a laissé
 * forces ET faiblesses vides. Dans les deux cas le diagnostic est inutilisable
 * tel quel — mieux vaut réessayer, puis basculer sur le fallback assumé.
 */
function isDegenerateDiagnostic(result: Record<string, unknown>): boolean {
  const strengths = Array.isArray(result.strengths) ? result.strengths : [];
  const weaknesses = Array.isArray(result.weaknesses) ? result.weaknesses : [];
  return strengths.length === 0 && weaknesses.length === 0;
}

/** Filet ultime : si une balise résiduelle traîne dans un summary par ailleurs sain, on coupe avant. */
function stripMarkupFromSummary(result: Record<string, unknown>): Record<string, unknown> {
  const summary = typeof result.summary === "string" ? result.summary : "";
  const m = summary.match(MARKUP_RE);
  if (!m || m.index === undefined) return result;
  return { ...result, summary: summary.slice(0, m.index).trim() };
}

const SCREENSHOT_SOURCES = new Set(["instagram_screenshot", "linkedin_screenshot", "social_screenshot"]);
const hasScreenshotFinding = (analysis: Record<string, unknown>) =>
  ["strengths", "weaknesses"].some((key) => Array.isArray(analysis[key]) &&
    (analysis[key] as any[]).some((item) => SCREENSHOT_SOURCES.has(item?.source) &&
      typeof item.detail === "string" && item.detail.trim().length >= 20));

/** Public for regression fixtures: provenance is decided from actual findings, not uploads. */
export function finalizeDiagnosticEvidence(
  analysis: Record<string, unknown>, sourcesUsed: string[], sourcesFailed: string[], screenshotCount: number,
) {
  const findings = [...(Array.isArray(analysis.strengths) ? analysis.strengths : []),
    ...(Array.isArray(analysis.weaknesses) ? analysis.weaknesses : [])]
    .filter((item: any) => SCREENSHOT_SOURCES.has(item?.source) &&
      typeof item.detail === "string" && item.detail.trim().length >= 20);
  if (screenshotCount > 0) {
    if (analysis.screenshot_readable !== false && findings.length) {
      for (const item of findings) if (!sourcesUsed.includes(item.source)) sourcesUsed.push(item.source);
    } else if (!sourcesFailed.includes("social_screenshot")) {
      sourcesFailed.push("social_screenshot");
    }
  }
  const validSources = new Set([...sourcesUsed, "profile"]);
  for (const key of ["strengths", "weaknesses"] as const) {
    if (Array.isArray(analysis[key])) {
      analysis[key] = (analysis[key] as any[]).filter((item) => !item?.source || validSources.has(item.source));
    }
  }
  if (Array.isArray(analysis.priorities)) {
    analysis.priorities = (analysis.priorities as any[])
      .filter((item) => !item.source || validSources.has(item.source))
      .map((item) => ({
      ...item, source: validSources.has(item.source) ? item.source : "profile",
      route: normalizeDiagnosticRoute(item.route),
      }));
  }
  const scores = analysis.scores as Record<string, unknown> | undefined;
  if (scores && !sourcesUsed.some(s => ["instagram_public", "instagram_screenshot", "instagram_connected"].includes(s))) scores.instagram = null;
  if (scores && !sourcesUsed.some(s => ["linkedin", "linkedin_screenshot"].includes(s))) scores.linkedin = null;
  if (scores && !sourcesUsed.includes("website")) scores.website = null;
  return analysis;
}

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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);

  try {
    const { userId } = await authenticateRequest(req);

    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { websiteUrl, instagramHandle, linkedinUrl, documentIds, profile, freeformAnswers, isOnboarding, workspace_id: bodyWorkspaceId, allowOverwrite } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const membership = await assertWorkspaceMembership(supabaseAdmin, userId, bodyWorkspaceId);
    if (!membership.ok) {
      console.warn("[workspace-guard] denied", { userId, workspaceId: bodyWorkspaceId });
      clearTimeout(timeout);
      return workspaceDeniedResponse(corsHeaders);
    }

    // Get workspace (owner). maybeSingle : 0 ligne est un état réel possible
    // (bug « membership owner manquante » 26/07) → on ne veut pas d'erreur
    // PGRST116 parasite, juste un fallback lisible.
    const { data: wsData } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    if (!wsData?.workspace_id) {
      console.warn(`[deep-diagnostic] Aucun espace owner pour ${userId} — le front devrait auto-réparer (ensure_owner_workspace).`);
    }

    // Défense en profondeur (étape 3) : en mode ONBOARDING, on FORCE l'espace
    // owner du caller et on ignore tout `workspace_id` ambiant envoyé par le
    // front. L'onboarding configure SON espace ; il ne doit jamais écrire dans
    // l'espace actif s'il s'agit d'un espace client (cause de la contamination
    // du 30/06). Hors onboarding (audits), on respecte l'espace ciblé — un·e
    // manager peut légitimement auditer l'espace d'une cliente.
    const workspaceId = isOnboarding
      ? (wsData?.workspace_id || null)
      : (bodyWorkspaceId || wsData?.workspace_id || null);

    // Resolve workspace owner for user_id-scoped tables (scrape_cache)
    let profileUserId = userId;
    if (workspaceId) {
      const { data: ownerRow } = await supabaseAdmin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("role", "owner")
        .maybeSingle();
      if (ownerRow?.user_id) profileUserId = ownerRow.user_id;
    }

    // Check quota (diagnostic = 3 credits, category: audit) — skip during onboarding
    if (!isOnboarding) {
      const quota = await checkQuota(userId, "audit", workspaceId);
      if (!quota.allowed) {
        clearTimeout(timeout);
        return new Response(JSON.stringify({ error: quota.message, quota }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ====== RÉCUPÉRATION DES DONNÉES (cache only, pas de scraping) ======
    const scrapedContent: Record<string, string> = {};
    const sourcesUsed: string[] = [];
    const sourcesFailed: string[] = [];

    const scrapePromises: Promise<void>[] = [];

    // Website : lire le cache du pre-scrape, avec fallback scrape direct
    let cachedStyleHints = "";
    const loadWebsiteStyleHints = async (): Promise<string> => {
      try {
        let formattedUrl = websiteUrl.trim();
        if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;
        if (!isSafePublicUrl(formattedUrl)) return "";
        const resp = await fetch(formattedUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
          redirect: "manual",
        });
        if (!resp.ok) return "";
        const html = await resp.text();
        const externalCss = await fetchExternalCss(html, formattedUrl, controller.signal);
        return extractVisualInfo(html, externalCss);
      } catch {
        return "";
      }
    };
    if (websiteUrl) {
      scrapePromises.push((async () => {
        try {
          const { data: cached } = await supabaseAdmin
            .from("scrape_cache")
            .select("content, style_hints")
            .eq("user_id", profileUserId)
            .eq("url", websiteUrl)
            .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (cached?.content) {
            scrapedContent.website = cached.content.slice(0, MAX_TEXT_PER_SOURCE);
            sourcesUsed.push("website");
            if (cached.style_hints) {
              cachedStyleHints = cached.style_hints;
            } else {
              // Un cache texte ancien peut précéder l'extraction CSS : on retente
              // les styles au lieu de présenter ensuite une palette déduite du texte.
              cachedStyleHints = await loadWebsiteStyleHints();
            }
            console.log("Website content loaded from pre-scrape cache", cached.style_hints ? "(with style hints)" : "(no style hints)");
          } else {
            // Fallback: scrape directly if cache miss
            console.log("Cache miss for website, attempting direct scrape...");
            try {
              const directContent = await scrapeWebsite(websiteUrl, controller.signal);
              if (directContent && directContent.length > 50) {
                scrapedContent.website = directContent.slice(0, MAX_TEXT_PER_SOURCE);
                sourcesUsed.push("website");
                console.log("Website scraped directly (fallback)");
                cachedStyleHints = await loadWebsiteStyleHints();
              } else {
                sourcesFailed.push("website");
              }
            } catch {
              sourcesFailed.push("website");
            }
          }
        } catch {
          sourcesFailed.push("website");
        }
      })());
    }

    // À propos : texte libre fourni par l'utilisatrice (anciennement "linkedin_summary")
    const aboutSummary = freeformAnswers?.linkedin_summary;
    if (aboutSummary && aboutSummary.trim().length > 10) {
      scrapedContent.about = `À propos (texte fourni par l'utilisatrice sur elle-même et son activité — ce n'est PAS un profil LinkedIn) :\n${aboutSummary.trim()}`.slice(0, MAX_TEXT_PER_SOURCE);
      sourcesUsed.push("about");
    } else if (linkedinUrl) {
      scrapePromises.push(
        scrapeLinkedin(linkedinUrl, controller.signal)
          .then((text) => {
            if (text) {
              scrapedContent.linkedin = text.slice(0, MAX_TEXT_PER_SOURCE);
              sourcesUsed.push("linkedin");
            } else {
              sourcesFailed.push("linkedin");
            }
          })
          .catch(() => { sourcesFailed.push("linkedin"); })
      );
    }

    // Profil Instagram public : le @ suffit (nom + description via og:tags), la
    // capture d'écran devient un complément et non plus le seul chemin.
    if (instagramHandle) {
      scrapePromises.push(
        scrapeInstagram(instagramHandle, controller.signal)
          .then((text) => {
            if (text) {
              scrapedContent.instagram_public = text.slice(0, MAX_TEXT_PER_SOURCE);
              sourcesUsed.push("instagram_public");
            } else {
              sourcesFailed.push("instagram_public");
            }
          })
          .catch(() => { sourcesFailed.push("instagram_public"); })
      );
    }

    // Jusqu'à trois captures autorisées par l'interface. Une image illisible ou
    // non reçue ne devient jamais une source analysée.
    let instagramScreenshots: { base64: string; mediaType: string }[] = [];
    let connectedImages: { base64: string; mediaType: string }[] = [];
    if (documentIds && documentIds.length > 0) {
      scrapePromises.push(
        processScreenshots(supabaseAdmin, documentIds.slice(0, 3), userId)
          .then((screenshots) => {
            instagramScreenshots = screenshots.slice(0, 3);
            if (instagramScreenshots.length === 0) {
              sourcesFailed.push("social_screenshot");
            }
          })
          .catch(() => { sourcesFailed.push("social_screenshot"); })
      );
    }

    // Les connexions et les droits sont lus pour cet utilisateur ET son espace.
    // Le statut OAuth seul n'entre pas dans sourcesUsed : seule une réponse API
    // contenant des données exploitables y entre.
    scrapePromises.push(readSocialDiagnosticEvidence(
      supabaseAdmin, userId, workspaceId, controller.signal,
    ).then((social) => {
      if (social.text) scrapedContent.connected_social = social.text.slice(0, 12000);
      sourcesUsed.push(...social.sources);
      sourcesFailed.push(...social.failed);
      connectedImages = social.images;
    }).catch(() => { /* Connexion absente ou API indisponible : repli sur les autres sources. */ }));

    await Promise.allSettled(scrapePromises);

    // ====== BUILD PROMPT ======
    const systemPrompt = `Tu es l'assistante com' de L'Assistant Com'. Tu fais un diagnostic de communication personnalisé.

CONTEXTE : cette personne vient de terminer son onboarding. Ce diagnostic est la PREMIÈRE chose qu'elle verra. Il doit être percutant, honnête et donner envie de continuer.

=== RÈGLES ABSOLUES ===

1. SOURCES UNIQUEMENT
Tu peux commenter les réponses de la section PROFIL et des RÉPONSES LIBRES, ainsi que les sources présentes dans les sections "SOURCE:" du message utilisateur. Distingue toujours ce que la personne a déclaré de ce que tu as réellement observé sur son site.
- Pas de section "SOURCE: WEBSITE" → RIEN sur le site web (pas de CTA, pas de SEO, pas de navigation, rien)
- Une capture fournie n'autorise que des constats sur ce qui y est lisible. Renseigne screenshot_readable. Source = instagram_screenshot, linkedin_screenshot ou social_screenshot selon l'interface reconnaissable. Si toutes sont illisibles, mets false et ne crée aucun constat sourcé capture.
- "INSTAGRAM_PUBLIC" = métadonnées publiques seulement, pas lecture du feed.
- "INSTAGRAM_CONNECTÉ" = champs et publications explicitement listés ; les visuels reçus sont les seuls inspectables.
- "INSTAGRAM_STATISTIQUES" et "LINKEDIN_ANALYTICS" = chiffres uniquement quand ils sont fournis avec leur période.
- Une connexion de publication LinkedIn n'autorise pas à lire le profil, les posts ni les statistiques.
- Pas de source LinkedIn lue → aucun constat sur son profil.

2. PREUVES CONCRÈTES OBLIGATOIRES
Chaque force et chaque faiblesse DOIT citer un élément observable (extrait littéral pour le texte, description précise pour une image), et utiliser la source exacte. Une inférence doit être formulée comme hypothèse.
- ✅ BON : "Ton site affiche 'Réserver un coaching découverte' en haut de page : c'est un CTA clair."
- ❌ INTERDIT : "Pas de CTA sur le site" (sans avoir vérifié la section "Signaux de conversion" des données)
- ❌ INTERDIT : "Bio Instagram incomplète" (sans bio lue sur une capture ou via le compte connecté)

3. PAS DE PROBLÈMES "MÉTA-OUTIL"
Ne JAMAIS remonter comme faiblesse le fait qu'un champ n'est pas rempli dans l'outil. L'outil est neuf, c'est normal que tout ne soit pas rempli.
- ❌ INTERDIT : "Ton branding n'est pas renseigné dans l'outil"
- ❌ INTERDIT : "Ta cible n'est pas définie" (si c'est juste que le champ est vide dans l'app)
- ✅ OK : "Tu décris ta cible comme 'tout le monde' — c'est trop large pour créer du contenu qui résonne."

4. SIGNAUX DE CONVERSION DU SITE
Quand tu as une source WEBSITE, lis ATTENTIVEMENT la section "Signaux de conversion" dans les données. Elle liste les formulaires, champs email et boutons CTA détectés sur le site.
- Si des CTAs sont listés → le site A des appels à l'action. Ne dis PAS "pas de CTA".
- Si des formulaires sont détectés → le site A un système de capture. Ne dis PAS "pas de capture email".
- Tu peux critiquer la QUALITÉ ou le PLACEMENT des CTAs, mais pas dire qu'ils n'existent pas quand les données prouvent le contraire.

5. RÉSEAUX SOCIAUX
Si une capture est lisible, produis au moins un constat et une priorité qui reprennent un élément réellement visible, avec un premier geste et un exemple adapté à l'activité. Si le profil ou les publications connectés sont lus, distingue leurs textes des visuels effectivement reçus. Une capture, un lien ou une connexion seule ne prouvent ni fréquence, ni résultats. Si aucune donnée sociale n'est lisible, propose de joindre une capture ou d'ouvrir l'audit dédié sans inventer de défaut.

6. RECOMMANDATIONS CONCRÈTES ET ACTIONNABLES
Chaque faiblesse doit expliquer le PROBLÈME RÉEL et donner une piste concrète.
- ✅ BON : "Ton site parle de 'coaching' mais ne précise pas pour qui ni quel résultat concret. Tes visiteuses ne savent pas si c'est pour elles."
- ❌ MAUVAIS : "Ta stratégie de contenu manque de structure" (générique, non vérifiable)
Pour chacune des 3 priorités, donne une raison liée à une preuve observée, un premier geste faisable en 5 à 20 minutes et un exemple que la personne peut adapter ou un contrôle précis à effectuer. La première priorité doit répondre à son changement souhaité ou à son blocage principal si les sources le permettent. Ne recommande pas un canal absent de ses canaux actuels ou souhaités sans raison explicite. Une visite du site ou un handle Instagram ne prouvent pas la fréquence de publication.
- Pour chaque priorité, remplis source avec l'origine du constat qui motive why. Si c'est seulement une intention déclarée, utilise profile ou about.
- first_step commence par un verbe concret : « Écris… », « Remplace… », « Vérifie… ».
- example utilise des mots réellement fournis, ou des emplacements [à compléter] ; jamais de chiffre, citation client ou résultat inventé.
- Si une source manque, propose une vérification à faire, sans affirmer qu'un problème existe.

7. TON
Écriture inclusive point médian, tutoiement, ton direct et bienveillant. Pas de jargon marketing (pas de ROI, funnel, lead magnet, etc.).

=== FORMAT JSON (pas de markdown, pas de backticks) ===

{
  "summary": "3-4 phrases qui reformulent les mots de la personne. Elle doit se dire 'oui c'est exactement moi'.",
  "screenshot_readable": false,
  "strengths": [{ "title": "titre court", "detail": "élément observable", "source": "website|profile|about|instagram_public|instagram_screenshot|linkedin_screenshot|social_screenshot|instagram_connected|instagram_insights|linkedin|linkedin_analytics" }],
  "weaknesses": [{ "title": "titre court", "detail": "élément observable et limite de l'inférence", "source": "website|profile|about|instagram_public|instagram_screenshot|linkedin_screenshot|social_screenshot|instagram_connected|instagram_insights|linkedin|linkedin_analytics", "fix_hint": "piste concrète" }],
  "scores": { "total": 0, "branding": 0, "instagram": null, "website": null, "linkedin": null },
  "priorities": [{ "title": "action", "why": "raison reliée à un constat", "first_step": "premier geste réalisable tout de suite", "example": "exemple à adapter ou vérification précise", "time": "durée réaliste", "route": "/route", "impact": "high|medium", "source": "origine du constat" }],
  "branding_prefill": { "positioning": null, "mission": null, "target_description": null, "tone_keywords": [], "values": [], "offers": [] }
}

Routes disponibles : /branding, /branding/proposition/recap, /branding/offres, /branding/charter, /instagram/audit, /instagram/profil/bio, /linkedin/profil, /site/audit, /site/accueil, /site/capture, /calendrier, /creer, /idees. Utilise uniquement ces routes.
Scores sur 100 : estimation initiale de la clarté observable, pas de la performance. TOUJOURS null pour les canaux sans profil, publication ou capture lisible ; des statistiques seules ne suffisent pas à juger le contenu.
Max 3-4 forces, 3-4 faiblesses, 3 priorités.`;

    // Build user prompt
    const userParts: string[] = [];

    // Context
    userParts.push(`=== CONTEXTE ===
Cette personne utilise L'Assistant Com'. Elle vient de terminer son onboarding. Ce diagnostic est la PREMIÈRE chose qu'elle verra. Il doit être personnalisé, honnête, et lui donner envie de continuer.`);

    // Profile info
    if (profile) {
      const profileLines = [
        `=== PROFIL ===`,
        `Activité : ${profile.activity || "non renseignée"}`,
        // `activityType` et `blocker` sont des CLÉS (comparées plus bas à
        // "invisible" et utilisées en lookup ACTIVITY_INSIGHTS) : telles quelles
        // dans le prompt, le modèle les recopie entre guillemets et l'inscrite
        // lit « tu te sens "invisible" ». Le front envoie exprès un libellé
        // compagnon `*Label` pour le prompt — c'est LUI qu'on interpole ici.
        `Type : ${profile.activityTypeLabel || profile.activityType || "non renseigné"}`,
        `Objectif principal : ${profile.objective || "non renseigné"}`,
        `Blocage principal : ${profile.blockerLabel || profile.blocker || "non renseigné"}`,
        `Temps disponible/semaine : ${profile.weeklyTime || "non renseigné"}`,
      ];
      const channels = profile.channels || freeformAnswers?.canaux;
      if (channels) profileLines.push(`Canaux actuels : ${Array.isArray(channels) ? channels.join(", ") : channels}`);
      const desiredChannels = freeformAnswers?.desired_channels;
      if (desiredChannels) profileLines.push(`Canaux souhaités : ${Array.isArray(desiredChannels) ? desiredChannels.join(", ") : desiredChannels}`);
      userParts.push(profileLines.join("\n"));
    }

    // Freeform answers
    if (freeformAnswers) {
      const freeformParts: string[] = ["=== RÉPONSES LIBRES ==="];
      if (freeformAnswers.change_priority) freeformParts.push(`Priorité de changement : ${freeformAnswers.change_priority}`);
      if (freeformAnswers.product_or_service) freeformParts.push(`Produits ou services : ${freeformAnswers.product_or_service}`);
      if (freeformAnswers.activity_detail) freeformParts.push(`Détail de l'activité : ${freeformAnswers.activity_detail}`);
      if (freeformAnswers.uniqueness) freeformParts.push(`Ce qui te rend unique : ${freeformAnswers.uniqueness}`);
      if (freeformAnswers.positioning) freeformParts.push(`Positionnement : ${freeformAnswers.positioning}`);
      if (freeformAnswers.mission) freeformParts.push(`Mission : ${freeformAnswers.mission}`);
      if (freeformAnswers.target_description) freeformParts.push(`Cible : ${freeformAnswers.target_description}`);
      userParts.push(freeformParts.join("\n"));
    }

    // Scraped content
    for (const [source, text] of Object.entries(scrapedContent)) {
      userParts.push(`=== SOURCE: ${source.toUpperCase()} ===\n${text}`);
    }

    if (sourcesUsed.length === 0 && instagramScreenshots.length === 0) {
      userParts.push("\n⚠️ Aucune source en ligne n'a pu être scrappée. Base ton diagnostic uniquement sur les réponses du profil.");
    }

    // Warn about failed sources
    if (sourcesFailed.length > 0) {
      const failedLabels = sourcesFailed.map(s => {
        if (s === "instagram") return `Instagram (@${instagramHandle})`;
        if (s === "website") return `Site web (${websiteUrl})`;
        if (s === "linkedin") return `LinkedIn`;
        return s;
      });
      userParts.push(`\n⚠️ Sources non analysées (scraping échoué) : ${failedLabels.join(", ")}. NE PAS inventer de score pour ces sources. Mettre leur score à null dans "scores".`);
    }

    // Final instructions
    userParts.push(`=== CONSIGNES FINALES ===
- Le résumé (summary) : 3-4 phrases, reprends les mots exacts de la personne entre guillemets.
- Scores : uniquement pour les sources réellement analysées ; statistiques seules ne suffisent pas.
- RAPPEL : lis la section "Signaux de conversion" AVANT de dire qu'il manque des CTAs sur le site.
- RAPPEL : ne remonte JAMAIS comme problème un champ non rempli dans l'outil. L'outil est neuf.
- RAPPEL : si une capture est lisible, cite au moins un élément visible et donne un conseil qui en découle. Attribue-la au bon réseau si reconnaissable.
- Chaque force/faiblesse a une preuve concrète dans le "detail". Ne transforme pas une hypothèse en observation.
- Chaque priorité a un premier geste et un exemple utile, sans fait inventé.`);

    const userPrompt = userParts.join("\n\n");

    // ====== PHASE 2 EN PARALLÈLE : Enrichissement branding — fire-and-forget ======
    // Lancé AVANT l'appel diagnostic : l'enrichissement (Opus, 60-90 s) n'utilise
    // que les données sources — jamais le résultat du diagnostic — donc le faire
    // attendre la fin de la phase 1 (comme avant) ajoutait toute la durée du
    // diagnostic à l'attente de la fiche « à valider ». Mesuré le 13/08 : 79 s
    // bloquée sur « Je finis de préparer ta marque… » après le clic. En parallèle,
    // l'enrichissement court pendant le diagnostic ET pendant la lecture du
    // résultat. `savedDiagId` n'existe pas encore → null : l'edge retrouve la
    // dernière ligne diagnostic_results au moment d'écrire branding_prefill.
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      // Build enrichment prompt: include style hints + full cached website content
      let enrichmentPrompt = userPrompt.slice(0, 16000);

      // Add full cached content if available (the userPrompt already has a truncated version)
      if (websiteUrl) {
        try {
          const { data: fullCache } = await supabaseAdmin
            .from("scrape_cache")
            .select("content, style_hints")
            .eq("user_id", profileUserId)
            .eq("url", websiteUrl)
            .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fullCache?.content && fullCache.content.length > MAX_TEXT_PER_SOURCE) {
            enrichmentPrompt += `\n\n=== CONTENU COMPLET DU SITE (pour enrichissement approfondi) ===\n${fullCache.content}`;
          }
          // Repli si le cache n'a pas d'indices visuels (cache périmé > 1 h, ou
          // ligne écrite avant le fix CSS) : on a déjà pu les extraire nous-mêmes
          // au scrape direct plus haut. Sans ce `else if`, ces couleurs étaient
          // calculées puis PERDUES ici — l'IA recevait 0 couleur et inventait une
          // palette d'ambiance (cas 2 du prompt d'enrichissement).
          if (fullCache?.style_hints) {
            enrichmentPrompt += `\n\n${fullCache.style_hints}`;
          } else if (cachedStyleHints) {
            enrichmentPrompt += `\n\n${cachedStyleHints}`;
          }
        } catch {
          // Fallback: use cached style hints already extracted
          if (cachedStyleHints) {
            enrichmentPrompt += `\n\n${cachedStyleHints}`;
          }
        }
      } else if (cachedStyleHints) {
        enrichmentPrompt += `\n\n${cachedStyleHints}`;
      }

      fetch(`${supabaseUrl}/functions/v1/diagnostic-enrichment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          userId,
          workspaceId,
          userPrompt: enrichmentPrompt,
          websiteStyleHints: cachedStyleHints,
          savedDiagId: null,
          isOnboarding,
          // Remplacement explicitement confirmé à l'écran (espace déjà brandé).
          allowOverwrite: allowOverwrite === true,
        }),
      }).catch(() => {});
    } catch {
      // Ignorer
    }

    // ====== CALL CLAUDE — PHASE 1 : Diagnostic rapide (Sonnet) ======
    // Logique + décision de facturation extraites dans runFastDiagnostic
    // (exportée pour les tests de régression crédit, voir index_test.ts).
    const { analysisResult, usageLog } = await runFastDiagnostic({
      systemPrompt,
      userPrompt,
      instagramScreenshots,
      connectedImages,
      profile,
      freeformAnswers,
      sourcesUsed,
      userId,
      workspaceId,
      isOnboarding: !!isOnboarding,
    });
    finalizeDiagnosticEvidence(analysisResult, sourcesUsed, sourcesFailed, instagramScreenshots.length);

    // ====== SAVE TO DB (fast: only diagnostic essentials) ======
    // Non bloquant : le diagnostic vient d'être généré avec succès — un échec
    // de sauvegarde ne doit pas priver l'utilisatrice du résultat déjà obtenu
    // (savedDiag?.id reste undefined, la réponse est renvoyée quand même).
    const { data: savedDiag, error: diagInsertError } = await supabaseAdmin
      .from("diagnostic_results")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        summary: (analysisResult as any).summary || null,
        strengths: (analysisResult as any).strengths || null,
        weaknesses: (analysisResult as any).weaknesses || null,
        scores: (analysisResult as any).scores || null,
        priorities: (analysisResult as any).priorities || null,
        branding_prefill: null, // sera rempli par phase 2
        sources_used: sourcesUsed,
        sources_failed: sourcesFailed,
        raw_analysis: analysisResult,
      })
      .select("id")
      .single();
    if (diagInsertError) console.error("deep-diagnostic: échec sauvegarde (non bloquant):", diagInsertError);

    // audit_recommendations + logUsage en parallèle
    const priorities = (analysisResult as any).priorities;
    const fastSaves: Promise<any>[] = [];

    if (priorities?.length > 0) {
      fastSaves.push(
        Promise.resolve(
          supabaseAdmin.from("audit_recommendations").insert(
            priorities.map((p: any, i: number) => ({
              user_id: userId, workspace_id: workspaceId,
              label: p.title, titre: p.title, module: "diagnostic",
              route: p.route || "/dashboard", detail: [p.why, p.first_step, p.example].filter(Boolean).join("\n") || null,
              temps_estime: p.time || null, priorite: p.impact || "medium",
              position: i + 1, completed: false,
            }))
          ).then(({ error }) => { if (error) console.error("Save recommendations failed:", error); })
        ).catch((e: unknown) => console.error("Save recommendations failed:", e))
      );
    }

    // Crédit débité UNIQUEMENT si l'IA a réellement répondu (usageLog est null
    // sur le chemin fallback et pendant l'onboarding — voir runFastDiagnostic).
    if (usageLog) {
      fastSaves.push(usageLog);
    }

    await Promise.allSettled(fastSaves);

    // (Phase 2 — enrichissement branding — désormais tirée AVANT la phase 1,
    // en parallèle du diagnostic : voir le bloc au-dessus de l'appel Sonnet.)

    clearTimeout(timeout);
    return new Response(
      JSON.stringify({
        success: true,
        id: savedDiag?.id,
        diagnostic: { ...analysisResult, branding_prefill: null },
        sources_used: sourcesUsed,
        sources_failed: sourcesFailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("deep-diagnostic error:", e);
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ====== ACTIVITY INSIGHTS ======

const ACTIVITY_INSIGHTS: Record<string, { strengths: string[]; tips: string[]; priority: string }> = {
  artisane: {
    strengths: ["Le fait-main a une histoire à raconter : le processus de fabrication peut devenir ton meilleur contenu"],
    tips: ["Montre les coulisses de ta création : les mains, les matières, le travail en cours", "Le visuel produit est ton premier levier de vente en ligne"],
    priority: "Photographie tes produits sous plusieurs angles et en situation",
  },
  mode_textile: {
    strengths: ["La mode éthique est un marché en forte croissance, tu es sur le bon créneau"],
    tips: ["Les lookbooks et les mises en situation font vendre plus que les photos produit seules", "Ton histoire de marque (pourquoi l'éthique) est un puissant levier émotionnel"],
    priority: "Crée du contenu storytelling sur ta démarche éthique",
  },
  art_design: {
    strengths: ["Ton travail visuel est ton CV : chaque publication est une preuve de talent"],
    tips: ["Montre ton processus créatif, pas seulement le résultat final", "Les carrousels avant/après fonctionnent très bien pour les créatif·ves"],
    priority: "Constitue un portfolio en ligne qui montre ta diversité",
  },
  beaute_cosmetiques: {
    strengths: ["Les tutoriels et démonstrations sont le format roi dans la beauté"],
    tips: ["Le Reels/vidéo courte est ton meilleur allié : montre les textures, les applications", "Les avis client·es et avant/après sont très convaincants dans ton secteur"],
    priority: "Lance une série de tutoriels courts sur tes produits phares",
  },
  bien_etre: {
    strengths: ["Ton expertise se partage naturellement via du contenu éducatif"],
    tips: ["Les formats 'tips du jour' et 'mythes vs réalités' fonctionnent très bien", "Ta personnalité et ton approche sont ton principal différenciant"],
    priority: "Crée du contenu éducatif qui montre ton expertise unique",
  },
  coach: {
    strengths: ["Les témoignages et transformations client·es sont tes meilleurs arguments"],
    tips: ["Partage des mini-coachings gratuits en stories pour donner un avant-goût", "Ta posture personnelle (ce que tu incarnes) est aussi importante que tes méthodes"],
    priority: "Collecte et mets en avant 3 témoignages client·es",
  },
  coach_sportive: {
    strengths: ["Le contenu vidéo (démos, exercices) crée un lien fort avec ta communauté"],
    tips: ["Les transformations et défis engagent beaucoup sur les réseaux", "Montre ta propre pratique : l'authenticité inspire plus que la perfection"],
    priority: "Lance un mini-programme gratuit en stories pour engager ta communauté",
  },
  consultante: {
    strengths: ["Ton expertise peut se décliner en contenus éducatifs à forte valeur ajoutée"],
    tips: ["Les études de cas (anonymisées) sont le meilleur format pour prouver ton expertise", "LinkedIn est probablement ton canal prioritaire pour toucher des client·es B2B"],
    priority: "Publie une étude de cas détaillée de ta meilleure mission",
  },
  formatrice: {
    strengths: ["Tu sais déjà transmettre : ton contenu peut naturellement être pédagogique"],
    tips: ["Les carrousels 'X étapes pour...' et les mini-formations gratuites attirent ton audience", "Montre des extraits de tes formations pour donner envie"],
    priority: "Publie un extrait de ta méthode en contenu gratuit pour montrer ton expertise",
  },
  deco_interieur: {
    strengths: ["Les avant/après et les moodboards sont tes formats stars"],
    tips: ["Pinterest est un canal stratégique pour la déco : les gens y cherchent activement de l'inspiration", "Montre ton processus de réflexion, pas juste le résultat"],
    priority: "Crée un tableau Pinterest optimisé par style de décoration",
  },
};

// ====== FALLBACK DIAGNOSTIC ======

function buildFallbackDiagnostic(
  profile: any,
  freeformAnswers: any,
  sourcesUsed: string[]
): Record<string, unknown> {
  const hasWebPresence = sourcesUsed.length > 0;
  const activityType = profile?.activityType || "";
  const insights = ACTIVITY_INSIGHTS[activityType] || null;

  const strengths: any[] = [];
  const weaknesses: any[] = [];

  if (profile?.activity) {
    strengths.push({
      title: "Activité définie",
      detail: `Tu sais ce que tu fais : ${profile.activity}. C'est la base pour communiquer clairement.`,
      source: "profile",
    });
  }

  if (freeformAnswers?.uniqueness) {
    strengths.push({
      title: "Différenciation identifiée",
      detail: `Tu as identifié ce qui te rend unique : "${freeformAnswers.uniqueness}". C'est un atout à mettre en avant.`,
      source: "profile",
    });
  }

  // Add activity-specific strengths
  if (insights) {
    for (const s of insights.strengths) {
      strengths.push({ title: s, detail: s, source: "profile" });
    }
  }

  if (!hasWebPresence) {
    weaknesses.push({
      title: "Présence en ligne limitée",
      detail: "Je n'ai pas pu analyser de site web ni de réseaux sociaux. Sans présence en ligne visible, tes client·es potentiel·les ont du mal à te trouver.",
      source: "profile",
      fix_hint: insights?.tips[0] || "Ajoute ton site web ou tes réseaux dans ton profil pour un diagnostic plus complet.",
    });
  }

  if (profile?.blocker === "invisible") {
    weaknesses.push({
      title: "Manque de visibilité",
      detail: "Tu te sens invisible — c'est le blocage principal que tu as identifié. Souvent, c'est une question de régularité et de clarté dans le message.",
      source: "profile",
      fix_hint: insights?.tips[1] || "Définis tes 3 piliers de contenu et publie 2-3 fois par semaine.",
    });
  }

  // Filet de sécurité : jamais de section « Ce qu'on va travailler » vide
  // (avant, présence web + blocage ≠ invisible → zéro faiblesse → section fantôme).
  if (weaknesses.length === 0) {
    weaknesses.push({
      title: "On manque de données pour un diagnostic précis",
      detail: "Je n'ai pas pu faire l'analyse complète cette fois. Plus tu renseignes d'infos (site web, réseaux), plus le diagnostic sera pertinent et actionnable.",
      source: "profile",
      fix_hint: "Relance ton diagnostic depuis ton espace, ou lance les audits dédiés (site, Instagram).",
    });
  }

  const totalScore = Math.min(100, Math.max(10,
    (profile?.activity ? 15 : 0) +
    (freeformAnswers?.uniqueness ? 15 : 0) +
    (hasWebPresence ? 20 : 0) +
    (profile?.objective ? 10 : 0) +
    10 // base
  ));

  // Build summary — sans gabarit « Tu es X dans le domaine "Y" » : `activity`
  // est du texte libre (parfois pollué par l'autofill, ex. un nom de famille)
  // et la tournure produisait des phrases absurdes (« le domaine "Mattioli" »).
  const activityLine = profile?.activity ? ` Ton activité, avec tes mots : « ${profile.activity} ».` : "";
  const blockerLine = profile?.blocker === "invisible"
    ? " Tu te sens invisible et cherches à gagner en visibilité."
    : " Tu veux développer ta communication.";
  const insightLine = insights?.tips[0] ? ` Mon conseil : ${insights.tips[0].toLowerCase()}.` : "";
  const sourceLine = hasWebPresence
    ? ""
    : " J'ai pas eu accès à tes réseaux ni à ton site, donc je me base sur ce que tu m'as dit. Ajoute tes liens pour un diagnostic plus poussé.";

  const summary = `Voici un premier aperçu, basé sur tes réponses.${activityLine}${blockerLine}${insightLine}${sourceLine}`;

  // Build priorities — use activity-specific first priority if available
  const priorities = [
    {
      title: "Écris ta promesse en une phrase",
      why: insights ? "Cette piste correspond au type d'activité que tu as indiqué, mais elle reste à vérifier avec tes contenus." : "Tes réponses donnent un point de départ pour formuler clairement ce que tu apportes.",
      first_step: "Écris une phrase qui dit ce que tu proposes, à qui et ce que cette personne y gagne.",
      example: "J'aide [public] à [résultat] grâce à [mon approche].",
      time: "15 min",
      route: "/branding",
      impact: "high",
    },
    {
      title: "Choisis une personne à qui parler en premier",
      why: "Une situation précise rend ton prochain contenu plus facile à écrire.",
      first_step: "Note une question réelle qu'une personne te pose avant d'acheter ou de te contacter.",
      example: "« Comment savoir si [offre] est adaptée à ma situation ? »",
      time: "10 min",
      route: "/branding",
      impact: "high",
    },
    {
      title: "Prépare un premier contenu utile",
      why: "Tu peux partir de cette question sans attendre un plan éditorial complet.",
      first_step: "Réponds à cette question en trois phrases, puis choisis où publier cette réponse.",
      example: "Une phrase pour le problème, une pour ta réponse, une pour inviter à échanger.",
      time: "15 min",
      route: "/calendrier",
      impact: "medium",
    },
  ];

  return {
    summary,
    strengths,
    weaknesses,
    scores: {
      total: totalScore,
      branding: totalScore,
      instagram: null,
      website: null,
      linkedin: null,
    },
    priorities,
    branding_prefill: {
      positioning: null,
      mission: null,
      target_description: null,
      tone_keywords: [],
      values: [],
      offers: [],
    },
    _fallback: true,
  };
}
