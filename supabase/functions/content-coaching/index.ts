import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req); const cors = corsHeaders;
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quota = await checkQuota(user.id, "suggestion");
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { answers, workspace_id } = body;
    const { objectif, sujet, format, ton_envie } = answers || {};

    if (!objectif || !format || !ton_envie) {
      return new Response(JSON.stringify({ error: "Réponses incomplètes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const filterCol = workspace_id ? "workspace_id" : "user_id";
    const filterVal = workspace_id || user.id;

    // Fetch context, recent posts, and strategy in parallel
    const [ctx, recentPostsRes, strategyRes] = await Promise.all([
      getUserContext(sbService, user.id, workspace_id),
      sbService.from("calendar_posts")
        .select("theme, date, canal")
        .eq(filterCol, filterVal)
        .order("date", { ascending: false })
        .limit(5),
      sbService.from("brand_strategy")
        .select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3")
        .eq(filterCol, filterVal)
        .maybeSingle(),
    ]);

    const contextText = formatContextForAI(ctx, CONTEXT_PRESETS.content);

    const recentPosts = (recentPostsRes.data || [])
      .map((p: any) => `- ${p.theme} (${p.canal}, ${p.date})`)
      .join("\n") || "Aucun post récent";

    const strategy = strategyRes.data;
    const pillars = strategy
      ? [strategy.pillar_major, strategy.pillar_minor_1, strategy.pillar_minor_2, strategy.pillar_minor_3]
          .filter(Boolean).join(", ")
      : "Non définis";

    const systemPrompt = `Tu es une coach en création de contenu pour solopreneuses créatives. L'utilisatrice ne sait pas quoi poster. À partir de ses réponses et de son branding, propose-lui un plan d'action.

CONTEXTE BRANDING :
${contextText}

PILIERS DE CONTENU : ${pillars}

DERNIERS POSTS (pour ne pas répéter) :
${recentPosts}

RÉPONSES :
- Objectif : ${objectif}
- Sujet : ${sujet || "pas de sujet, l'utilisatrice a besoin d'idées"}
- Format préféré : ${format}
- Ton envie : ${ton_envie}

${!sujet ? "L'UTILISATRICE N'A PAS DE SUJET : propose 3 idées basées sur ses piliers de contenu en ÉVITANT les sujets déjà traités dans les derniers posts." : ""}

FORMATS DISPONIBLES ET ROUTES :
- Post texte → /instagram/creer
- Carrousel → /instagram/carousel
- Reel → /instagram/reels
- Story → /instagram/stories

Choisis la route qui correspond au format recommandé.

Retourne UNIQUEMENT un JSON :
{
  "recommended_subject": "Le sujet recommandé (concret et spécifique)",
  "subject_alternatives": ["2 alternatives de sujets"],
  "recommended_format": "Le format le plus adapté (Post texte, Carrousel, Reel ou Story)",
  "format_reason": "Pourquoi ce format en 1 phrase courte",
  "redirect_route": "/instagram/creer ou /instagram/carousel ou /instagram/reels ou /instagram/stories",
  "redirect_params": { "subject": "...", "objective": "..." },
  "quick_brief": "Un mini-brief de 2-3 phrases pour guider la création : angle, ton, structure suggérée"
}

Sois directe et concrète. Tutoiement. Pas de jargon.`;

    const raw = await callAnthropicSimple(
      getModelForAction("coaching_light"),
      systemPrompt + "\n\n" + ANTI_SLOP,
      "Génère le plan d'action contenu.",
      0.5,
      2000,
    );

    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON");
      result = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse content-coaching response:", raw);
      return new Response(JSON.stringify({ error: "Erreur lors de l'analyse. Réessaie." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logUsage(user.id, "suggestion", "content_coaching");
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("content-coaching error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
