import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getUserContext, formatContextForAI } from "../_shared/user-context.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Non authentifié·e");

    const { posts_per_week, context_week, mix_or_focus } = await req.json();

    // Get workspace
    const { data: wsMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();
    const workspaceId = wsMember?.workspace_id;
    const col = workspaceId ? "workspace_id" : "user_id";
    const val = workspaceId || user.id;

    // Fetch context + calendar data in parallel
    const [ctx, weekPostsRes, recentPostsRes] = await Promise.all([
      getUserContext(supabase, user.id, workspaceId),
      supabase
        .from("calendar_posts")
        .select("theme, format, date, objectif")
        .eq(col, val)
        .gte("date", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .lte("date", new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .order("date", { ascending: true }),
      supabase
        .from("calendar_posts")
        .select("theme, format, objectif")
        .eq(col, val)
        .eq("status", "published")
        .order("date", { ascending: false })
        .limit(10),
    ]);

    const weekPosts = weekPostsRes.data || [];
    const recentPosts = recentPostsRes.data || [];
    const brandingContext = formatContextForAI(ctx, { includeEditorial: true, includeProfile: true });

    const weekPostsStr = weekPosts.length > 0
      ? weekPosts.map((p: any) => `- ${p.date} : ${p.theme} (${p.format || "post"})`).join("\n")
      : "Aucun post planifié cette semaine.";

    const recentPostsStr = recentPosts.length > 0
      ? recentPosts.map((p: any) => `- ${p.theme} (${p.format || "post"})`).join("\n")
      : "Aucun post récent.";

    const systemPrompt = `Tu es une coach en stratégie de contenu pour solopreneuses créatives. Planifie la semaine de contenu de l'utilisatrice.

CONTEXTE BRANDING :
${brandingContext}

POSTS DÉJÀ PLANIFIÉS CETTE SEMAINE :
${weekPostsStr}

10 DERNIERS POSTS PUBLIÉS :
${recentPostsStr}

PRÉFÉRENCES :
- Nombre de posts souhaité : ${posts_per_week}
- Contexte de la semaine : ${context_week || "Rien de spécial"}
- Approche : ${mix_or_focus === "focus" ? "Focus sur un seul pilier" : "Mix varié de piliers"}

RÈGLES :
- Varie les piliers de contenu si "mix", concentre sur un seul si "focus"
- Alterne les formats (post, carousel, reel) pour ne pas lasser
- Ne propose PAS un sujet déjà traité dans les 10 derniers posts
- Chaque idée doit être CONCRÈTE et actionnable, pas vague
- Si un lancement est mentionné, intègre du contenu de teasing/vente
- Utilise le tutoiement et l'écriture inclusive (point médian)

Retourne UNIQUEMENT un JSON valide :
{
  "planning": [
    {
      "day": "Lundi",
      "pillar": "nom du pilier",
      "subject": "sujet concret",
      "format": "post | carousel | reel | story",
      "hook_idea": "idée d'accroche en 1 phrase",
      "objective": "inspirer | eduquer | vendre | lien"
    }
  ],
  "week_theme": "Le fil rouge de la semaine en 1 phrase",
  "tip": "Un conseil stratégique pour cette semaine"
}`;

    const raw = await callAnthropicSimple(
      getModelForAction("coaching_light"),
      systemPrompt + "\n\n" + ANTI_SLOP,
      `Planifie ${posts_per_week} posts pour ma semaine. Contexte : ${context_week || "semaine normale"}. Approche : ${mix_or_focus}.`,
      0.8,
      4096
    );

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("Format de réponse inattendu");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("calendar-coaching error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
