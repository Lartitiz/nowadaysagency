import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildIdentityBlock } from "../_shared/user-context.ts";

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
      pinterest: "Épingle Pinterest (titre + description SEO)",
      pinterest_visual: "Épingle visuelle Pinterest (infographie, checklist, schéma)",
      newsletter: "Newsletter (email long format)",
      // Rétrocompatibilité
      post_texte: "Post texte (légende Instagram ou post LinkedIn)",
      carrousel: "Carrousel",
    };
    const CANAL_LABELS: Record<string, string> = {
      instagram: "Instagram",
      linkedin: "LinkedIn",
      pinterest: "Pinterest",
      newsletter: "Newsletter",
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

    // Guard: if branding is too sparse, return helpful guidance instead of generic ideas
    if (!ctx.profile?.activite && !ctx.profile?.mission && !ctx.profile?.cible) {
      return new Response(JSON.stringify({
        ideas: [{
          title: "Complète d'abord ton branding",
          angle: "Pour te proposer des idées vraiment personnalisées, j'ai besoin de mieux te connaître.",
          format: "action",
          objective: "setup",
          accroche: "Rendez-vous dans ton espace branding pour poser les bases.",
          cta_route: "/branding"
        }],
        message: "Tes idées seront 10× plus pertinentes une fois ton branding rempli. Commence par là, ça prend 10 minutes.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      "Interpellation directe : Pointer une erreur courante que l'audience fait sans le savoir",
      "Polarisation douce : Opposer deux postures face à un enjeu du métier et demander laquelle résonne",
      "Promesse-mystère : Annoncer un changement de jeu inattendu dans son activité, sans le révéler tout de suite",
    ];
    const shuffledHooks = HOOK_STRUCTURES.sort(() => Math.random() - 0.5).slice(0, 3);

    const systemPrompt = `Tu es la meilleure directrice éditoriale du monde. Ton job : trouver THE idée de contenu qui fait dire "c'est exactement ça que je veux poster". Pas des idées tièdes. Pas des sujets génériques. Des angles qui surprennent, qui piquent, qui donnent envie de tout lâcher pour écrire.

CONTEXTE BRANDING DE L'UTILISATRICE :
${contextText}

PILIERS DE CONTENU : ${pillars}

DATE : ${dayOfWeek} ${now.getDate()} ${currentMonth} ${currentYear}
Pense aux événements, saisons, tendances du moment.

HISTORIQUE (NE PAS REPROPOSER ces sujets ni des variations proches) :
${recentPosts}

RÉPONSES DE L'UTILISATRICE :
- Canal : ${canalLabel}
- Objectif : ${objectifLabel}
- Sujet : ${sujet || "PAS DE SUJET → elle a besoin d'idées concrètes et surprenantes"}
- Format préféré : ${formatLabel}${contentTypeLabel ? `\n- Angle demandé : ${contentTypeLabel}` : ""}
- Ton souhaité : ${tonLabel}

══════════════════════════════════════
ÉTAPE 0 — ANALYSE LE BRANDING (obligatoire avant de générer)
══════════════════════════════════════

AVANT de proposer la moindre idée, identifie en interne (ne montre PAS) :
- Son ACTIVITÉ PRÉCISE : qu'est-ce qu'elle fait concrètement ? (ex : "photographe culinaire", "coach en reconversion", "céramiste", "consultant RH")
- Sa CIBLE : à qui elle parle ? Quels sont leurs mots, leurs frustrations, leurs rêves ?
- Ses OFFRES : qu'est-ce qu'elle vend ? À quel prix ? Quelle transformation ?
- Ses COMBATS : contre quoi elle se bat dans son secteur ? Quelles sont ses convictions ?
- Ses VERBATIMS : quels mots utilisent ses clientes ? Quelles phrases reviennent ?
- Son TON : tutoiement ou vouvoiement ? Oral ou soutenu ? Chaleureux ou expert ?

Les 3 idées DOIVENT être ancrées dans CES éléments. Une idée qui pourrait s'appliquer à n'importe quel·le entrepreneur·e est TROP GÉNÉRIQUE.

TEST DE SPÉCIFICITÉ : pour chaque idée, vérifie qu'elle ne pourrait PAS fonctionner pour quelqu'un dans un autre domaine. Si oui, l'idée est trop vague. Recommence.

══════════════════════════════════════
VOIX ET TON
══════════════════════════════════════

Les hooks et les briefs doivent refléter le ton de l'utilisatrice, PAS un ton par défaut.

Si le contexte contient une section VOIX PERSONNELLE :
- Adapte le niveau de langage (oral, soutenu, technique)
- Respecte le tutoiement/vouvoiement indiqué
- Utilise le registre décrit (humour, sérieux, chaleureux, expert)

Si le contexte contient une section TON & STYLE :
- Utilise le registre et le niveau indiqués

Si AUCUN profil de voix : adapte au canal.
- Instagram : ton direct, accrocheur
- LinkedIn : ton professionnel, engagé

Les hooks ne doivent PAS imposer de tutoiement ou vouvoiement si le profil de voix de l'utilisatrice n'est pas clair. Dans ce cas, formuler le hook de façon neutre ("Le problème des prix trop bas." plutôt que "Tu baisses tes prix." ou "Vous baissez vos prix.").

══════════════════════════════════════
MÉTHODE POUR GÉNÉRER 3 IDÉES EXCEPTIONNELLES
══════════════════════════════════════

RÈGLE D'OR : chaque idée doit passer le "test du screenshot".
Si l'audience tombe dessus en scrollant, est-ce qu'elle fait une capture d'écran pour l'envoyer à quelqu'un ?

ÉTAPE 1 — 3 ANGLES ÉDITORIAUX DIFFÉRENTS :
Pioche parmi ces 13, en choisissant des angles VARIÉS :
1. Enquête/décryptage ("et personne n'en parle")
2. Test grandeur nature ("j'ai testé pour vous")
3. Coup de gueule engagé ("j'en peux plus que...")
4. Mythe à déconstruire ("on vous a menti")
5. Storytelling + leçon (une galère → une leçon)
6. Histoire cliente / cas réel (social proof incarné)
7. Surf sur l'actu (rebondir sur une news/tendance)
8. Regard philosophique (prendre de la hauteur)
9. Conseil contre-intuitif ("et si on faisait l'inverse ?")
10. Before/after (évolution concrète)
11. Identification/quotidien (l'audience se reconnaît)
12. Build in public (coulisses, transparence)
13. Analyse en profondeur (data, décryptage)

ÉTAPE 2 — CRÉATIVITÉ FORCÉE :
🎲 Contrainte créative 1 : ${seed1}
🎲 Contrainte créative 2 : ${seed2}
Intègre ces contraintes dans AU MOINS 1 des 3 idées.

ÉTAPE 3 — HOOKS QUI STOPPENT LE SCROLL :
Chaque idée utilise une STRUCTURE DE HOOK DIFFÉRENTE :
${shuffledHooks.map((h, i) => `Idée ${i + 1} → ${h}`).join("\n")}

INTERDIT pour les hooks : "Et si je te disais", "Dans un monde où", "Spoiler alert", "Le secret de", "La clé c'est", toute formule IA générique.
Les hooks font max 15 mots. Ils fonctionnent SEULS, sans contexte.

ANTI-PATTERNS RÉCURRENTS (l'IA les sur-utilise, INTERDITS sauf exception rare) :
- "Il y a 2 types de [X]" → formule sur-utilisée, trouver un autre angle
- "Les X mensonges/erreurs que..." → idem
- "Et personne n'en parle" → trop fréquent, créer la curiosité autrement
- Les 3 hooks doivent utiliser des STRUCTURES RADICALEMENT DIFFÉRENTES entre eux

ANCRAGE MÉTIER (CRITIQUE — la règle la plus importante de ce prompt) :
Les idées parlent du MÉTIER et du SECTEUR de l'utilisatrice, pas de la communication en général.
- Si elle est photographe → des idées sur la photographie, ses clientes, son regard, les enjeux de son secteur
- Si elle est céramiste → des idées sur la céramique, le processus, ses matières, son marché
- Si elle est coach → des idées sur les transformations qu'elle accompagne, les blocages de ses clientes
- Si elle est naturopathe → des idées sur la santé naturelle, les idées reçues de son secteur, ses clientes
La communication est le CANAL par lequel elle s'exprime, pas le SUJET de ses contenus.
NE PROPOSE PAS d'idées sur "comment communiquer", "l'authenticité sur Instagram", "oser se montrer", "vendre sans manipuler" SAUF si l'utilisatrice travaille ELLE-MÊME dans la communication ou le marketing.
Vérifie son activité dans le branding context. Si elle n'est PAS dans la com' → 0 idée sur la com'.

ÉTAPE 4 — DENSITÉ ET PROFONDEUR :
Chaque idée doit avoir dans son brief AU MOINS 1 de ces éléments :
- Un MÉCANISME à expliquer (biais cognitif, dynamique de marché, paradoxe psychologique)
- Une DONNÉE ou RÉFÉRENCE crédible (chiffre, étude, concept nommé)
- Un RETOURNEMENT de perspective (ce qui fait dire "j'avais pas vu ça comme ça")
- Une TENSION ou un PARADOXE (ce qui crée la curiosité)

Un brief qui dit juste "on va parler de X sous l'angle Y" est TROP VAGUE. Le brief doit donner l'architecture intellectuelle du contenu.

ÉTAPE 5 — VÉRIFICATION :
Pour chaque idée, 3 tests obligatoires :
✅ TEST DU SCREENSHOT : est-ce que l'audience capture et envoie à quelqu'un ?
✅ TEST DE SPÉCIFICITÉ : cette idée ne PEUT exister QUE dans l'univers de cette utilisatrice ?
✅ TEST DE TENSION : y a-t-il un paradoxe, une surprise, une contradiction ?

${sujet ? `
TOUTES les idées sont liées au sujet "${sujet}" mais avec des ANGLES RADICALEMENT DIFFÉRENTS.
Ne fais pas 3 variations du même message. Chaque idée attaque le sujet par un côté inattendu.
` : `
Les 3 idées doivent couvrir AU MOINS 2 objectifs différents parmi : visibilite, engagement, vente, credibilite.
Les idées doivent toucher des FACETTES DIFFÉRENTES du métier/positionnement de l'utilisatrice.
`}

══════════════════════════════════════
FORMAT DE SORTIE
══════════════════════════════════════

ROUTES :
Instagram : Post → /creer, Carrousel → /creer?format=carousel, Reel → /creer?format=reel, Story → /creer?format=story
LinkedIn : Post → /creer?format=linkedin, Carrousel → /creer?format=linkedin
Pinterest : Épingle texte → /creer?canal=pinterest, Épingle visuelle → /creer?canal=pinterest&format=pinterest_visual
Newsletter : Newsletter → /creer?format=newsletter

Le format recommandé correspond au format choisi (${formatLabel}).

Retourne UNIQUEMENT ce JSON :
{
  "ideas": [
    {
      "subject": "Le sujet ultra-concret (assez précis pour commencer à écrire immédiatement, ancré dans le métier de l'utilisatrice)",
      "hook": "L'accroche prête à poster (max 15 mots, structure imposée ci-dessus, dans le ton de l'utilisatrice)",
      "angle": "Nom de l'angle éditorial",
      "objective_tag": "visibilite|engagement|vente|credibilite",
      "why_it_works": "1 phrase : POURQUOI ce sujet va résonner avec l'audience de cette utilisatrice SPÉCIFIQUEMENT (mentionne sa cible, son secteur, ou un verbatim)",
      "brief": "2-3 phrases : l'architecture intellectuelle du contenu. Quel mécanisme on explore, quelle donnée on utilise, quel retournement on propose. Assez concret pour commencer à écrire."
    }
  ],
  "recommended_format": "${formatLabel}",
  "format_reason": "Pourquoi ce format en 1 phrase",
  "redirect_route": "route correspondant au format et canal choisis"
}`;

    const raw = await callAnthropicSimple(
      getModelForAction("coaching"),
      systemPrompt,
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
