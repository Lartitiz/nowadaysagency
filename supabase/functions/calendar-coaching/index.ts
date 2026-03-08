import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getUserContext, formatContextForAI, buildIdentityBlock } from "../_shared/user-context.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { ANTI_SLOP, CORE_PRINCIPLES } from "../_shared/copywriting-prompts.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const quota = await checkQuota(user.id, "coach", workspaceId || undefined);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const systemPrompt = `${buildIdentityBlock(ctx.profile, "directrice éditoriale senior")} Tu planifies des semaines de contenu STRATÉGIQUES et ORIGINALES.

${CORE_PRINCIPLES}

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

═══════════════════════════════════════
ANGLES ÉDITORIAUX NOWADAYS — UTILISE-LES
═══════════════════════════════════════
Chaque post DOIT utiliser un de ces 13 angles. C'est ce qui fait la différence entre du contenu fade et du contenu qu'on sauvegarde :

1. Enquête / Décryptage — "J'ai analysé 50 comptes…", data, stats, observation terrain
2. Test grandeur nature — "J'ai testé X pendant 30 jours", résultat brut et honnête
3. Coup de gueule — Prise de position tranchée, "Stop avec…", "Ce que personne n'ose dire"
4. Mythe à déconstruire — "Non, poster tous les jours ne sert à rien", renverser une croyance
5. Storytelling + leçon — Moment vécu personnel → enseignement universel
6. Histoire cliente / Cas réel — Transformation concrète, avant/après, preuve sociale
7. Surf sur l'actu — Rebond sur une tendance, une news, un événement culturel
8. Regard philo / sociétal — Prendre du recul, questionner un phénomène de fond
9. Conseil contre-intuitif — "Arrête de chercher de nouveaux clients", inverser la logique
10. Before / After — Montrer l'évolution, le processus, la preuve par l'image
11. Identification / Quotidien — "Ce moment où…", scène de vie pro que tout le monde connaît
12. Build in public — Montrer les coulisses, la construction, les décisions en temps réel
13. Analyse en profondeur — Zoom expert sur UN concept, UNE mécanique, UNE méthode

═══════════════════════════════════════
RÈGLES DE PROFONDEUR (NON NÉGOCIABLES)
═══════════════════════════════════════
- Chaque sujet doit être HYPER-SPÉCIFIQUE au métier de l'utilisatrice — pas transposable à n'importe quel entrepreneur
- Le sujet doit contenir une TENSION : un paradoxe, un point de vue, une surprise, un vécu
- Pose-toi la question : "Est-ce qu'une IA générique aurait proposé ce sujet ?" → si oui, change
- Pense en termes de CONVERSATION : qu'est-ce qui ferait réagir la cible en story ?

INTERDIT (éliminatoire) :
❌ "X tips/astuces pour…"
❌ "Comment faire pour…"
❌ "Les erreurs à éviter"
❌ "Les tendances 202X"
❌ Tout sujet qu'on trouverait en tapant 2 mots sur Google
❌ Sujet sans angle ni point de vue

EXEMPLES WAHOU vs FADE :
✅ "Le jour où une cliente m'a dit 'c'est trop cher' — et pourquoi elle avait raison" (storytelling + leçon)
✅ "J'ai analysé les 20 posts les plus sauvegardés de ma niche : 80% n'avaient rien de visuel" (enquête)
✅ "Arrête de 'créer du contenu de valeur'. Ton audience veut qu'on lui parle, pas qu'on lui fasse cours" (contre-intuitif)
✅ "Pourquoi j'ai supprimé mon offre signature à 2000€ pour la remplacer par rien" (coup de gueule / build in public)
❌ "3 astuces pour augmenter ton engagement"
❌ "Comment créer un carrousel efficace"
❌ "Les tendances Instagram 2025"

═══════════════════════════════════════
ACCROCHES (hook_idea)
═══════════════════════════════════════
- C'est le TEXTE EXACT qui apparaîtra en première ligne du post — pas un titre, pas un résumé
- Max 20 mots. Ton oral. Comme un message vocal à une amie.
- Techniques : confession, chiffre choc, affirmation provocante, question dérangeante, scène visuelle
- ✅ "J'ai perdu 3 clientes le même soir. C'est la meilleure chose qui me soit arrivée."
- ✅ "Ton audience s'en fout de ton expertise. Ce qu'elle veut c'est savoir que t'as galéré aussi."
- ✅ "12 likes. 47 sauvegardes. 8 DM. Mais toi tu vois que les 12 likes."
- ❌ "Mes conseils pour ta bio Instagram"
- ❌ "Découvrez comment booster votre engagement"

RÉPARTITION DES OBJECTIFS :
- ~40% visibilité (inspirer) + ~40% confiance (eduquer/lien) + ~20% vente (vendre)
- Si lancement mentionné, augmente vente à 40% max

FORMATS :
- Alterne les formats (post, carousel, reel, story, newsletter) pour créer du rythme
- Le format doit SERVIR le sujet : carousel pour du contenu riche/structuré, reel pour du dynamique/émotionnel, story pour de l'intime/interactif

Retourne UNIQUEMENT un JSON valide :
{
  "planning": [
    {
      "day": "Lundi",
      "pillar": "nom du pilier",
      "subject": "sujet concret avec angle original, tension, et spécificité métier",
      "format": "post | carousel | reel | story | newsletter",
      "hook_idea": "accroche percutante max 20 mots, ton oral, prête à poster",
      "objective": "inspirer | eduquer | vendre | lien"
    }
  ],
  "week_theme": "Le fil rouge de la semaine en 1 phrase",
  "tip": "Un conseil stratégique concret pour cette semaine"
}`;

    const raw = await callAnthropicSimple(
      getModelForAction("coaching"),
      systemPrompt + "\n\n" + ANTI_SLOP,
      `Planifie ${posts_per_week} posts pour ma semaine. Contexte : ${context_week || "semaine normale"}. Approche : ${mix_or_focus}.\n\nRappel : chaque sujet doit avoir un angle Nowadays précis, être hyper-spécifique à mon métier, et l'accroche doit être une VRAIE première ligne de post (max 20 mots, ton oral, percutante).`,
      0.9,
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

    await logUsage(user.id, "coach", "calendar_coaching", undefined, undefined, workspaceId || undefined);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("calendar-coaching error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
