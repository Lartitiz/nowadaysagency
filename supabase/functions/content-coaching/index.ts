import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

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

    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

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
        .limit(8),
      sbService.from("brand_strategy")
        .select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3")
        .eq(filterCol, filterVal)
        .maybeSingle(),
      sbService.from("generated_carousels" as any)
        .select("subject, hook_text, carousel_type, objective, created_at")
        .eq(filterCol === "workspace_id" ? "workspace_id" : "user_id", filterCol === "workspace_id" ? filterVal : user.id)
        .order("created_at", { ascending: false })
        .limit(8),
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

    // Format-specific blocks (compacted)
    let formatBlock = "";
    if (format === "reel") {
      formatBlock = `
FORMAT REEL — règles spécifiques :
- Le Reel est un objet VISUEL et SONORE qui se VIT en quelques secondes, pas un texte qui se lit.
- Angles à privilégier : scène jouée, process montré, transformation visuelle, réaction caméra, démonstration, bug créatif (cf. ci-dessous).
- Hook = phrase orale courte (max 8 mots) OU action visible démarrant en 1s OU pattern interrupt à 2-3s. INTERDIT : questions abstraites, affirmations conceptuelles, chiffres seuls.
- Brief = mise en scène : ce qu'on voit (cadre, action), ce qui est dit à l'oral, ce qui apparaît en overlay, dynamique (jump cuts, plans fixes).
`;
    } else if (format === "story") {
      formatBlock = `
FORMAT STORY — règles spécifiques :
- La story s'aperçoit en 0,5s, ne se lit pas. Privilégier : coulisses brutes, prise de position instantanée, interaction directe (sondage, question, slider), teaser, séquence narrative courte (3-5 stories).
- Hook story 1 = phrase ULTRA courte (max 6 mots) + visuel fort, OU overlay choc, OU question fermée appelant un sondage. INTERDIT : paragraphes, questions intellectuelles.
- Brief = la SÉQUENCE complète (combien de stories, quoi sur chacune) + l'INTERACTION proposée.
`;
    } else if (format === "pinterest_visual") {
      formatBlock = `
FORMAT PINTEREST VISUEL — règles spécifiques :
- L'épingle se SCANNE en 1s. Privilégier : infographie, checklist, schéma, comparatif, avant/après, citation typographiée.
- Hook = TITRE SEO cherchable et cliquable, format "[Bénéfice concret] : [méthode/nombre/angle]" avec mots-clés recherchés. INTERDIT : questions, confessions, hooks à twist.
- Brief = description du VISUEL (type d'épingle, contenu textuel intégré, structure visuelle) + le TITRE SEO.
`;
    }

    // BUG CRÉATIF condensé (au lieu d'EMBEDDED_EDUCATION complet)
    const bugCreatifBlock = (format === "reel" || format === "story") ? `
BUG CRÉATIF (à utiliser sur AU MOINS 1 idée sur 3 si le branding s'y prête) :
Un contenu qui crée une rupture de pattern dans les premières secondes : geste inattendu, objet inhabituel, son décalé, énoncé qui surprend. Ce n'est PAS de l'humour gratuit, c'est un crochet visuel/sonore qui éduque sur le fond. Exemple : commencer par une action absurde liée au métier, puis enchaîner sur le vrai message. Ne pas l'utiliser si le branding est sobre/contemplatif ou sur sujet sensible.
` : "";

    const systemPrompt = `Tu es la meilleure directrice éditoriale du monde. Tu trouves THE idée qui fait dire "c'est exactement ça que je veux poster". Pas d'idées tièdes. Des angles qui surprennent.
Tu ne dis JAMAIS de gros mots ni de langage vulgaire.

CONTEXTE BRANDING :
${contextText}

PILIERS : ${pillars}
DATE : ${dayOfWeek} ${now.getDate()} ${currentMonth} ${currentYear}

HISTORIQUE (NE PAS REPROPOSER ces sujets ni des variations proches) :
${recentPosts}

DEMANDE :
- Canal : ${canalLabel} | Format : ${formatLabel} | Objectif : ${objectifLabel}
- Sujet : ${sujet || "PAS DE SUJET → propose 3 idées concrètes et surprenantes"}
- Ton : ${tonLabel}${contentTypeLabel ? ` | Angle demandé : ${contentTypeLabel}` : ""}
${formatBlock}${bugCreatifBlock}
RÈGLE D'OR — ANCRAGE MÉTIER (la plus importante) :
Les idées parlent du MÉTIER de l'utilisatrice (photographie si photographe, céramique si céramiste, transformations accompagnées si coach, etc.), PAS de communication en général. NE JAMAIS proposer d'idées sur "comment communiquer", "l'authenticité sur Instagram", "oser se montrer", SAUF si elle travaille elle-même dans la communication/marketing.
Test de spécificité : si l'idée pourrait fonctionner pour quelqu'un d'un autre secteur, elle est trop vague.

MÉTHODE — pour chaque idée :
1. Pioche un ANGLE ÉDITORIAL VARIÉ (les 3 idées doivent être radicalement différentes) : enquête/décryptage, mythe à déconstruire, conseil contre-intuitif, storytelling avec leçon, histoire cliente, surf sur l'actu, regard philosophique, before/after, build in public, ou un autre angle pertinent.
2. Applique au moins 1 CONTRAINTE CRÉATIVE :
   🎲 ${seed1}
   🎲 ${seed2}
3. Construis un HOOK qui stoppe le scroll (max 15 mots, fonctionne SEUL) :
${shuffledHooks.map((h, i) => `   Idée ${i + 1} → ${h}`).join("\n")}
4. Le BRIEF doit contenir au moins 1 de : un mécanisme à expliquer (biais, paradoxe), une donnée/référence, un retournement, ou une tension. Pas juste "on parle de X sous l'angle Y".

VOIX & TON :
- Adapte au profil de voix de l'utilisatrice (registre, tutoiement/vouvoiement, expressions).
- Si profil flou : ton neutre. Instagram = direct/accrocheur. LinkedIn = pro/engagé.

RÈGLE ANTI-TU sur les hooks :
- Voix dominante = JE (vécu, conviction, observation de l'utilisatrice).
- ✅ "J'ai arrêté de faire des remises. Voici ce qui s'est passé."
- ❌ "Tu fais cette erreur sans le savoir."
- TU autorisé sur 1 hook sur 3 max. Sinon JE narratif ou formulation impersonnelle.

INTERDITS pour les hooks (anti-patterns IA) :
- Formules : "Et si je te disais", "Dans un monde où", "Spoiler alert", "Le secret de", "La clé c'est"
- Structures sur-utilisées : "Il y a 2 types de [X]", "Les X mensonges/erreurs que…", "Et personne n'en parle"
- Les 3 hooks doivent utiliser des structures RADICALEMENT différentes entre eux.

${sujet ? `Toutes les idées sont liées au sujet "${sujet}" mais avec des angles RADICALEMENT différents (pas 3 variations).` : `Les 3 idées couvrent au moins 2 objectifs différents parmi : visibilite, engagement, vente, credibilite, et touchent des facettes différentes du métier.`}

ROUTES :
Instagram : Post → /creer | Carrousel → /creer?format=carousel | Reel → /creer?format=reel | Story → /creer?format=story
LinkedIn : Post/Carrousel → /creer?format=linkedin
Pinterest : Texte → /creer?canal=pinterest | Visuelle → /creer?canal=pinterest&format=pinterest_visual
Newsletter → /creer?format=newsletter

Retourne UNIQUEMENT ce JSON (pas de markdown, pas de commentaires) :
{
  "ideas": [
    {
      "subject": "Sujet ultra-concret, ancré dans le métier, prêt à écrire",
      "hook": "Accroche prête à poster, max 15 mots, dans le ton de l'utilisatrice",
      "angle": "Nom de l'angle éditorial",
      "objective_tag": "visibilite|engagement|vente|credibilite",
      "why_it_works": "1 phrase : pourquoi ça résonne avec SON audience (mentionne sa cible, secteur ou un verbatim)",
      "brief": "2-3 phrases : architecture intellectuelle. Quel mécanisme, quelle donnée, quel retournement."
    }
  ],
  "recommended_format": "${formatLabel}",
  "format_reason": "Pourquoi ce format en 1 phrase",
  "redirect_route": "route correspondant au format et canal choisis"
}`;

    const raw = await callAnthropicSimple(
      getModelForAction("coaching_light"),
      systemPrompt,
      "Génère 3 idées de contenu ultra-concrètes avec un hook irrésistible pour chaque.",
      0.9,
      1800,
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
