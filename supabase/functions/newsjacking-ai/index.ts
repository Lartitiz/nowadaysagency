import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { getModelForAction } from "../_shared/anthropic.ts";
import { EMBEDDED_EDUCATION } from "../_shared/copywriting-prompts.ts";

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

    // Claude call with web search
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = getModelForAction("content");

    const systemPrompt = `Tu es une assistante de veille stratégique pour créateur·ices de contenu. Tu dois trouver des actualités pertinentes que cette personne peut transformer en contenu pour ses réseaux sociaux.

PROFIL DE L'UTILISATEUR·ICE :
${brandingContext}

CONSIGNE : Fais une recherche web pour trouver des actualités RÉCENTES (dernières 48-72h idéalement, dernière semaine maximum).

Cherche sur 2 axes :

ACTU GLOBALE : tendances société, événements médiatiques, faits culturels, débats publics, nouvelles lois, phénomènes viraux — tout ce dont "les gens parlent en ce moment"

ACTU NICHE : nouveautés, tendances, controverses, études, événements spécifiques au secteur et au métier de cette personne

Pour chaque actu trouvée, évalue si elle a un POTENTIEL DE CONTENU pour cette personne :
- Est-ce que son audience s'en soucie ?
- Est-ce qu'elle peut apporter un regard unique dessus grâce à son expertise ?
- Est-ce que ça touche à ses piliers de contenu, ses combats, ou ses valeurs ?

${EMBEDDED_EDUCATION}

IMPORTANT SUR LES ANGLES PROPOSÉS :
- Chaque angle doit utiliser un des 4 véhicules d'éducation embarquée (récit d'expérience, déclencheur externe, constat décalé, montrer plutôt qu'expliquer)
- L'actu est le DÉCLENCHEUR, pas le sujet. Le contenu parle de l'expertise de la personne À TRAVERS l'actu.
- Le ton n'est JAMAIS "voici ce qui se passe + voici mon avis". C'est : "cette actu m'a fait penser à un truc que je vis/vois/observe dans mon métier"
- Les angles doivent être SPÉCIFIQUES au branding de cette personne, pas génériques

Réponds UNIQUEMENT en JSON (pas de markdown, pas de backticks) :
{
  "actus": [
    {
      "titre": "Titre court de l'actu (max 80 caractères)",
      "resume": "Résumé factuel en 2-3 phrases de ce qui se passe",
      "source": "Nom du média ou de la source",
      "type": "globale" ou "niche",
      "pertinence": "En 1 phrase, pourquoi c'est pertinent pour CETTE personne",
      "angles": [
        {
          "vehicule": "recit_experience" | "declencheur_externe" | "constat_decale" | "montrer_plutot_quexpliquer",
          "hook": "La première phrase du contenu (max 20 mots, percutante)",
          "description": "En 2-3 phrases, l'angle développé : comment relier l'actu à l'expertise de la personne",
          "format_suggere": "post" | "carousel" | "reel" | "story" | "linkedin"
        }
      ]
    }
  ]
}

Retourne entre 3 et 5 actus maximum, classées par pertinence décroissante. Si aucune actu pertinente n'est trouvée, retourne :
{ "actus": [], "message": "Pas d'actu suffisamment pertinente trouvée pour ton secteur cette semaine. Réessaie dans quelques jours !" }`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2025-01-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
        messages: [{ role: "user", content: systemPrompt + "\n\nTrouve les actualités les plus pertinentes pour moi en ce moment." }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", response.status, errText);
      return new Response(JSON.stringify({ error: `Erreur IA (${response.status})` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    // Extract text blocks
    const textBlocks = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text);
    const fullText = textBlocks.join("\n");

    // Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(fullText.trim());
    } catch {
      // Fallback: extract JSON from surrounding text
      const firstBrace = fullText.indexOf("{");
      const lastBrace = fullText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(fullText.slice(firstBrace, lastBrace + 1));
        } catch {
          console.error("JSON parse failed. Text:", fullText.slice(0, 500));
          return new Response(JSON.stringify({ error: "Erreur de parsing. Réessaie." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        console.error("No JSON found in response. Text:", fullText.slice(0, 500));
        return new Response(JSON.stringify({ error: "Réponse IA invalide. Réessaie." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
