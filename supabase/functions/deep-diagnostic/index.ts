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

const MAX_TEXT_PER_SOURCE = 8000;
const GLOBAL_TIMEOUT_MS = 55000;

// Sortie structurée forcée : l'API garantit un `input` conforme — élimine la
// classe d'échecs « JSON tronqué/illisible » du parsing texte (cf #640).
const DIAGNOSTIC_TOOL: AnthropicTool = {
  name: "rendre_diagnostic",
  description: "Renvoie le diagnostic de communication structuré.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "3-4 phrases qui reformulent les mots de la personne" },
      strengths: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            source: { type: "string", enum: ["website", "profile", "about", "instagram", "linkedin", "documents"] },
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
            source: { type: "string", enum: ["website", "profile", "about", "instagram", "linkedin", "documents"] },
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
            time: { type: "string" },
            route: { type: "string" },
            impact: { type: "string", enum: ["high", "medium"] },
          },
          required: ["title", "why", "route"],
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
  profile: any;
  freeformAnswers: any;
  sourcesUsed: string[];
  userId: string;
  workspaceId: string | null;
  isOnboarding: boolean;
}): Promise<{ analysisResult: Record<string, unknown>; usageLog: Promise<unknown> | null }> {
  const { systemPrompt, userPrompt, instagramScreenshots, profile, freeformAnswers, sourcesUsed, userId, workspaceId, isOnboarding } = opts;

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
        text: "Ci-dessus : capture d'écran du profil Instagram de cette personne. Analyse la bio, le nombre d'abonnés, la cohérence visuelle du feed, le nom affiché, et tout élément visible.",
      });
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
                // Try to extract visual info too
                try {
                  let formattedUrl = websiteUrl.trim();
                  if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;
                  // SSRF : fetch visuel hors scrapeWebsite -> garde explicite + redirect manual.
                  if (!isSafePublicUrl(formattedUrl)) throw new Error("URL non publique");
                  const resp = await fetch(formattedUrl, {
                    signal: controller.signal,
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
                    redirect: "manual",
                  });
                  if (resp.ok) {
                    const html = await resp.text();
                    // CSS externes = là où vivent les vraies couleurs (cf pre-scrape-website)
                    const externalCss = await fetchExternalCss(html, formattedUrl, controller.signal);
                    cachedStyleHints = extractVisualInfo(html, externalCss);
                  }
                } catch { /* style hints are nice-to-have */ }
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
              scrapedContent.instagram = text.slice(0, MAX_TEXT_PER_SOURCE);
              sourcesUsed.push("instagram");
            } else {
              sourcesFailed.push("instagram");
            }
          })
          .catch(() => { sourcesFailed.push("instagram"); })
      );
    }

    // Process Instagram screenshots from uploads — max 1, size limit
    let instagramScreenshots: { base64: string; mediaType: string }[] = [];
    if (documentIds && documentIds.length > 0) {
      scrapePromises.push(
        processScreenshots(supabaseAdmin, documentIds.slice(0, 1), userId)
          .then((screenshots) => {
            // Filter out screenshots larger than 500KB base64 (~375KB image)
            instagramScreenshots = screenshots.filter(s => s.base64.length < 500000).slice(0, 1);
            if (instagramScreenshots.length > 0) {
              sourcesUsed.push("instagram_screenshot");
            } else {
              sourcesFailed.push("instagram_screenshot");
            }
          })
          .catch(() => { sourcesFailed.push("instagram_screenshot"); })
      );
    }

    await Promise.allSettled(scrapePromises);

    // ====== BUILD PROMPT ======
    const systemPrompt = `Tu es l'assistante com' de L'Assistant Com'. Tu fais un diagnostic de communication personnalisé.

CONTEXTE : cette personne vient de terminer son onboarding. Ce diagnostic est la PREMIÈRE chose qu'elle verra. Il doit être percutant, honnête et donner envie de continuer.

=== RÈGLES ABSOLUES ===

1. SOURCES UNIQUEMENT
Tu ne peux commenter QUE les sources présentes dans les sections "SOURCE:" du message utilisateur.
- Pas de section "SOURCE: WEBSITE" → RIEN sur le site web (pas de CTA, pas de SEO, pas de navigation, rien)
- Pas de screenshot Instagram → RIEN sur Instagram (pas de bio, pas de feed, pas d'abonnés, rien)
- Pas de section "SOURCE: LINKEDIN" → RIEN sur LinkedIn
- INSTAGRAM N'EST JAMAIS SCRAPPÉ PAR API. Même si l'utilisatrice a renseigné son handle Instagram, tu n'as PAS accès à son profil sauf si un screenshot est fourni en image.

2. PREUVES CONCRÈTES OBLIGATOIRES
Chaque force et chaque faiblesse DOIT citer entre guillemets un extrait LITTÉRAL trouvé dans les données.
- ✅ BON : "Ton site affiche 'Réserver un coaching découverte' en haut de page : c'est un CTA clair."
- ❌ INTERDIT : "Pas de CTA sur le site" (sans avoir vérifié la section "Signaux de conversion" des données)
- ❌ INTERDIT : "Bio Instagram incomplète" (sans screenshot Instagram)

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

5. INSTAGRAM : REDIRIGER VERS L'AUDIT DÉDIÉ
Puisque tu n'as pas accès à Instagram, ne fais AUCUNE recommandation spécifique Instagram. Si l'utilisatrice utilise Instagram, ajoute dans les priorités : "Fais ton audit Instagram dans l'outil pour un diagnostic détaillé" avec la route /audit-instagram.

6. RECOMMANDATIONS CONCRÈTES ET ACTIONNABLES
Chaque faiblesse doit expliquer le PROBLÈME RÉEL et donner une piste concrète.
- ✅ BON : "Ton site parle de 'coaching' mais ne précise pas pour qui ni quel résultat concret. Tes visiteuses ne savent pas si c'est pour elles."
- ❌ MAUVAIS : "Ta stratégie de contenu manque de structure" (générique, non vérifiable)

7. TON
Écriture inclusive point médian, tutoiement, ton direct et bienveillant. Pas de jargon marketing (pas de ROI, funnel, lead magnet, etc.).

=== FORMAT JSON (pas de markdown, pas de backticks) ===

{
  "summary": "3-4 phrases qui reformulent les mots de la personne. Elle doit se dire 'oui c'est exactement moi'.",
  "strengths": [{ "title": "titre court", "detail": "explication avec citation concrète entre guillemets", "source": "website|profile|about" }],
  "weaknesses": [{ "title": "titre court", "detail": "explication du problème réel avec preuve", "source": "website|profile|about", "fix_hint": "piste concrète et actionnable" }],
  "scores": { "total": 0, "branding": 0, "instagram": null, "website": null, "linkedin": null },
  "priorities": [{ "title": "action", "why": "raison", "time": "durée", "route": "/route", "impact": "high|medium" }],
  "branding_prefill": { "positioning": null, "mission": null, "target_description": null, "tone_keywords": [], "values": [], "offers": [] }
}

Routes disponibles : /storytelling, /persona, /proposition, /calendrier, /engagement, /bio-profile, /audit-instagram, /strategie, /offre, /charte-graphique
Scores sur 100. TOUJOURS null pour les sources non analysées (pas de score inventé). Instagram est TOUJOURS null (pas scrappable).
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

    if (sourcesUsed.length === 0) {
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
- Scores : uniquement pour les sources réellement analysées. Instagram = TOUJOURS null.
- RAPPEL : lis la section "Signaux de conversion" AVANT de dire qu'il manque des CTAs sur le site.
- RAPPEL : ne remonte JAMAIS comme problème un champ non rempli dans l'outil. L'outil est neuf.
- RAPPEL : pas de recommandation Instagram sauf "Fais ton audit Instagram" avec route /audit-instagram.
- Chaque force/faiblesse cite un extrait concret entre guillemets dans le "detail".`);

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
      profile,
      freeformAnswers,
      sourcesUsed,
      userId,
      workspaceId,
      isOnboarding: !!isOnboarding,
    });

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
        supabaseAdmin.from("audit_recommendations").insert(
          priorities.map((p: any, i: number) => ({
            user_id: userId, workspace_id: workspaceId,
            label: p.title, titre: p.title, module: "diagnostic",
            route: p.route || "/dashboard", detail: p.why || null,
            temps_estime: p.time || null, priorite: p.impact || "medium",
            position: i + 1, completed: false,
          }))
        ).then(({ error }) => { if (error) console.error("Save recommendations failed:", error); })
          .catch(e => console.error("Save recommendations failed:", e))
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
      title: insights?.priority || "Complète ton identité de marque",
      why: insights ? "C'est le levier le plus impactant pour ton type d'activité" : "Sans fondations claires, ta communication manque de cohérence",
      time: "30 min",
      route: insights ? "/storytelling" : "/storytelling",
      impact: "high",
    },
    {
      title: "Définis ta cliente idéale",
      why: "Savoir à qui tu parles change tout dans ton contenu",
      time: "20 min",
      route: "/persona",
      impact: "high",
    },
    {
      title: "Planifie tes premiers contenus",
      why: "La régularité est plus importante que la perfection",
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
