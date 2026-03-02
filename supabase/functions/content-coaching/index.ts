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

    // Map raw IDs to human-readable labels for better AI output
    const OBJECTIF_LABELS: Record<string, string> = {
      inspirer: "Inspirer son audience",
      eduquer: "Éduquer / apporter de la valeur",
      vendre: "Vendre / convertir",
      creer_du_lien: "Créer du lien / engager la communauté",
    };
    const FORMAT_LABELS: Record<string, string> = {
      post_texte: "Post texte (légende Instagram ou post LinkedIn)",
      carrousel: "Carrousel Instagram",
      reel: "Reel vidéo court",
      story: "Story Instagram",
    };
    const TON_LABELS: Record<string, string> = {
      intime: "Intime et personnel (vulnérabilité, authenticité)",
      expert: "Expert et informatif (crédibilité, pédagogie)",
      engage: "Engagé et provocateur (opinion forte, prise de position)",
    };

    const objectifLabel = OBJECTIF_LABELS[objectif] || objectif;
    const formatLabel = FORMAT_LABELS[format] || format;
    const tonLabel = TON_LABELS[ton_envie] || ton_envie;

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

RÉPONSES DE L'UTILISATRICE :
- Objectif : ${objectifLabel}
- Sujet : ${sujet || "PAS DE SUJET → l'utilisatrice a besoin d'idées concrètes"}
- Format préféré : ${formatLabel}
- Ton souhaité : ${tonLabel}

${!sujet ? `L'UTILISATRICE N'A PAS DE SUJET :
- Propose 3 idées ULTRA CONCRÈTES basées sur ses piliers de contenu
- ÉVITE les sujets déjà traités dans les derniers posts
- Chaque idée doit être un angle précis, pas un thème vague (ex: "Les 3 erreurs que je vois sur 90% des sites de photographes" plutôt que "Parler de ton expertise")` : ""}

FORMATS DISPONIBLES ET ROUTES :
- Post texte → /instagram/creer
- Carrousel → /instagram/carousel
- Reel → /instagram/reels
- Story → /instagram/stories

Le format recommandé DOIT correspondre au format choisi par l'utilisatrice (${formatLabel}), sauf si tu as une raison TRÈS forte de proposer autre chose (dans ce cas, explique pourquoi).

Retourne UNIQUEMENT un JSON :
{
  "recommended_subject": "Le sujet recommandé — CONCRET et SPÉCIFIQUE au métier de l'utilisatrice",
  "subject_alternatives": ["2 alternatives de sujets tout aussi concrètes"],
  "recommended_format": "${formatLabel}",
  "format_reason": "Pourquoi ce format en 1 phrase courte et pertinente",
  "redirect_route": "la route correspondant au format",
  "redirect_params": { "subject": "le sujet choisi", "objective": "${objectif}" },
  "quick_brief": "Un mini-brief de 2-3 phrases : l'angle exact, le ton à adopter (${tonLabel}), la structure suggérée. Sois CONCRÈTE, pas générique."
}

QUALITÉ DU BRIEF :
- Le quick_brief doit donner envie de créer, pas être une instruction froide
- Utilise le vocabulaire du métier de l'utilisatrice
- INTERDIT : "dans un monde où", "et si je te disais", "spoiler alert", formules IA génériques
- Les sujets doivent refléter son positionnement UNIQUE, pas des conseils génériques applicables à n'importe qui

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
