import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { getModelForAction } from "../_shared/anthropic.ts";


serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isDemoUser(user.id)) {
      return new Response(JSON.stringify({ error: "Fonctionnalité non disponible en mode démo." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const workspace_id = body?.workspace_id || undefined;

    // Rate limit
    const rl = checkRateLimit(user.id, 5, 60_000);
    if (!rl.allowed) {
      return rateLimitResponse(rl.retryAfterMs!, corsHeaders);
    }

    // Quota
    const quota = await checkQuota(user.id, "deep_research", workspace_id);
    if (!quota.allowed) {
      return quotaDeniedResponse(quota, corsHeaders);
    }

    // Branding context
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ctx = await getUserContext(sbService, user.id, workspace_id);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);

    // Extract activity keywords for targeted niche search
    const activityRaw = ctx?.profile?.activite || ctx?.profile?.type_activite || "";
    const pillarsRaw = Array.isArray(ctx?.profile?.piliers) ? ctx.profile.piliers.join(", ") : "";
    const cibleRaw = ctx?.profile?.cible || "";
    const combatCause = ctx?.brand_profile?.combat_cause || "";
    const nicheLabel = activityRaw || "son secteur";

    // Date context for "récent"
    const now = new Date();
    const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    const monthLabel = `${months[now.getMonth()]} ${now.getFullYear()}`;

    // Build 3 distinct niche queries
    const nicheQueries = [
      activityRaw ? `${activityRaw} actualité ${monthLabel}` : "",
      cibleRaw ? `${cibleRaw} préoccupations ${now.getFullYear()}` : (pillarsRaw ? `${pillarsRaw} actualité` : ""),
      combatCause ? `${combatCause} débat actualité ${now.getFullYear()}` : (activityRaw ? `${activityRaw} tendance secteur` : ""),
    ].filter(Boolean);

    // Claude call with web search
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = getModelForAction("content");

    // 6 axes orientés micro-phénomènes culturels et comportementaux
    // (plus de politique/éco pure, plus de "réseaux sociaux" — tout le monde n'est pas créateur)
    const AXES = [
      { id: "mot_qui_revient", query: "expression mot concept qui revient conversations 2026 France" },
      { id: "obsession_collective", query: "phénomène culturel dont tout le monde parle France 2026" },
      { id: "comportement_emergent", query: "nouveau comportement quotidien tendance société France 2026" },
      { id: "debat_recurrent", query: "débat récurrent authenticité productivité éthique vie quotidienne 2026" },
      { id: "objet_culturel", query: "film série livre album sortie récente discussion France 2026" },
      { id: "actu_connectable", query: "actualité société qui touche au quotidien et aux choix de vie France 2026" },
    ];

    // Pick 3 distinct axes for the 3 global items
    const shuffled = [...AXES].sort(() => Math.random() - 0.5);
    const pickedAxes = shuffled.slice(0, 3);

    const systemPrompt = `Tu es une assistante de veille stratégique pour créateur·ices de contenu.

PROFIL DE L'UTILISATEUR·ICE :
${brandingContext}

══════════════════════════════════════════════
TU DOIS EFFECTUER PLUSIEURS RECHERCHES WEB SÉPARÉES
══════════════════════════════════════════════

▶ RECHERCHES GLOBALES — 3 univers thématiques DIFFÉRENTS (obligatoire) :
Tu dois trouver 3 actus globales, chacune dans un AXE THÉMATIQUE DISTINCT parmi ces 3 axes imposés ci-dessous (1 actu par axe, jamais 2 du même axe).

${pickedAxes.map((a, i) => `  ${i + 1}. axe="${a.id}" → cherche : "${a.query}"`).join("\n")}

Règle : une actu est GLOBALE si quelqu'un qui n'est PAS dans le secteur de cette personne en a entendu parler. Pas besoin de lien direct avec son métier — l'angle viendra ensuite.

▶ RECHERCHES NICHE — métier de "${nicheLabel}" (obligatoire) :
Tu dois trouver 3 actus niche en faisant CES 3 recherches DIFFÉRENTES (pas une seule, les 3) :
${nicheQueries.map((q, i) => `  ${i + 1}. "${q}"`).join("\n")}

Une actu niche pertinente parle directement du SECTEUR, du MARCHÉ ou des CLIENTS de "${nicheLabel}".

══════════════════════════════════════════════
RÈGLES DE QUALITÉ — TRÈS IMPORTANT
══════════════════════════════════════════════

🚫 INTERDIT (sauf si c'est littéralement le métier de la personne) :
- Actus génériques sur "l'IA", "ChatGPT", "TikTok", "réseaux sociaux", "marketing digital", "outils de productivité"
- Marronniers sans nouveauté ("comment bien commencer l'année", "tendances 2026" génériques)
- Communiqués de presse d'entreprises tech mainstream (Meta, Google, OpenAI, Apple) sauf actu vraiment marquante

✅ MIX DE TONS OBLIGATOIRE — tes 6 actus doivent inclure :
- AU MOINS 1 actu de ton "drole_decale" (légère, cocasse, fait divers savoureux)
- AU MOINS 1 actu de ton "serieux_marquant" (actu de fond, qui fait réfléchir)
- AU MOINS 1 actu de ton "surprenant_contre_intuitif" (chiffre ou révélation qui détonne)

Les axes ET les tons sont INDÉPENDANTS. Tu peux avoir "science_decouverte" + ton "drole_decale" (étude scientifique surprenante et drôle), ou "politique_loi" + ton "surprenant_contre_intuitif". Croise-les librement.

══════════════════════════════════════════════
FORMAT DE RÉPONSE — JSON STRICT (pas de markdown, pas de backticks)
══════════════════════════════════════════════

{
  "actus": [
    {
      "titre": "Titre court de l'actu (max 80 caractères)",
      "resume": "Résumé factuel en 2 phrases courtes de ce qui se passe",
      "source": "Nom du média ou de la source",
      "type": "globale" | "niche",
      "axe": "societe_debat" | "economie_argent" | "culture_pop" | "science_decouverte" | "politique_loi" | "viral_insolite",
      "ton": "serieux_marquant" | "drole_decale" | "surprenant_contre_intuitif",
      "pertinence": "En 1 phrase, pourquoi cette actu peut inspirer du contenu pour ${nicheLabel}"
    }
  ]
}

RÉPARTITION SOUPLE — entre 3 et 6 actus, qualité avant quantité :
- Idéalement 3 actus "globale" (1 par axe imposé) + 3 actus "niche" (1 par recherche métier)
- Si un axe ou une recherche ne donne rien de pertinent, tu peux renvoyer moins (ex : 2 globales + 3 niche, ou 3 globales + 2 niche)
- Minimum acceptable : 3 actus au total, avec au moins 1 globale ET 1 niche
- Règle absolue : JAMAIS 2 actus du même axe
- Si tu renvoies 4+ actus, respecte le mix de tons (au moins 2 tons différents)

Si vraiment rien ne fonctionne (moins de 3 actus pertinentes au total), retourne :
{ "actus": [], "message": "Pas d'actu suffisamment pertinente trouvée cette semaine. Réessaie dans quelques jours !" }`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
        messages: [{ role: "user", content: systemPrompt + `\n\nFais les recherches maintenant et renvoie entre 3 et 6 actus variées (axes + tons mélangés). Privilégie la qualité : mieux vaut 3 bonnes actus que 6 médiocres.` }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", response.status, "model:", model, "body:", errText.slice(0, 500));
      const userMsg = response.status === 529 ? "L'IA est temporairement surchargée. Réessaie dans quelques secondes."
        : response.status === 403 ? "Le web search n'est pas activé sur le compte API. Contacte le support."
        : `Erreur IA (${response.status}). Réessaie.`;
      return new Response(JSON.stringify({ error: userMsg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    // Extract text blocks (web search responses have multiple text blocks interleaved with search results)
    const textBlocks = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text);
    const fullText = textBlocks.join("\n");
    console.log("Raw text blocks count:", textBlocks.length, "Full text length:", fullText.length);

    // Parse JSON — try multiple strategies
    let parsed: any;

    // Strategy 1: direct parse
    try {
      parsed = JSON.parse(fullText.trim());
    } catch {
      // Strategy 2: find the outermost JSON object containing "actus"
      const actusIndex = fullText.indexOf('"actus"');
      if (actusIndex !== -1) {
        const braceStart = fullText.lastIndexOf("{", actusIndex);
        if (braceStart !== -1) {
          let depth = 0;
          let braceEnd = -1;
          for (let i = braceStart; i < fullText.length; i++) {
            if (fullText[i] === "{") depth++;
            else if (fullText[i] === "}") {
              depth--;
              if (depth === 0) { braceEnd = i; break; }
            }
          }
          if (braceEnd !== -1) {
            try {
              parsed = JSON.parse(fullText.slice(braceStart, braceEnd + 1));
            } catch (e2) {
              console.error("JSON parse strategy 2 failed:", (e2 as Error).message);
            }
          }
        }
      }

      // Strategy 3: last resort — find first { and last }
      if (!parsed) {
        const firstBrace = fullText.indexOf("{");
        const lastBrace = fullText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(fullText.slice(firstBrace, lastBrace + 1));
          } catch (e3) {
            console.error("JSON parse failed all strategies. Text preview:", fullText.slice(0, 800));
            return new Response(JSON.stringify({ error: "Erreur de parsing IA. Réessaie." }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          console.error("No JSON found in response. Text preview:", fullText.slice(0, 800));
          return new Response(JSON.stringify({ error: "Réponse IA invalide. Réessaie." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (!parsed.actus || !Array.isArray(parsed.actus)) {
      return new Response(JSON.stringify({ error: "Format de réponse invalide." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log usage
    await logUsage(user.id, "deep_research", "newsjacking", undefined, model, workspace_id);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("newsjacking-ai error:", e);
    const message = e instanceof Error && e.name === "AbortError"
      ? "Timeout : la recherche a pris trop de temps. Réessaie."
      : e instanceof Error ? e.message : "Erreur interne";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
