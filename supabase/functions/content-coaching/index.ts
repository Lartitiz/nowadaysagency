import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { AnthropicError, callAnthropic, getModelForAction, type UsageSink } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildIdentityBlock } from "../_shared/user-context.ts";
import { IDEA_LENSES, pickLenses, WOW_IDEA_EXAMPLES } from "../_shared/copywriting-prompts.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";

const MAX_CONTEXT_CHARS = 12000;
const MAX_LIVING_MATTER_CHARS = 4500;
const MAX_HISTORY_CHARS = 2200;

function truncateForPrompt(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}\n[… contexte tronqué pour garder la génération stable …]`;
}

// Marqueur interne : la réponse LLM n'a pas pu être parsée (déjà loguée).
class ParseFailure extends Error {}


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

    const body = await req.json();
    const { answers, workspace_id, intensity, regenerate_lens, draw_nonce, exclude_lenses, previous_subject } = body;
    const { objectif, sujet, canal, format, content_type, ton_envie } = answers || {};
    const knownLensIds = IDEA_LENSES.map((l) => l.id);
    const excludeLensIds: string[] = Array.isArray(exclude_lenses)
      ? exclude_lenses.filter((id: unknown) => typeof id === "string" && knownLensIds.includes(id)).slice(0, 8)
      : [];

    const sbGuard = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const membership = await assertWorkspaceMembership(sbGuard, user.id, workspace_id);
    if (!membership.ok) {
      console.warn("[workspace-guard] denied", { userId: user.id, workspaceId: workspace_id });
      return workspaceDeniedResponse(corsHeaders);
    }

    const quota = await checkQuota(user.id, "suggestion", workspace_id);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Fetch context, recent posts, generated content, strategy + LIVING MATTER (persona, storytelling, offers) in parallel
    const [ctx, recentPostsRes, strategyRes, generatedRes, personaRes, storytellingRes, offersRes] = await Promise.all([
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
      sbService.from("persona")
        .select("portrait_prenom, description, step_1_frustrations, step_2_transformation, step_3a_objections, frustrations_detail, desires, objections, pitch_short")
        .eq(filterCol, filterVal)
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(2),
      sbService.from("storytelling")
        .select("title, story_type, pitch_short, step_1_raw, step_6_full_story, is_primary")
        .eq(filterCol, filterVal)
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(5),
      sbService.from("offers")
        .select("name, offer_type, problem_surface, problem_deep, promise, sales_line, price_text")
        .eq(filterCol, filterVal)
        .order("updated_at", { ascending: false })
        .limit(3),
    ]);

    const contextText = truncateForPrompt(
      formatContextForAI(ctx, {
        ...CONTEXT_PRESETS.content,
        includeStory: false,
        includePersona: false,
        includeOffers: false,
        includeEditorial: false,
        includeCharter: false,
        includeMirror: false,
      }),
      MAX_CONTEXT_CHARS,
    );

    // ─── Build LIVING MATTER block ───
    const livingMatterParts: string[] = [];
    const personas = (personaRes.data || []).filter((p: any) => p && (p.description || p.step_1_frustrations || p.pitch_short));
    if (personas.length > 0) {
      const lines = personas.map((p: any, i: number) => {
        const name = p.portrait_prenom ? `"${p.portrait_prenom}"` : `Persona ${i + 1}`;
        const frust = (p.step_1_frustrations || "").trim().slice(0, 220);
        const trans = (p.step_2_transformation || "").trim().slice(0, 180);
        const objs = (p.step_3a_objections || "").trim().slice(0, 180);
        const desc = (p.description || p.pitch_short || "").trim().slice(0, 180);
        return `  • ${name}${desc ? ` — ${desc}` : ""}${frust ? `\n      Frustrations : ${frust}` : ""}${trans ? `\n      Transformation visée : ${trans}` : ""}${objs ? `\n      Objections : ${objs}` : ""}`;
      }).join("\n");
      livingMatterParts.push(`PERSONAS (cibles précises) :\n${lines}`);
    }
    const stories = (storytellingRes.data || []).filter((s: any) => s && (s.title || s.pitch_short || s.step_6_full_story || s.step_1_raw));
    if (stories.length > 0) {
      const lines = stories.map((s: any, i: number) => {
        const title = s.title ? `"${s.title}"` : `Récit ${i + 1}`;
        const teaser = (s.pitch_short || s.step_6_full_story || s.step_1_raw || "").trim().slice(0, 200);
        return `  • ${title} (${s.story_type || "récit"})${teaser ? ` — ${teaser}` : ""}`;
      }).join("\n");
      livingMatterParts.push(`STORYTELLINGS DISPONIBLES (anecdotes vécues réutilisables) :\n${lines}`);
    }
    const offers = (offersRes.data || []).filter((o: any) => o && o.name);
    if (offers.length > 0) {
      const lines = offers.map((o: any) => {
        const promise = (o.promise || o.sales_line || "").trim().slice(0, 160);
        const problem = (o.problem_deep || o.problem_surface || "").trim().slice(0, 160);
        return `  • "${o.name}" (${o.offer_type || "offre"})${promise ? ` — promet : ${promise}` : ""}${problem ? ` | résout : ${problem}` : ""}`;
      }).join("\n");
      livingMatterParts.push(`OFFRES (transformations promises) :\n${lines}`);
    }
    const livingMatterBlock = livingMatterParts.length > 0
      ? `\n══════════════════════════════════════\nMATIÈRE VIVANTE DE L'UTILISATRICE\n══════════════════════════════════════\n${livingMatterParts.join("\n\n")}\n\nRÈGLE D'ANCRAGE : au moins 2 idées sur 4 doivent s'ancrer EXPLICITEMENT dans cette matière (citer un persona précis par son prénom OU rebondir sur une anecdote nommée OU servir une offre listée). Une idée trop générique qui ignore cette matière est invalide.\n`
      : "";

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
    const recentPosts = truncateForPrompt([
      calendarPosts ? `Posts planifiés :\n${calendarPosts}` : "",
      generatedContent ? `Contenus générés :\n${generatedContent}` : "",
    ].filter(Boolean).join("\n\n") || "Aucun historique", MAX_HISTORY_CHARS);

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

    // Fallback de cible : profiles.cible est souvent vide alors que le
    // branding (brand_profile.target_description) ou le persona la décrivent.
    // Sans fallback, le bloc AUDIENCE tourne sur "non renseignée" et le
    // modèle invente une cible (audit 12/07 : cible copiée du few-shot).
    const cibleTxt = ctx?.profile?.cible || ctx?.tone?.target_description || ctx?.persona?.description || "non renseignée";
    const activiteTxt = ctx?.profile?.activite || ctx?.profile?.type_activite || "non renseignée";

    // ─── LENSES (4 par tirage ; nonce client pour varier entre clics,
    // exclude pour ne pas remontrer les lentilles déjà affichées) ───
    const lensSeed = `${user.id}|${now.toISOString().slice(0, 10)}|${sujet || ""}|${objectif}|${canal || ""}|${format || ""}|${draw_nonce || ""}`;
    const chosenLenses = pickLenses(lensSeed, 4, excludeLensIds);
    const lensesBlock = chosenLenses
      .map((l, i) => `   ${i + 1}. ${l.label} — ${l.def}`)
      .join("\n");

    // ─── BOLD MODE (mode "Pousse plus loin") ───
    const boldBlock = isBold ? `
═══════════════════════════════════════════════
🔥 MODE "POUSSE PLUS LOIN" ACTIVÉ — sors des sentiers battus
═══════════════════════════════════════════════
Les 4 idées doivent monter d'un cran en audace. Vise le niveau "boldness: bold" ou "provoc" pour AU MOINS 3 idées sur 4 :
- Au moins 1 idée doit contredire FRONTALEMENT une opinion mainstream du secteur (pas un demi-désaccord poli — une position claire, argumentée).
- Au moins 1 idée doit assumer une VULNÉRABILITÉ réelle (échec, doute, prix payé, erreur coûteuse) — sans pathos ni surenchère.
- Au moins 1 idée doit prendre POSITION sur un sujet politique/éthique du métier (rapport au prix, à la diversité, à l'écologie, au pouvoir, à la transparence).
- Tu peux utiliser plus librement la lentille "intersection_angles" pour combiner deux angles éditoriaux qui frottent.

⚠ ETHICAL_GUARDRAILS reste prioritaire : pas de manipulation, pas de honte forcée, pas de discours qui blesse une cible. "Bold" ≠ "méchant" — c'est de la franchise utile, pas de la provocation gratuite.
` : "";

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
EXIGENCE DE PROFONDEUR — anti-tiède (OBLIGATOIRE)
═══════════════════════════════════════════════
INTERDIT (sujets de surface qui n'apprennent rien) :
- "Les 3 erreurs que…", "Top 3 / Top 5", "Voici pourquoi X marche", "La vérité sur Y", "Ce que personne ne dit sur Z", "Le piège du…", "Le mythe du…" sans angle réellement nouveau.

CHAQUE idée DOIT cocher EXPLICITEMENT (en raisonnement interne, NE PAS afficher) ces 3 cases avant d'être validée :
1. TENSION : un conflit / paradoxe / dilemme nommable en une phrase courte ("liberté vs structure", "transparence vs prix", "lenteur vs marché"…). Pas "le marché change" — flou.
2. ENJEU PERSONNEL pour la lectrice : ce qui change concrètement pour elle si elle adopte ou refuse l'idée (un comportement, une croyance, un choix business).
3. PREUVE D'ANCRAGE : un détail qui prouve que ce n'est pas une idée hors-sol. Au choix : (a) un détail technique du métier, (b) une scène précise, (c) une observation terrain, (d) un chiffre FACTUEL (jamais inventé), (e) un élément tiré de la MATIÈRE VIVANTE (persona, storytelling, offre).

⚠ Si l'idée ne peut pas cocher les 3 cases, elle est INVALIDE. Reformule.
Tu N'AFFICHES PAS ces 3 cases dans le JSON — elles sont ton chain-of-thought.

CONTEXTE BRANDING :
${contextText}
${livingMatterBlock}
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

═══════════════════════════════════════════════
MÉTHODE — 4 LENTILLES NARRATIVES (tirées pour CETTE session)
═══════════════════════════════════════════════
Tu produis EXACTEMENT 4 idées, UNE par lentille, dans l'ordre ci-dessous.
Chaque lentille est un angle d'attaque DIFFÉRENT sur le métier ou le sujet.
Si tu sens qu'une lentille ne tient PAS pour ce métier précis, tu peux
exceptionnellement la remplacer par EXPERTISE PRATIQUE — mais explique-le
discrètement dans le champ "lens" (ex: "expertise_pratique (fallback)").

${lensesBlock}

CONTRAINTES CRÉATIVES OPTIONNELLES (à appliquer si pertinent à l'une des 4 lentilles, sinon ignore) :
   🎲 ${seed1}
   🎲 ${seed2}

${WOW_IDEA_EXAMPLES}

RÈGLE ANTI-TU :
Le SUBJECT est rédigé en JE narratif ou IMPERSONNEL (3e personne, on, nominalisations). INTERDIT par défaut : "tu", "te", "t'", "toi", "ton", "ta", "tes", "vous", "votre", "vos".

${sujet ? `Les 4 idées traitent toutes du sujet "${sujet}" mais sous les 4 lentilles ci-dessus, donc 4 angles RADICALEMENT différents (pas 4 variations du même angle).` : `Les 4 lentilles priment sur tout le reste. En bonus, vise une diversité d'objectifs parmi : visibilite, engagement, vente, credibilite, et touche des facettes différentes du métier.`}

${boldBlock}
ROUTES :
Instagram : Post → /creer | Carrousel → /creer?format=carousel | Reel → /creer?format=reel | Story → /creer?format=story
LinkedIn : Post/Carrousel → /creer?format=linkedin
Pinterest : Texte → /creer?canal=pinterest | Visuelle → /creer?canal=pinterest&format=pinterest_visual
Newsletter → /creer?format=newsletter

═══════════════════════════════════════════════
DIVERSITÉ THÉMATIQUE — obligatoire sur le jeu de 4
═══════════════════════════════════════════════
- Les 4 idées couvrent 4 TERRITOIRES différents du métier (ex : matière/technique, relation client, économie/coulisses, vision/valeurs, transmission…). Deux idées sur le même territoire = invalide.
- MAXIMUM 1 idée sur le prix, le tarif ou la justification du coût — sauf si le SUJET fourni est explicitement le prix. La défense du prix est le réflexe le plus prévisible du secteur : ne pas en faire le centre de gravité.
- MAXIMUM 1 idée réutilisant une même scène ou un même décor (pas 3 variations du même moment fort du métier).

═══════════════════════════════════════════════
TEST DE SINGULARITÉ — applique-le sur CHAQUE idée AVANT le test de validité
═══════════════════════════════════════════════
Si quelqu'un qui suit 5 comptes du même secteur sur Insta/LinkedIn aurait déjà vu cette idée formulée à peu près comme ça → invalide, recommence.

Pour passer, l'idée doit avoir AU MOINS UN de ces caractères :
- Un détail technique trop précis pour être générique
- Un angle qu'aucun·e influenceur·euse du secteur ne prendrait (parce que ça ne flatte pas, parce que c'est trop nuancé pour Insta, parce que ça contredit la doxa du secteur lui-même)
- Une formulation qui surprend par sa concrétude ou sa franchise

Note spécifique CONTRE-PIED : si le contre-pied dit "tout le monde fait X mal, en vrai il faut Y", c'est probablement déjà vu. Cherche un contre-pied qui dérange les PAIRS du secteur, pas un contre-pied qui flatte l'audience contre les pairs.

═══════════════════════════════════════════════
TEST DE VALIDITÉ — applique-le sur CHAQUE idée AVANT de la sortir
═══════════════════════════════════════════════
1. PROFONDEUR 3-AXES : tension + enjeu personnel + preuve d'ancrage cochés.
2. ANALOGIE : si l'idée en contient une, vérifie qu'elle tient vraiment. Sinon, change.
3. CONTRE-PIED : la croyance citée doit être vraiment répandue ET le contre-pied factuellement vrai.
4. CHIFFRE : aucun chiffre inventé (RÈGLE DE VÉRITÉ).
5. RETEX en JE : cohérent avec le parcours réel visible dans le contexte branding.
6. MARQUE citée : alignement d'échelle, pas de géants.

CHAMP "lens" : utilise EXACTEMENT l'un de ces identifiants : ${IDEA_LENSES.map(l => l.id).join(", ")}.
CHAMP "boldness" : "safe" (idée engageante mais consensuelle), "bold" (sort des sentiers battus, demande un peu de courage), "provoc" (assume une position qui dérange, vulnérabilité forte ou contre-pied frontal).

Retourne UNIQUEMENT ce JSON (pas de markdown, pas de commentaires, pas de prose avant) :
{
  "ideas": [
    {
      "subject": "Sujet ultra-concret, ancré dans le métier, prêt à écrire (1 phrase claire)",
      "angle": "Nom court de l'angle éditorial (ex: Contre-pied factuel, Micro-scène, Décryptage de concept)",
      "lens": "expertise_pratique|contre_pied_pairs|...",
      "boldness": "safe|bold|provoc",
      "objective_tag": "visibilite|engagement|vente|credibilite",
      "why_it_works": "1 phrase : pourquoi ça résonne avec SA cible spécifique (cite un persona ou une matière vivante quand applicable)"
    }
  ],
  "recommended_format": "${formatLabel}",
  "redirect_route": "route correspondant au format et canal choisis"
}`;

    const usage: UsageSink = {};
    const previousBlock = regenerate_lens && typeof previous_subject === "string" && previous_subject.trim()
      ? ` Version précédente à DÉPASSER (ne la reformule pas, change d'angle à l'intérieur de la lentille) : "${previous_subject.trim().slice(0, 300)}".`
      : "";
    const baseUserMessage = `Génère ${regenerate_lens ? "1" : "4"} idée(s) de contenu (sujet + angle uniquement, PAS de hook ni de brief)${regenerate_lens ? ` pour la lentille "${regenerate_lens}" uniquement, en plus radical que la version précédente.${previousBlock}` : `, UNE PAR LENTILLE dans l'ordre des 4 lentilles fournies (chaque idée renseigne le champ "lens" avec l'identifiant correspondant)`}. Applique successivement : (1) AUDIENCE vs UTILISATRICE, (2) RÈGLE DE VÉRITÉ, (3) RÈGLE D'OR métier, (4) PROFONDEUR 3-AXES (tension + enjeu + ancrage), (5) DIVERSITÉ THÉMATIQUE, (6) TEST DE SINGULARITÉ, (7) TEST DE VALIDITÉ. Si la MATIÈRE VIVANTE est fournie, au moins 2 idées sur 4 doivent l'utiliser explicitement. Réponds UNIQUEMENT avec le JSON demandé, SANS aucune prose, SANS markdown, SANS raisonnement, et commence directement par le caractère {.${isBold ? " MODE BOLD ACTIF — vise l'audace utile sans manipulation." : ""}`;

    const parseIdeas = async (raw: string): Promise<any> => {
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
        return JSON.parse(cleaned);
      } catch {
        // Réparations courantes : virgules trailing + caractères de contrôle.
        const repaired = cleaned
          .replace(/,(\s*[}\]])/g, "$1")
          .replace(/[\x00-\x1F\x7F]/g, " ");
        try {
          return JSON.parse(repaired);
        } catch {
          // Dernier recours : jsonrepair gère les guillemets non échappés,
          // virgules manquantes, retours-ligne dans les strings, etc.
          const { jsonrepair } = await import("npm:jsonrepair@3.8.1");
          return JSON.parse(jsonrepair(cleaned));
        }
      }
    };

    const callAndParse = async (userMessage: string): Promise<any> => {
      const raw = await callAnthropic({
        model: getModelForAction("coaching"),
        system: truncateForPrompt(systemPrompt, MAX_CONTEXT_CHARS + MAX_LIVING_MATTER_CHARS + 12000),
        messages: [{ role: "user", content: userMessage }],
        temperature: 0.8,
        max_tokens: 4000,
      }, usage);
      try {
        return await parseIdeas(raw);
      } catch (parseErr) {
        console.error("Failed to parse content-coaching response:", parseErr, "raw:", raw?.slice(0, 800));
        throw new ParseFailure();
      }
    };

    let result: any;
    try {
      result = await callAndParse(baseUserMessage);
    } catch (e) {
      if (e instanceof ParseFailure) {
        return new Response(JSON.stringify({ error: "Erreur lors de l'analyse. Réessaie." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }

    // ─── Enforcement ancrage matière vivante ───
    // Le prompt exige que 2 idées sur 4 citent la matière vivante, mais la
    // règle peut s'éteindre en silence (audit 12/07 : 0/44 idées ancrées).
    // Vérification déterministe + 1 retry maximum, puis on sert quand même.
    const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const anchorTokens: string[] = [];
    for (const p of personas) if (p.portrait_prenom) anchorTokens.push(normalize(p.portrait_prenom));
    for (const label of [...offers.map((o: any) => o.name), ...stories.map((s: any) => s.title)]) {
      if (!label) continue;
      for (const w of normalize(label).split(/[^a-z0-9]+/)) {
        if (w.length >= 5) anchorTokens.push(w.slice(0, 6));
      }
    }
    const countAnchored = (ideas: any[]) =>
      ideas.filter((i) => {
        const text = normalize(`${i?.subject || ""} ${i?.why_it_works || ""}`);
        return anchorTokens.some((t) => text.includes(t));
      }).length;

    if (!regenerate_lens && livingMatterBlock && anchorTokens.length > 0 && Array.isArray(result?.ideas) && result.ideas.length > 0) {
      let anchored = countAnchored(result.ideas);
      let retried = false;
      if (anchored === 0) {
        retried = true;
        console.warn("[content-coaching][ancrage] 0 idée ancrée dans la matière vivante — retry", { userId: user.id });
        try {
          const retryResult = await callAndParse(
            `${baseUserMessage}\n\nCORRECTION OBLIGATOIRE : ta précédente proposition ignorait totalement la MATIÈRE VIVANTE. Cette fois, au moins 2 idées sur 4 doivent citer EXPLICITEMENT un persona par son prénom, une offre par son nom ou une anecdote listée dans le bloc MATIÈRE VIVANTE.`,
          );
          if (Array.isArray(retryResult?.ideas) && countAnchored(retryResult.ideas) > 0) {
            result = retryResult;
            anchored = countAnchored(result.ideas);
          }
        } catch (retryErr) {
          console.warn("[content-coaching][ancrage] retry échoué, on sert la 1re version", retryErr);
        }
      }
      console.log("[content-coaching][ancrage]", { anchored, total: result.ideas.length, retried });
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

    await logUsage(user.id, "suggestion", "content_coaching", usage.total_tokens, usage.model, workspace_id);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("content-coaching error:", e);
    if (e instanceof AnthropicError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status >= 400 && e.status < 600 ? e.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
