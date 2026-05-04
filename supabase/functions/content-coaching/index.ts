import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildIdentityBlock } from "../_shared/user-context.ts";
import { IDEA_LENSES, pickLenses, WOW_IDEA_EXAMPLES } from "../_shared/copywriting-prompts.ts";


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
    const { answers, workspace_id, intensity, regenerate_lens } = body;
    const { objectif, sujet, canal, format, content_type, ton_envie } = answers || {};

    if (!objectif || !ton_envie) {
      return new Response(JSON.stringify({ error: "Réponses incomplètes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isBold = intensity === "bold" || intensity === "provoc";

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
      "Si l'angle s'y prête naturellement, une idée peut utiliser une analogie cuisine/sport/jardinage. Sinon ignore.",
      "Si pertinent, une idée peut s'appuyer sur un biais cognitif précis (Dunning-Kruger, biais de survie, paradoxe du choix). Sinon ignore.",
      "Si le parallèle tient vraiment, une idée peut faire un lien avec un film, série ou livre connu. Sinon ignore.",
      "Si un chiffre FACTUEL et SOURÇABLE est disponible (étude publique, donnée du contexte branding), une idée peut s'appuyer dessus. JAMAIS de chiffre inventé.",
      "Si un conseil mainstream précis du secteur est réellement faux ou nuancé, une idée peut prendre son contre-pied. Sinon ignore.",
      "Une idée peut raconter un micro-moment du quotidien (un détail précis, pas une grande histoire).",
      "Si le parallèle tient, une idée peut faire un lien inattendu avec un autre métier. Sinon ignore.",
      "Une idée peut utiliser le format 'confession' ou 'j'avoue que...' à condition que ce soit cohérent avec le vécu de l'utilisatrice.",
      "Une idée peut poser une question que l'audience se pose en secret mais n'ose pas formuler.",
      "Une idée peut comparer deux époques (avant/maintenant) sur un aspect du métier de l'utilisatrice.",
      "Une idée peut décortiquer un mot ou un concept que tout le monde utilise sans le comprendre.",
      "Une idée peut s'inspirer d'une tendance sociétale actuelle (slow life, dé-croissance, IA, etc.) si elle touche réellement le métier.",
    ];
    const seed1 = CREATIVE_SEEDS[Math.floor(Math.random() * CREATIVE_SEEDS.length)];
    let seed2 = CREATIVE_SEEDS[Math.floor(Math.random() * CREATIVE_SEEDS.length)];
    while (seed2 === seed1) seed2 = CREATIVE_SEEDS[Math.floor(Math.random() * CREATIVE_SEEDS.length)];

    // Format-specific blocks (allégés — on génère juste l'idée, pas le hook ni le brief)
    let formatBlock = "";
    if (format === "reel") {
      formatBlock = `\nFORMAT REEL : sujets qui se VIVENT en quelques secondes (scène jouée, process montré, transformation visuelle, démonstration). Éviter sujets purement conceptuels.\n`;
    } else if (format === "story") {
      formatBlock = `\nFORMAT STORY : sujets pour coulisses brutes, prise de position instantanée, séquence narrative courte, interaction (sondage, question).\n`;
    } else if (format === "pinterest_visual") {
      formatBlock = `\nFORMAT PINTEREST VISUEL : sujets qui se SCANNENT en 1s (infographie, checklist, schéma, comparatif, avant/après). Sujet = bénéfice concret + angle SEO cherchable.\n`;
    }

    const bugCreatifBlock = "";

    const cibleTxt = ctx?.profile?.cible || "non renseignée";
    const activiteTxt = ctx?.profile?.activite || ctx?.profile?.type_activite || "non renseignée";
    const systemPrompt = `Tu es la meilleure directrice éditoriale du monde. Tu trouves THE idée qui fait dire "c'est exactement ça que je veux poster". Surprenante MAIS juste. Une idée surprenante mais fausse, malhonnête ou bancale est PIRE qu'une idée tiède : elle décrédibilise. Vise la justesse d'abord, la surprise ensuite.
Tu ne dis JAMAIS de gros mots ni de langage vulgaire.

═══════════════════════════════════════════════
RÈGLE DE VÉRITÉ (non négociable, prime sur tout le reste)
═══════════════════════════════════════════════
- AUCUN chiffre inventé dans hooks/briefs ("+40% de prix", "3x plus de clients", "82% des gens"). Si chiffre nécessaire : soit factuel et sourçable (étude publique connue, donnée du contexte branding), soit reformulation qualitative ("nettement plus", "une majorité", "la plupart").
- AUCUN faux retex à la 1re personne ("j'ai viré X et mes prix ont grimpé de Y%", "j'ai testé X pendant 30 jours") sauf si l'événement est attesté dans le contexte branding (story, retex existant, témoignage).
- AUCUN exemple de marque/personnalité qui contredit un fait vérifiable. Exemples de pièges à éviter : "Netflix recommande mal" (faux, leur algo est référence), "Hermès ne fait pas de réseaux" (fausse simplification), "Apple ne fait pas de pub" (faux).
- En cas de doute : reformule en JE narratif générique sans chiffre, ou en observation à la 3e personne sans nommer de marque.

═══════════════════════════════════════════════
AUDIENCE vs UTILISATRICE — ne JAMAIS confondre
═══════════════════════════════════════════════
- L'utilisatrice EXERCE l'activité : ${activiteTxt}
- L'utilisatrice s'ADRESSE À : ${cibleTxt}
- Les idées parlent À ${cibleTxt}, PAS aux personnes qui exercent ${activiteTxt}.
- Exemple piège : si activite = "agence de communication" et cible = "petites marques de luxe", les hooks parlent AUX petites marques de luxe (leurs problèmes, leur quotidien, leurs blocages business), JAMAIS aux agences de com ni à "celles qui font de la com".
- Test mental : remplace le "tu/vous/on" du hook par le profil de la cible. Si ça ne colle pas (le hook s'adresse en réalité aux pairs de l'utilisatrice), l'angle est faux et tu dois le retoquer.

═══════════════════════════════════════════════
ALIGNEMENT D'ÉCHELLE ET DE POSTURE
═══════════════════════════════════════════════
- Cible de l'utilisatrice : ${cibleTxt}
- Si tu cites une marque/exemple, elle doit être de TAILLE COMPARABLE à l'utilisatrice OU à sa cible. Pas Hermès ni LVMH si elle s'adresse à des PETITES marques de luxe ; pas Patagonia ni Apple si elle est solopreneuse.
- Exemples préférés : créateurs indépendants, petites marques de niche, artisanat, ateliers, studios de 1-10 personnes, success stories d'échelle humaine, anonymes du secteur.
- INTERDIT de citer Hermès, LVMH, Apple, Netflix, Tesla, Patagonia, Glossier, Nike, Adidas comme modèle direct à imiter dans un hook. Ces marques ne sont mentionnables que dans un brief, et uniquement avec un angle "ce que les géants font et qu'on peut adapter à petite échelle" — pas en hook seul.
- Ne JAMAIS contredire la posture de l'utilisatrice : si elle utilise les réseaux sociaux pour vivre de son activité, ne pas pondre des angles type "les vraies marques ne postent pas" ou "le luxe méprise Instagram".

═══════════════════════════════════════════════
EXIGENCE DE PROFONDEUR — anti-tiède
═══════════════════════════════════════════════
INTERDIT (sujets de surface qui n'apprennent rien) :
- "Les 3 erreurs que…", "Top 3 / Top 5", "Voici pourquoi X marche", "La vérité sur Y", "Ce que personne ne dit sur Z", "Le piège du…", "Le mythe du…" sans angle réellement nouveau.

Chaque sujet doit ouvrir sur AU MOINS UN de ces 3 éléments (à révéler ensuite à la rédaction) :
1. Une TENSION précise et localisée (pas "le marché change" → flou).
2. Un MÉCANISME nommable (biais cognitif, dynamique de marché, ressort psychologique précis).
3. Une OBSERVATION DE TERRAIN ancrée dans le secteur de la cible.

CONTEXTE BRANDING :
${contextText}

PILIERS : ${pillars}
DATE : ${dayOfWeek} ${now.getDate()} ${currentMonth} ${currentYear}

HISTORIQUE (NE PAS REPROPOSER ces sujets ni des variations proches) :
${recentPosts}

DEMANDE :
- Canal : ${canalLabel} | Format : ${formatLabel} | Objectif : ${objectifLabel}
- Sujet : ${sujet || "PAS DE SUJET → propose 4 idées concrètes et surprenantes"}
- Ton : ${tonLabel}${contentTypeLabel ? ` | Angle demandé : ${contentTypeLabel}` : ""}
${formatBlock}${bugCreatifBlock}
RÈGLE D'OR — ANCRAGE MÉTIER (la plus importante) :
Les idées parlent du MÉTIER de l'utilisatrice (photographie si photographe, céramique si céramiste, transformations accompagnées si coach, etc.), PAS de communication en général. NE JAMAIS proposer d'idées sur "comment communiquer", "l'authenticité sur Instagram", "oser se montrer", SAUF si elle travaille elle-même dans la communication/marketing.
Test de spécificité : si l'idée pourrait fonctionner pour quelqu'un d'un autre secteur, elle est trop vague.

MÉTHODE — 4 REGISTRES OBLIGATOIRES ET ORDONNÉS :
Tu produis EXACTEMENT 4 idées, une par registre, dans cet ordre :

   1. EXPERTISE PRATIQUE — le "comment" du métier ancré terrain. Détail technique précis, savoir-faire opérationnel, mécanique concrète de l'activité de l'utilisatrice. C'est le registre "métier vu de l'intérieur" : ce que seule quelqu'un qui exerce vraiment ${activiteTxt} peut formuler avec cette précision.

   2. CONVICTION / CONTRE-PIED — opinion tranchée du métier qui dérange aussi les PAIRS du secteur (pas seulement l'audience). Pas un contre-pied qui flatte l'audience contre les pairs (ex : "les autres vous mentent, voilà la vérité") — un contre-pied qui met mal à l'aise les confrères / consœurs parce qu'il touche à une pratique commune du métier. Voir TEST DE SINGULARITÉ ci-dessous.

   3. PERSPECTIVE ÉLARGIE — regard sur le SECTEUR (pas sur le geste métier individuel). Mécanisme nommé (biais cognitif, dynamique de marché, ressort psychologique précis), ou mise en tension culturelle/sociétale autour du métier. On prend de la hauteur, on décortique une dynamique invisible.

   4. ANALOGIE INATTENDUE — parallèle entre une mécanique précise du métier de l'utilisatrice et un univers totalement différent (cuisine, sport, artisanat, mécanique, art, science, jeu d'échecs, jardinage, musique, architecture, etc.). L'analogie doit RÉELLEMENT TENIR (pas un parallèle décoratif) et faire voir le métier autrement. Pas la peine de forcer un univers tendance — choisis celui qui éclaire vraiment.

CONTRAINTES CRÉATIVES OPTIONNELLES (à appliquer si pertinent à l'un des 4 registres, sinon ignore) :
   🎲 ${seed1}
   🎲 ${seed2}

RÈGLE ANTI-TU :
Le SUBJECT est rédigé en JE narratif ou IMPERSONNEL (3e personne, on, nominalisations). INTERDIT par défaut : "tu", "te", "t'", "toi", "ton", "ta", "tes", "vous", "votre", "vos".

${sujet ? `Les 4 idées traitent toutes du sujet "${sujet}" mais sous les 4 registres ci-dessus, donc 4 angles RADICALEMENT différents (pas 4 variations du même angle).` : `Les 4 registres priment sur tout le reste. En bonus, vise une diversité d'objectifs parmi : visibilite, engagement, vente, credibilite, et touche des facettes différentes du métier.`}

ROUTES :
Instagram : Post → /creer | Carrousel → /creer?format=carousel | Reel → /creer?format=reel | Story → /creer?format=story
LinkedIn : Post/Carrousel → /creer?format=linkedin
Pinterest : Texte → /creer?canal=pinterest | Visuelle → /creer?canal=pinterest&format=pinterest_visual
Newsletter → /creer?format=newsletter

═══════════════════════════════════════════════
TEST DE SINGULARITÉ — applique-le sur CHAQUE idée AVANT le test de validité
═══════════════════════════════════════════════
Si quelqu'un qui suit 5 comptes du même secteur sur Insta/LinkedIn aurait déjà vu cette idée formulée à peu près comme ça → invalide, recommence.

Pour passer, l'idée doit avoir AU MOINS UN de ces caractères :
- Un détail technique trop précis pour être générique
- Un angle qu'aucun·e influenceur·euse du secteur ne prendrait (parce que ça ne flatte pas, parce que c'est trop nuancé pour Insta, parce que ça contredit la doxa du secteur lui-même)
- Une formulation qui surprend par sa concrétude ou sa franchise

Note spécifique CONTRE-PIED (Idée 2) : si le contre-pied dit "tout le monde fait X mal, en vrai il faut Y", c'est probablement déjà vu. Cherche un contre-pied qui dérange les PAIRS du secteur, pas un contre-pied qui flatte l'audience contre les pairs.

═══════════════════════════════════════════════
TEST DE VALIDITÉ — applique-le sur CHAQUE idée AVANT de la sortir
═══════════════════════════════════════════════
1. ANALOGIE : si l'idée en contient une, vérifie qu'elle tient vraiment. Sinon, change.
2. CONTRE-PIED : la croyance citée doit être vraiment répandue ET le contre-pied factuellement vrai.
3. CHIFFRE : aucun chiffre inventé (RÈGLE DE VÉRITÉ).
4. RETEX en JE : cohérent avec le parcours réel visible dans le contexte branding.
5. MARQUE citée : alignement d'échelle, pas de géants.

Retourne UNIQUEMENT ce JSON (pas de markdown, pas de commentaires, pas de prose avant) :
{
  "ideas": [
    {
      "subject": "Sujet ultra-concret, ancré dans le métier, prêt à écrire (1 phrase claire)",
      "angle": "Nom court de l'angle éditorial (ex: Contre-pied factuel, Micro-scène, Décryptage de concept)",
      "objective_tag": "visibilite|engagement|vente|credibilite",
      "why_it_works": "1 phrase : pourquoi ça résonne avec SA cible spécifique"
    }
  ],
  "recommended_format": "${formatLabel}",
  "redirect_route": "route correspondant au format et canal choisis"
}`;

    const raw = await callAnthropicSimple(
      getModelForAction("coaching"),
      systemPrompt,
      "Génère 4 idées de contenu (sujet + angle uniquement, PAS de hook ni de brief), une par registre dans l'ordre : 1.expertise pratique / 2.contre-pied / 3.perspective élargie / 4.analogie inattendue. Applique successivement : (1) AUDIENCE vs UTILISATRICE, (2) RÈGLE DE VÉRITÉ, (3) RÈGLE D'OR métier, (4) TEST DE SINGULARITÉ, (5) TEST DE VALIDITÉ. Réponds UNIQUEMENT avec le JSON demandé.",
      0.8,
      1200,
    );

    let result: any;
    try {
      // Strip markdown fences éventuelles puis isole le 1er { ... } équilibré.
      let cleaned = (raw || "")
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        throw new Error("No JSON object found");
      }
      cleaned = cleaned.slice(start, end + 1);
      try {
        result = JSON.parse(cleaned);
      } catch {
        // Réparations courantes : virgules trailing + caractères de contrôle.
        const repaired = cleaned
          .replace(/,(\s*[}\]])/g, "$1")
          .replace(/[\x00-\x1F\x7F]/g, " ");
        try {
          result = JSON.parse(repaired);
        } catch {
          // Dernier recours : jsonrepair gère les guillemets non échappés,
          // virgules manquantes, retours-ligne dans les strings, etc.
          const { jsonrepair } = await import("npm:jsonrepair@3.8.1");
          result = JSON.parse(jsonrepair(cleaned));
        }
      }
    } catch (parseErr) {
      console.error("Failed to parse content-coaching response:", parseErr, "raw:", raw?.slice(0, 800));
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
