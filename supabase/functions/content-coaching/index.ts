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
    const { objectif, sujet, canal, format, content_type, ton_envie } = answers || {};

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
      carrousel: "Carrousel",
      reel: "Reel vidéo court",
      story: "Story Instagram",
    };
    const CANAL_LABELS: Record<string, string> = {
      instagram: "Instagram",
      linkedin: "LinkedIn",
    };
    const TON_LABELS: Record<string, string> = {
      intime: "Intime et personnel (vulnérabilité, authenticité)",
      expert: "Expert et informatif (crédibilité, pédagogie)",
      engage: "Engagé et provocateur (opinion forte, prise de position)",
    };
    const CONTENT_TYPE_LABELS: Record<string, string> = {
      // Legacy content types
      mythe_realite: "Mythe vs Réalité",
      liste_tips: "Liste / Tips",
      tutoriel: "Tutoriel pas à pas",
      avant_apres: "Avant / Après",
      storytelling: "Storytelling",
      checklist: "Checklist",
      opinion: "Opinion / Prise de position",
      conseil: "Conseil actionnable",
      temoignage: "Témoignage client",
      coulisses: "Coulisses",
      lecon_apprise: "Leçon apprise",
      tutoriel_rapide: "Tutoriel rapide",
      behind_scenes: "Behind the scenes",
      trend: "Tendance / Trend",
      faq: "FAQ / Question récurrente",
      transition: "Transition avant/après",
      sondage: "Sondage / Quiz",
      teasing: "Teasing",
      qna: "Q&A / Boîte à questions",
      quotidien: "Tranche de vie",
      // Angles éditoriaux
      "enquete": "Enquête / Décryptage (analyser un phénomène avec un angle inédit)",
      "test": "Test grandeur nature (tester un conseil et donner son verdict)",
      "coup-de-gueule": "Coup de gueule (prise de position sur une frustration partagée)",
      "mythe": "Mythe à déconstruire (démonter une croyance répandue)",
      "histoire-cliente": "Histoire cliente (illustrer un blocage commun via un cas réel, social proof)",
      "surf-actu": "Surf sur l'actu (rebondir sur une actualité avec ton analyse)",
      "regard-philo": "Regard philosophique / sociétal (prendre de la hauteur, France Culture)",
      "conseil-contre-intuitif": "Conseil contre-intuitif (aller à contre-courant des conseils mainstream)",
      "before-after": "Before / After (montrer une évolution concrète pour inspirer)",
      "identification": "Identification / Quotidien (contenus où l'audience se reconnaît)",
      "build-in-public": "Build in public (partager objectifs, échecs, pivots en transparence)",
      "analyse-profondeur": "Analyse en profondeur (décortiquer un sujet avec des données)",
    };

    const objectifLabel = OBJECTIF_LABELS[objectif] || objectif;
    const formatLabel = FORMAT_LABELS[format] || format;
    const canalLabel = CANAL_LABELS[canal] || canal || "Instagram";
    const tonLabel = TON_LABELS[ton_envie] || ton_envie;
    const contentTypeLabel = content_type ? (CONTENT_TYPE_LABELS[content_type] || content_type) : null;

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

    const systemPrompt = `Tu es Laetitia Mattioli, fondatrice de Nowadays Agency, experte en communication éthique pour solopreneuses créatives. Tu aides une utilisatrice qui ne sait pas quoi poster à trouver THE idée qui la fera vibrer.

CONTEXTE BRANDING DE L'UTILISATRICE :
${contextText}

PILIERS DE CONTENU : ${pillars}

DERNIERS POSTS (ne pas répéter ces sujets) :
${recentPosts}

RÉPONSES DE L'UTILISATRICE :
- Canal : ${canalLabel}
- Objectif : ${objectifLabel}
- Sujet : ${sujet || "PAS DE SUJET → elle a besoin d'idées concrètes"}
- Format préféré : ${formatLabel}${contentTypeLabel ? `\n- Type de contenu : ${contentTypeLabel}` : ""}
- Ton souhaité : ${tonLabel}

═══════════════════════════════════════════════════
TA MÉTHODE POUR TROUVER DES IDÉES (à suivre étape par étape)
═══════════════════════════════════════════════════

ÉTAPE 1 — PENSE AUX 13 ANGLES ÉDITORIAUX POSSIBLES :
1. Enquête/décryptage : analyser un phénomène avec un angle inédit ("et personne n'en parle")
2. Test grandeur nature : tester un conseil qu'on voit partout et donner ton verdict ("j'ai testé pour vous")
3. Coup de gueule engagé : taper sur une frustration partagée ("j'en peux plus que...")
4. Mythe à déconstruire : démonter une croyance répandue ("on t'a menti")
5. Storytelling personnel : raconter une galère/déclic + leçon ("ce jour-là, j'ai compris")
6. Histoire cliente : illustrer un blocage commun via un cas réel (social proof déguisé)
7. Surf sur l'actu : rebondir sur une news/tendance pour partager ton analyse
8. Regard philosophique : prendre de la hauteur, côté France Culture
9. Conseil contre-intuitif : aller à contre-courant ("et si on faisait l'inverse ?")
10. Before/after : montrer une évolution concrète pour inspirer
11. Identification/quotidien : situations où l'audience se reconnaît instantanément
12. Build in public : partager objectifs, échecs, pivots en transparence
13. Analyses en profondeur : décortiquer un sujet avec des points de vue fouillés

ÉTAPE 2 — FILTRE SELON L'OBJECTIF DE L'UTILISATRICE :
- Visibilité → privilégie : coup de gueule, mythe, conseil contre-intuitif, surf actu, identification
- Engagement → privilégie : storytelling, build in public, regard philo, identification, test
- Vente → privilégie : histoire cliente, before/after, étude de cas
- Crédibilité → privilégie : enquête, analyse, regard philo, test

ÉTAPE 3 — POUR CHAQUE IDÉE, VÉRIFIE CES 3 CRITÈRES :
✅ MONNAIE SOCIALE : est-ce que l'audience voudrait PARTAGER ce contenu ? (parce qu'il exprime ce qu'elle pense sans oser le dire, parce qu'il la fait bien paraître, parce qu'il aide quelqu'un qu'elle connaît)
✅ SPÉCIFICITÉ : est-ce que ce sujet est UNIQUE au métier/positionnement de l'utilisatrice ? (pas un conseil générique applicable à tout le monde)
✅ TENSION : est-ce qu'il y a un élément de surprise, de contradiction, de révélation qui donne envie de lire ?

ÉTAPE 4 — ÉCRIS UN HOOK IRRÉSISTIBLE POUR CHAQUE IDÉE :
Le hook c'est LA phrase qui décide si on lit ou pas. Il doit :
- Faire moins de 15 mots
- Stopper le scroll (curiosité, identification, provocation douce, ou promesse concrète)
- Fonctionner seul, sans contexte
Types de hooks selon l'objectif :
- Visibilité : polarisant, contre-intuitif, frustration ("J'en peux plus que..."), ennemi commun
- Engagement : suspense, émotion, confession ("J'avoue, j'ai longtemps cru que...")
- Vente : témoignage, avant/après, bénéfice concret
- Crédibilité : statistique choc, preuve sociale

═══════════════════════════════════════════════════
RÈGLES DE QUALITÉ
═══════════════════════════════════════════════════

- Génère exactement 6 idées, chacune avec un ANGLE ÉDITORIAL DIFFÉRENT (pas 6 variations du même angle)
- ${sujet ? `Toutes les idées doivent être liées au sujet "${sujet}" mais avec des angles RADICALEMENT différents` : "Les idées doivent couvrir AU MOINS 3 objectifs différents (visibilité, engagement, vente, crédibilité)"}
- ${contentTypeLabel ? `Chaque idée doit être structurée selon le type "${contentTypeLabel}" (ex: si "Mythe vs Réalité", chaque sujet est formulé comme un mythe à déconstruire)` : ""}
- Chaque sujet doit être si CONCRET qu'on peut commencer à écrire immédiatement (pas "Parler de ton expertise" mais "Les 3 erreurs que je vois sur 90% des sites de photographes")
- Le hook doit être une VRAIE accroche prête à poster, pas un titre de blog
- Utilise le vocabulaire du MÉTIER de l'utilisatrice (pas du jargon marketing)
- ÉVITE les sujets déjà traités dans les derniers posts
- INTERDIT : "dans un monde où", "et si je te disais", "spoiler alert", "tu ne devineras jamais", toute formule IA générique
- Tutoiement, ton direct et complice

ROUTES POUR LA REDIRECTION :
Instagram : Post → /creer, Carrousel → /creer?format=carousel, Reel → /creer?format=reel, Story → /creer?format=story
LinkedIn : Post → /creer?format=linkedin, Carrousel → /creer?format=linkedin

Le format recommandé DOIT correspondre au format choisi (${formatLabel}), sauf raison TRÈS forte (expliquée).

Retourne UNIQUEMENT ce JSON (pas de texte avant ou après, pas de backticks) :
{
  "ideas": [
    {
      "subject": "Le sujet concret et spécifique",
      "hook": "L'accroche prête à poster (max 15 mots)",
      "angle": "L'angle éditorial utilisé (ex: coup de gueule, mythe, storytelling...)",
      "objective_tag": "visibilite|engagement|vente|credibilite",
      "why_it_works": "1 phrase : pourquoi ce sujet va résonner avec SON audience spécifiquement",
      "brief": "2-3 phrases : l'angle exact, la structure suggérée, le ton. Assez concret pour commencer à écrire."
    }
  ],
  "recommended_format": "${formatLabel}",
  "format_reason": "Pourquoi ce format en 1 phrase courte",
  "redirect_route": "la route correspondant au format et canal choisis"
}`;

    const raw = await callAnthropicSimple(
      getModelForAction("coaching"),
      systemPrompt + "\n\n" + ANTI_SLOP,
      "Génère 6 idées de contenu ultra-concrètes avec un hook irrésistible pour chaque.",
      0.7,
      3000,
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

    // Backwards compatibility: if the front expects the old format
    if (result.ideas && !result.recommended_subject) {
      result.recommended_subject = result.ideas[0]?.subject || "";
      result.subject_alternatives = result.ideas.slice(1).map((i: any) => i.subject);
      result.quick_brief = result.ideas[0]?.brief || "";
      result.redirect_params = {
        subject: result.ideas[0]?.subject || "",
        objective: objectif,
      };
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
