import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LINKEDIN_PRINCIPLES } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Branding data now fetched via getUserContext

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Anthropic API key checked in shared helper

    // Check plan limits (audit type)
    const quotaCheck = await checkQuota(user.id, "audit");
    if (!quotaCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: quotaCheck.message, remaining: 0, category: quotaCheck.reason }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const ctx = await getUserContext(supabase, user.id);
    const contextStr = formatContextForAI(ctx, CONTEXT_PRESETS.linkedinAudit);

    // Build screenshot content array for multimodal
    const contentParts: any[] = [];
    const screenshots = body.screenshots || [];
    for (const s of screenshots) {
      if (s.url) {
        contentParts.push({ type: "image_url", image_url: { url: s.url } });
      }
    }

    const systemPrompt = `${LINKEDIN_PRINCIPLES}

Tu es experte en optimisation de profils LinkedIn pour des solopreneuses créatives et engagées (mode, artisanat, bien-être, design, coaching).

DONNÉES DE L'AUDIT :
- URL profil : "${body.profileUrl || "non fourni"}"
- Objectif principal : ${body.objective || "non précisé"}
- Rythme actuel : ${body.currentRhythm || "non précisé"}
- Vues moyennes : ${body.avgViews || "non précisé"}
- Nombre de connexions : ${body.connectionsCount || "non précisé"}
- Type de connexions : ${JSON.stringify(body.connectionTypes || [])}
- Politique d'acceptation : ${body.acceptancePolicy || "non précisé"}
- Demandes proactives : ${body.proactiveRequests || "non précisé"}
- Recommandations : ${body.recommendationsCount || "non précisé"}
- Type de contenu : ${JSON.stringify(body.contentTypes || [])}
- Type d'engagement : ${body.engagementType || "non précisé"}
- Style d'accroche : ${body.accrochestyle || "non précisé"}
- Recyclage cross-canal : ${body.recycling || "non précisé"}
- Organisation publication : ${body.publicationOrg || "non précisé"}
- Demandes entrantes : ${body.inboundRequests || "non précisé"}

${contextStr}

ANALYSE les screenshots et les réponses. Pour chaque section, donne un score et des recommandations.

SPÉCIFICITÉS LINKEDIN :
- Le titre est le champ le plus important (apparaît partout)
- La section À propos : seules les 3 premières lignes sont visibles sans cliquer "voir plus"
- Le profil LinkedIn EST la landing page pour les prospects B2B
- L'engagement (commenter chez les autres) pèse autant que publier
- Les carrousels PDF ont un engagement 3x supérieur aux posts texte
- Le seuil symbolique est 500 connexions (apparaît comme "500+")
- Les recommandations sont de la preuve sociale ultra-puissante en B2B
- Le mode Créateur donne accès aux hashtags de suivi

TON : direct, bienveillant, actionnable. Pas de jargon LinkedIn.

Réponds UNIQUEMENT en JSON sans backticks :
{
  "score_global": 45,
  "sections": {
    "profil": {
      "score": 52,
      "elements": [
        {
          "name": "Photo de profil",
          "score": 8,
          "max_score": 10,
          "status": "good",
          "feedback": "...",
          "recommendation": "..."
        }
      ]
    },
    "contenu": {
      "score": 38,
      "elements": [...]
    },
    "strategie": {
      "score": 41,
      "elements": [...]
    },
    "reseau": {
      "score": 49,
      "elements": [...]
    }
  },
  "top_5_priorities": [
    {
      "rank": 1,
      "title": "...",
      "impact": "high",
      "why": "...",
      "action_label": "...",
      "action_route": "/linkedin/profil"
    }
  ]
}`;

    const userContent: any[] = [
      { type: "text", text: "Analyse mon profil LinkedIn en détail avec les screenshots fournis et les données ci-dessus." },
      ...contentParts,
    ];

    // Note: Anthropic doesn't support image_url in the same way as OpenAI
    // For multimodal with screenshots, we include image data in message content
    const content = await callAnthropic({
      model: "claude-sonnet-4-5-20250929",
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.7,
    });

    await logUsage(user.id, "audit", "audit_linkedin");

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("linkedin-audit-ai error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
