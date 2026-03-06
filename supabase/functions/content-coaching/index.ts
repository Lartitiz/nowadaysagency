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

    if (!objectif || !ton_envie) {
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
      post: "Post texte (légende Instagram ou post LinkedIn)",
      carousel: "Carrousel",
      reel: "Reel vidéo court",
      story: "Story Instagram",
      // Rétrocompatibilité
      post_texte: "Post texte (légende Instagram ou post LinkedIn)",
      carrousel: "Carrousel",
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

    // Fetch context, recent posts, generated content, and strategy in parallel
    const [ctx, recentPostsRes, strategyRes, generatedRes] = await Promise.all([
      getUserContext(sbService, user.id, workspace_id),
      sbService.from("calendar_posts")
        .select("theme, accroche, date, canal, format")
        .eq(filterCol, filterVal)
        .order("date", { ascending: false })
        .limit(20),
      sbService.from("brand_strategy")
        .select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3")
        .eq(filterCol, filterVal)
        .maybeSingle(),
      sbService.from("generated_carousels" as any)
        .select("subject, hook_text, carousel_type, objective, created_at")
        .eq(filterCol === "workspace_id" ? "workspace_id" : "user_id", filterCol === "workspace_id" ? filterVal : user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const contextText = formatContextForAI(ctx, CONTEXT_PRESETS.content);

    const calendarPosts = (recentPostsRes.data || [])
      .map((p: any) => `- "${p.theme}"${p.accroche ? ` → accroche: "${p.accroche}"` : ""} (${p.canal}, ${p.format || "post"}, ${p.date})`)
      .join("\n");
    const generatedContent = (generatedRes.data || [])
      .map((g: any) => `- "${g.subject}"${g.hook_text ? ` → hook: "${g.hook_text}"` : ""} (${g.carousel_type}, ${g.objective || "?"})`)
      .join("\n");
    const recentPosts = [
      calendarPosts ? `Posts planifiés :\n${calendarPosts}` : "",
      generatedContent ? `Contenus générés :\n${generatedContent}` : "",
    ].filter(Boolean).join("\n\n") || "Aucun historique";

    const strategy = strategyRes.data;
    const pillars = strategy
      ? [strategy.pillar_major, strategy.pillar_minor_1, strategy.pillar_minor_2, strategy.pillar_minor_3]
          .filter(Boolean).join(", ")
      : "Non définis";

    // Current date for seasonal awareness
    const now = new Date();
    const months = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
    const currentMonth = months[now.getMonth()];
    const currentYear = now.getFullYear();
    const dayOfWeek = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"][now.getDay()];

    // Random creative seed to force variety between sessions
    const CREATIVE_SEEDS = [
      "Une idée doit utiliser une analogie avec la cuisine, le sport, ou le jardinage",
      "Une idée doit s'appuyer sur un biais cognitif précis (effet Dunning-Kruger, biais de survie, paradoxe du choix, etc.)",
      "Une idée doit faire un parallèle avec un film, une série ou un livre connu",
      "Une idée doit partir d'un chiffre ou d'une statistique concrète (même approximative)",
      "Une idée doit prendre le contre-pied EXACT d'un conseil mainstream dans le domaine de l'utilisatrice",
      "Une idée doit raconter un micro-moment du quotidien (pas une grande histoire, un détail précis)",
      "Une idée doit faire un parallèle inattendu avec un autre métier ou une autre industrie",
      "Une idée doit utiliser le format 'confession' ou 'j'avoue que...'",
      "Une idée doit poser une question que l'audience se pose en secret mais n'ose pas formuler",
      "Une idée doit comparer deux époques (avant/maintenant) sur un aspect du métier de l'utilisatrice",
      "Une idée doit décortiquer un mot ou un concept que tout le monde utilise sans le comprendre",
      "Une idée doit s'inspirer d'une tendance sociétale actuelle (slow life, dé-croissance, IA, etc.)",
    ];
    const seed1 = CREATIVE_SEEDS[Math.floor(Math.random() * CREATIVE_SEEDS.length)];
    let seed2 = CREATIVE_SEEDS[Math.floor(Math.random() * CREATIVE_SEEDS.length)];
    while (seed2 === seed1) seed2 = CREATIVE_SEEDS[Math.floor(Math.random() * CREATIVE_SEEDS.length)];

    // Random hook structures to force variety
    const HOOK_STRUCTURES = [
      "Question rhétorique qui pique : 'Pourquoi [paradoxe] ?'",
      "Confession : 'J'ai longtemps cru que [croyance]. Jusqu'à [déclic].'",
      "Chiffre choc : '[Stat]% des [cible] font [erreur]. Et personne n'en parle.'",
      "Contradiction : '[Conseil mainstream]. Sauf que c'est faux.'",
      "Micro-scène : 'Ce matin, en [action banale], j'ai réalisé que...'",
      "Liste-appât : 'Les 3 [trucs] que [les experts] ne disent jamais'",
      "Comparaison inattendue : '[Chose A] et [chose B] ont plus en commun qu'on croit'",
      "Interpellation directe : 'Tu fais probablement [erreur]. Voici pourquoi.'",
      "Polarisation douce : 'Il y a 2 types de [profession]. Lequel es-tu ?'",
      "Promesse-mystère : 'Le truc qui a changé [aspect] dans mon business. (C'est pas ce que tu crois.)'",
    ];
    const shuffledHooks = HOOK_STRUCTURES.sort(() => Math.random() - 0.5).slice(0, 3);

    const systemPrompt = `Tu es la meilleure directrice éditoriale du monde. Ton job : trouver THE idée de contenu qui fait dire "PUTAIN OUI, c'est exactement ça que je veux poster". Pas des idées tièdes. Pas des sujets génériques. Des angles qui surprennent, qui piquent, qui donnent envie de tout lâcher pour écrire.

CONTEXTE BRANDING DE L'UTILISATRICE :
${contextText}

PILIERS DE CONTENU : ${pillars}

DATE : ${dayOfWeek} ${now.getDate()} ${currentMonth} ${currentYear}
Pense aux événements, saisons, tendances du moment. ${currentMonth} rime avec quoi dans le secteur de l'utilisatrice ?

HISTORIQUE (NE PAS REPROPOSER ces sujets ni des variations proches) :
${recentPosts}

RÉPONSES DE L'UTILISATRICE :
- Canal : ${canalLabel}
- Objectif : ${objectifLabel}
- Sujet : ${sujet || "PAS DE SUJET → elle a besoin d'idées concrètes et surprenantes"}
- Format préféré : ${formatLabel}${contentTypeLabel ? `\n- Angle demandé : ${contentTypeLabel}` : ""}
- Ton souhaité : ${tonLabel}

═══════════════════════════════════════════════════
MÉTHODE POUR GÉNÉRER 3 IDÉES EXCEPTIONNELLES
═══════════════════════════════════════════════════

RÈGLE D'OR : chaque idée doit passer le "test du screenshot".
Si quelqu'un tombe dessus en scrollant, est-ce qu'elle fait une capture d'écran pour l'envoyer à une amie ?
Si non → l'idée n'est pas assez forte. Recommence.

ÉTAPE 1 — UTILISE 3 ANGLES ÉDITORIAUX DIFFÉRENTS (tous différents, obligatoire) :
Pioche parmi ces 13, en choisissant des angles VARIÉS :
1. Enquête/décryptage ("et personne n'en parle")
2. Test grandeur nature ("j'ai testé pour vous")
3. Coup de gueule engagé ("j'en peux plus que...")
4. Mythe à déconstruire ("on t'a menti")
5. Storytelling + leçon ("ce jour-là, j'ai compris")
6. Histoire cliente / cas réel (social proof déguisé)
7. Surf sur l'actu (rebondir sur une news/tendance actuelle)
8. Regard philosophique (prendre de la hauteur)
9. Conseil contre-intuitif ("et si on faisait l'inverse ?")
10. Before/after (évolution concrète)
11. Identification/quotidien (l'audience se reconnaît)
12. Build in public (coulisses, transparence)
13. Analyse en profondeur (data, décryptage)

ÉTAPE 2 — INJECTE DE LA CRÉATIVITÉ FORCÉE :
🎲 Contrainte créative 1 : ${seed1}
🎲 Contrainte créative 2 : ${seed2}
Intègre ces contraintes dans AU MOINS 1 des 3 idées. Ça force la surprise.

ÉTAPE 3 — ÉCRIS DES HOOKS QUI STOPPENT LE SCROLL :
Chaque idée utilise une STRUCTURE DE HOOK DIFFÉRENTE :
${shuffledHooks.map((h, i) => `Idée ${i + 1} → ${h}`).join("\n")}

INTERDIT pour les hooks : "Et si je te disais", "Dans un monde où", "Spoiler alert", "Tu ne devineras jamais", "Le secret de", "La clé c'est", toute formule IA générique.
Les hooks font max 15 mots. Ils fonctionnent SEULS, sans contexte.

ÉTAPE 4 — VÉRIFIE LA QUALITÉ :
Pour chaque idée, 3 tests obligatoires :
✅ TEST DU SCREENSHOT : est-ce que l'audience capture et envoie à une amie ?
✅ TEST DE SPÉCIFICITÉ : est-ce que cette idée ne PEUT exister QUE dans l'univers de cette utilisatrice ? (sinon → trop générique, recommence)
✅ TEST DE TENSION : y a-t-il un paradoxe, une surprise, une contradiction qui crée de la curiosité ?

${sujet ? `
TOUTES les idées sont liées au sujet "${sujet}" mais avec des ANGLES RADICALEMENT DIFFÉRENTS.
Ne fais pas 3 variations du même message. Chaque idée doit attaquer le sujet par un côté inattendu.
` : `
Les 3 idées doivent couvrir AU MOINS 2 objectifs différents parmi : visibilité, engagement, vente, crédibilité.
Les idées doivent toucher des FACETTES DIFFÉRENTES du métier/positionnement de l'utilisatrice.
`}

═══════════════════════════════════════════════════
EXEMPLES DE CE QUI EST WAHOU vs CE QUI EST FADE
═══════════════════════════════════════════════════

FADE ❌ : "3 erreurs de communication à éviter" → trop générique, on a lu ça 10 000 fois
WAHOU ✅ : "J'ai analysé 47 comptes de céramistes. 41 font la même erreur dans leur bio." → spécifique, data, curiosité

FADE ❌ : "Pourquoi il faut oser montrer ses valeurs" → tiède, pas de tension
WAHOU ✅ : "Le paradoxe du boulanger bio : plus son pain est bon, moins il sait le vendre." → analogie, paradoxe, identification

FADE ❌ : "Mon parcours de solopreneuse" → trop vague
WAHOU ✅ : "Le jour où j'ai perdu 7 000€ parce que je n'avais pas de contrat. La leçon que je ne partage jamais." → spécifique, vulnérabilité, mystère

FADE ❌ : "L'importance de l'authenticité sur Instagram" → tout le monde dit ça
WAHOU ✅ : "L'authenticité sur Instagram, c'est le nouveau filtre. Et on est toutes tombées dans le piège." → retournement, provocation douce

═══════════════════════════════════════════════════
FORMAT DE SORTIE
═══════════════════════════════════════════════════

ROUTES :
Instagram : Post → /creer, Carrousel → /creer?format=carousel, Reel → /creer?format=reel, Story → /creer?format=story
LinkedIn : Post → /creer?format=linkedin, Carrousel → /creer?format=linkedin

Le format recommandé correspond au format choisi (${formatLabel}).

Retourne UNIQUEMENT ce JSON :
{
  "ideas": [
    {
      "subject": "Le sujet ultra-concret (assez précis pour commencer à écrire tout de suite)",
      "hook": "L'accroche prête à poster (max 15 mots, structure imposée ci-dessus)",
      "angle": "Nom de l'angle (enquête, coup de gueule, mythe, etc.)",
      "objective_tag": "visibilite|engagement|vente|credibilite",
      "why_it_works": "1 phrase : POURQUOI ce sujet va résonner avec l'audience de cette utilisatrice SPÉCIFIQUEMENT",
      "brief": "2-3 phrases : angle exact, structure, ton, le détail qui rend le contenu unique. Assez concret pour commencer."
    }
  ],
  "recommended_format": "${formatLabel}",
  "format_reason": "Pourquoi ce format en 1 phrase",
  "redirect_route": "route correspondant au format et canal choisis"
}`;

    const raw = await callAnthropicSimple(
      getModelForAction("coaching"),
      systemPrompt + "\n\n" + ANTI_SLOP,
      "Génère 3 idées de contenu ultra-concrètes avec un hook irrésistible pour chaque.",
      0.9,
      2500,
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
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
