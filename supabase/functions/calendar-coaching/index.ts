import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getUserContext, formatContextForAI, buildIdentityBlock } from "../_shared/user-context.ts";
import { WOW_IDEA_EXAMPLES } from "../_shared/copywriting-prompts.ts";
import { callAnthropicToolSimple, getModelForAction, type AnthropicTool, type UsageSink } from "../_shared/anthropic.ts";

// Tool forcé (chantier éradication parse texte, 26/07) : JSON garanti.
const PLANNING_TOOL: AnthropicTool = {
  name: "rendre_planning_semaine",
  description: "Renvoie le planning de la semaine, le fil rouge et le conseil.",
  input_schema: {
    type: "object",
    properties: {
      planning: {
        type: "array",
        items: {
          type: "object",
          properties: {
            day: { type: "string" },
            pillar: { type: "string" },
            subject: { type: "string" },
            format: { type: "string" },
            hook_idea: { type: "string" },
            objective: { type: "string" },
          },
          required: ["day", "subject", "format"],
        },
      },
      week_theme: { type: "string" },
      tip: { type: "string" },
    },
    required: ["planning", "week_theme", "tip"],
  },
};
import { CORE_PRINCIPLES } from "../_shared/copywriting-prompts.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";

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

    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { posts_per_week, context_week, mix_or_focus, mode, existing_posts, workspace_id: bodyWorkspaceId } = await req.json();

    const sbGuard = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const membership = await assertWorkspaceMembership(sbGuard, user.id, bodyWorkspaceId);
    if (!membership.ok) {
      console.warn("[workspace-guard] denied", { userId: user.id, workspaceId: bodyWorkspaceId });
      return workspaceDeniedResponse(corsHeaders);
    }

    // Get workspace
    const { data: wsMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();
    const workspaceId = bodyWorkspaceId || wsMember?.workspace_id;

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

    let completeModeBlock = "";
    if (mode === "complete" && existing_posts?.length > 0) {
      const existingStr = existing_posts.map((p: any) =>
        `- ${p.date} : "${p.theme}" (${p.format || "post"}, ${p.canal}, objectif: ${p.objectif || "non défini"})`
      ).join("\n");
      completeModeBlock = `
═══════════════════════════════════════
MODE COMPLÉMENT — POSTS DÉJÀ PRÉVUS PAR L'UTILISATRICE
═══════════════════════════════════════
${existingStr}

CONSIGNES SPÉCIFIQUES AU MODE COMPLÉMENT :
- NE PAS reproposer les sujets déjà prévus ci-dessus
- ANALYSER les objectifs déjà couverts et COMPLÉTER les manques
  (si tout est "visibilité", propose du "confiance" ou "vente")
- ANALYSER les formats déjà prévus et VARIER
  (si tout est des posts, propose un carrousel ou un reel)
- ANALYSER les canaux et proposer des compléments sur les canaux peu représentés
- Les suggestions doivent S'ARTICULER avec les posts existants :
  créer une cohérence narrative sur la semaine
- Tu ne proposes QUE ${posts_per_week} posts supplémentaires, pas plus
`;
    }

    const recentPostsStr = recentPosts.length > 0
      ? recentPosts.map((p: any) => `- ${p.theme} (${p.format || "post"})`).join("\n")
      : "Aucun post récent.";

    const systemPrompt = `${buildIdentityBlock(ctx.profile, "directrice éditoriale senior")} Tu planifies des semaines de contenu STRATÉGIQUES et ORIGINALES.
Tu ne dis JAMAIS de gros mots, de jurons ni de langage vulgaire. Tu restes courtois·e et professionnel·le.

${CORE_PRINCIPLES}

CONTEXTE BRANDING :
${brandingContext}

POSTS DÉJÀ PLANIFIÉS CETTE SEMAINE :
${weekPostsStr}
${completeModeBlock}
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
- TEST DU NOM ÉCHANGEABLE : remplace mentalement l'utilisatrice par une concurrente du même métier — si le sujet tient encore tel quel, il est trop générique, change.
- AUCUN chiffre inventé dans les sujets ou accroches ("j'ai analysé 50 comptes", "80% des…") : un chiffre n'apparaît que s'il vient du contexte branding.
- Pense en termes de CONVERSATION : qu'est-ce qui ferait réagir la cible en story ?

INTERDIT (éliminatoire) :
❌ "X tips/astuces pour…"
❌ "Comment faire pour…"
❌ "Les erreurs à éviter"
❌ "Les tendances 202X"
❌ Tout sujet qu'on trouverait en tapant 2 mots sur Google
❌ Sujet sans angle ni point de vue

${WOW_IDEA_EXAMPLES}

RÈGLE D'OR — ANCRAGE MÉTIER : les sujets parlent du MÉTIER de l'utilisatrice (sa matière, ses clientes, ses gestes), JAMAIS de communication, d'engagement, d'algorithmes ou de « contenu » — SAUF si la communication EST son métier. Un sujet qui marcherait pour n'importe quel autre secteur est invalide.

CONVICTIONS VÉCUES : si le contexte branding contient un bloc CONVICTIONS VÉCUES, AU MOINS 1 sujet de la semaine doit en partir explicitement (c'est sa matière la plus impossible à copier).

DIVERSITÉ : MAXIMUM 1 sujet sur le prix/tarif dans la semaine. Les sujets couvrent des territoires différents du métier (technique/matière, relation client, coulisses, vision, transmission…).

═══════════════════════════════════════
ACCROCHES (hook_idea)
═══════════════════════════════════════
- C'est le TEXTE EXACT qui apparaîtra en première ligne du post — pas un titre, pas un résumé
- Max 20 mots. Ton oral. Comme un message vocal à une amie.
- Techniques (des STRUCTURES, pas des phrases à recopier) : confession datée, chiffre RÉEL du contexte (jamais inventé), affirmation qui coûte à assumer, question que la cible se pose en secret, scène sensorielle du métier.
- ⚠ ANTI-FUITE : n'importe JAMAIS un thème marketing/réseaux (likes, audience, engagement, bio) dans l'accroche — tout vient du MÉTIER et du contexte de l'utilisatrice.
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

    const usage: UsageSink = {};
    const parsed: any = await callAnthropicToolSimple(
      getModelForAction("coaching"),
      systemPrompt,
      `Planifie ${posts_per_week} posts pour ma semaine. Contexte : ${context_week || "semaine normale"}. Approche : ${mix_or_focus}.\n\nRappel : chaque sujet doit avoir un angle Nowadays précis, être hyper-spécifique à mon métier, et l'accroche doit être une VRAIE première ligne de post (max 20 mots, ton oral, percutante).`,
      PLANNING_TOOL,
      0.9,
      4096,
      usage,
      120_000
    );

    // Sonde de singularité (télémétrie, jamais bloquante) — même grille que
    // content-coaching pour comparer les deux moteurs dans les logs.
    try {
      const plan = Array.isArray((parsed as any)?.planning) ? (parsed as any).planning : [];
      if (plan.length > 0) {
        const GENERIC = [
          /\b(les|top)\s?\d+\s?(erreurs|astuces|conseils|raisons|tips|secrets)/i,
          /la v[ée]rit[ée] sur/i, /ce que personne ne (dit|vous dit|te dit)/i,
          /le secret (de|pour|derri[èe]re)/i, /tendances 20\d\d/i,
          /\b(engagement|algorithme|ta bio|ton audience|likes)\b/i,
        ];
        const priceRe = /\b(prix|tarif|co[ûu]te|cher|€)\b/i;
        const rows = plan.map((x: any) => `${x?.subject || ""} ${x?.hook_idea || ""}`);
        const generic = rows.filter((t: string) => GENERIC.some((re) => re.test(t))).length;
        const price = rows.filter((t: string) => priceRe.test(t)).length;
        console.log("[sonde-singularite]", JSON.stringify({ module: "calendar", generic, price, total: plan.length }));
        if (generic >= 2) console.warn("[sonde-singularite] ⚠ semaine à dominante générique", { userId: user.id, generic });
      }
    } catch (sondeErr) {
      console.warn("[sonde-singularite] erreur télémétrie calendar", sondeErr);
    }

    await logUsage(user.id, "coach", "calendar_coaching", usage.total_tokens, usage.model, workspaceId || undefined);

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
