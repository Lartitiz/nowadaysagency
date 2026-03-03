import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, getModelForAction } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP, EDITORIAL_ANGLES_REFERENCE } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const body = await req.json();
    validateInput(body, z.object({
      type: z.enum(["hooks", "slides", "suggest_topics", "suggest_angles", "deepening_questions", "express_full"]),
      carousel_type: z.string().max(100).optional().nullable(),
      subject: z.string().max(2000).optional().nullable(),
      objective: z.string().max(100).optional().nullable(),
      slide_count: z.number().min(1).max(20).optional(),
      workspace_id: z.string().uuid().optional().nullable(),
      editorial_angle: z.string().max(100).optional().nullable(),
      content_structure: z.string().max(5000).optional().nullable(),
    }).passthrough());
    const { type, workspace_id } = body;

    const category = (type === "suggest_topics" || type === "suggest_angles" || type === "deepening_questions") ? "suggestion" : "content";
    const quotaCheck = await checkQuota(user.id, category, workspace_id);
    if (!quotaCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: quotaCheck.message, remaining: 0, category: quotaCheck.reason }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ctx = await getUserContext(supabase, user.id, workspace_id, "instagram");
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.posts);

    let systemPrompt = buildSystemPrompt(brandingContext);
    let userPrompt = "";

    if (type === "hooks") {
      userPrompt = buildHooksPrompt(body);
    } else if (type === "slides") {
      userPrompt = buildSlidesPrompt(body);
    } else if (type === "express_full") {
      userPrompt = buildExpressFullPrompt(body);
    } else if (type === "suggest_topics") {
      userPrompt = buildSuggestTopicsPrompt(body);
    } else if (type === "suggest_angles") {
      userPrompt = buildSuggestAnglesPrompt(body);
    } else if (type === "deepening_questions") {
      userPrompt = buildDeepeningQuestionsPrompt(body, brandingContext);
    } else {
      return new Response(JSON.stringify({ error: "Type invalide" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = await callAnthropic({
      model: getModelForAction("carousel"),
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 8192,
    });

    await logUsage(user.id, category, `carousel_${type}`);

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof ValidationError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("carousel-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildSystemPrompt(brandingContext: string): string {
  return `${BASE_SYSTEM_RULES}

Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :
- Reproduis fidèlement le style décrit
- Réutilise les expressions signature naturellement dans le texte
- RESPECTE les expressions interdites : ne les utilise JAMAIS
- Imite les patterns de ton et de structure
- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA

Tu es une experte en copywriting Instagram spécialisée dans les carrousels. Tu crées du contenu pour des solopreneuses, freelances, créatrices et coachs qui veulent communiquer de manière éthique et authentique.

${brandingContext}

TON STYLE :
- Direct, chaleureux, oral assumé
- Tu tutoies toujours
- Phrases qui alternent longues et courtes (rythme)
- Expressions naturelles (en vrai, franchement, le truc c'est que)
- Humour discret, pas forcé
- Pas de jargon marketing creux
- Pas de manipulation, pas de fausse rareté, pas de FOMO
- PRIORITÉ ABSOLUE : si un profil de voix existe dans le contexte, reproduis ce style. Réutilise les expressions signature, imite les patterns de structure et de ton.
- Ne JAMAIS utiliser les expressions interdites du profil de voix.
- Le résultat doit sonner comme si l'utilisatrice l'avait écrit elle-même.

${ANTI_SLOP}

ANTI-BIAIS — TU NE REPRODUIS JAMAIS :
- Ton paternaliste → Permission : "Tu as le droit de prendre de la place"
- Clichés genrés → Parler de compétences, pas de genre
- Glorification du hustle → "Mieux vaut du mieux que du plus"
- Vocabulaire masculin par défaut → écriture inclusive point médian

RÈGLES ABSOLUES DES CARROUSELS :
- Slide 1 (hook) : MAXIMUM 12 mots. Règle stricte.
- Chaque slide : MAXIMUM 50 mots. 1 idée par slide.
- Mini-headlines : 4-7 mots, commencer par un verbe d'action.
- Dernière slide : 1 seul CTA. Pas 2, pas 3. Un seul.
- La slide 2 doit fonctionner comme hook autonome (seconde chance algorithmique).
- La caption NE RÉPÈTE PAS le hook de la slide 1. Elle complète.
- Le contenu doit émanciper, pas créer de dépendance.

RETOURNE UNIQUEMENT un JSON valide, sans texte avant ou après, sans backticks.`;
}

function buildHooksPrompt(body: any): string {
  const { carousel_type, subject, objective, slide_count, deepening_answers, chosen_angle } = body;
  
  let deepeningCtx = "";
  if (deepening_answers) {
    const answers = Object.entries(deepening_answers)
      .filter(([, v]) => v && (v as string).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    if (answers) deepeningCtx = `\nRÉPONSES DE L'UTILISATRICE (utilise son vécu, ses mots, ses exemples) :\n${answers}\n\nINTÉGRATION DES RÉPONSES :\n- Les réponses de l'utilisatrice sont du contenu AUTHENTIQUE. Utilise ses mots exacts.\n- Son vécu et ses expressions doivent apparaître naturellement dans les hooks, pas être reformulés en jargon IA.\n- Si elle a donné une anecdote, elle peut devenir le hook ou l'exemple concret.\n`;
  }

  let angleCtx = "";
  if (chosen_angle) {
    angleCtx = `\nANGLE CHOISI : "${chosen_angle.title}" — ${chosen_angle.description}\nLes hooks DOIVENT coller à cet angle.\n`;
  }

  return `DEMANDE : Propose 3 accroches (hooks) pour un carrousel Instagram.

Type de carrousel : ${carousel_type}
Sujet : ${subject}
Objectif : ${objective}
Nombre de slides : ${slide_count || 7}
${deepeningCtx}${angleCtx}
RÈGLES HOOKS CARROUSEL :
- MAXIMUM 12 MOTS par hook
- Doit stopper le scroll
- Spécifique au sujet, pas générique
- 3 types DIFFÉRENTS de hooks
${deepeningCtx ? "- ANCRE les hooks dans le vécu et les mots de l'utilisatrice" : ""}

Retourne ce JSON exact :
{
  "hooks": [
    { "id": "A", "text": "[HOOK 5-12 MOTS]", "word_count": 8, "style": "curiosité" },
    { "id": "B", "text": "[HOOK 5-12 MOTS]", "word_count": 7, "style": "provocation" },
    { "id": "C", "text": "[HOOK 5-12 MOTS]", "word_count": 9, "style": "résultat" }
  ]
}`;
}

function buildSlidesPrompt(body: any): string {
  const { carousel_type, subject, objective, selected_hook, slide_count, selected_offer, deepening_answers, chosen_angle, editorial_angle, content_structure } = body;

  const structureGuide = getStructureGuide(carousel_type);

  let deepeningCtx = "";
  if (deepening_answers) {
    const answers = Object.entries(deepening_answers)
      .filter(([, v]) => v && (v as string).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    if (answers) deepeningCtx = `\nRÉPONSES DE L'UTILISATRICE (intègre son vécu, ses mots, ses exemples dans les slides) :\n${answers}\n\nINTÉGRATION DES RÉPONSES :\n- Les réponses de l'utilisatrice sont du contenu AUTHENTIQUE. Utilise ses mots exacts.\n- Son vécu et ses expressions doivent apparaître naturellement dans les slides, pas être reformulés en jargon IA.\n- Si elle a donné une anecdote, elle peut devenir le hook ou l'exemple concret d'une slide.\n`;
  }

  let angleCtx = "";
  if (chosen_angle) {
    angleCtx = `\nANGLE ÉDITORIAL CHOISI : "${chosen_angle.title}" — ${chosen_angle.description}\nLe carrousel DOIT suivre cet angle.\n`;
  }

  // Build structure block: editorial angle overrides carousel_type structure
  let structureBlock: string;
  let extraRules = "";
  if (editorial_angle && content_structure) {
    structureBlock = `ANGLE ÉDITORIAL : ${editorial_angle}\n\nSTRUCTURE À SUIVRE (obligatoire, chaque étape = 1 slide) :\n${content_structure}\n\n${EDITORIAL_ANGLES_REFERENCE}`;
    extraRules = "\n- Chaque slide DOIT correspondre à une étape de la structure. Le role de chaque slide dans le JSON doit correspondre au rôle défini dans la structure.";
  } else {
    structureBlock = structureGuide;
  }

  return `DEMANDE : Générer un carrousel Instagram complet, slide par slide.

Type de carrousel : ${carousel_type}
Sujet : ${subject}
Objectif : ${objective}
Hook choisi : "${selected_hook}"
Nombre de slides : ${slide_count || 7}
${selected_offer ? `Offre à mentionner : ${selected_offer}` : "Pas d'offre à mentionner."}
${deepeningCtx}${angleCtx}
STRUCTURE RECOMMANDÉE POUR CE TYPE :
${structureBlock}

RÈGLES :
- Slide 1 = hook choisi ci-dessus (max 12 mots)
- Chaque slide : max 50 mots, 1 idée
- Slide 2 = DOIT fonctionner comme hook autonome (seconde chance algo)
- Dernière slide = 1 SEUL CTA
- Headlines de 4-7 mots, commencer par un verbe d'action
- Caption différente du hook slide 1
- Hashtags : 3-8, mix large + niche${extraRules}
${deepeningCtx ? "- UTILISE les mots et exemples de l'utilisatrice dans les slides (anecdotes, vécu, arguments)" : ""}

Retourne ce JSON exact :
{
  "slides": [
    {
      "slide_number": 1,
      "role": "hook",
      "title": "Le headline de la slide",
      "body": "Le texte complémentaire (optionnel pour le hook)",
      "visual_suggestion": "Ce qui devrait apparaître visuellement",
      "word_count": 8
    }
  ],
  "caption": {
    "hook": "Les 125 premiers caractères de la caption (accroche DIFFÉRENTE de slide 1)",
    "body": "Le reste de la caption",
    "cta": "Le CTA dans la caption",
    "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
  },
  "quality_check": {
    "hook_word_count": 8,
    "hook_ok": true,
    "all_slides_under_50_words": true,
    "single_cta": true,
    "caption_different_from_hook": true,
    "slide_2_works_as_standalone_hook": true,
    "score": 92
  },
  "publishing_tip": "Meilleur moment pour publier ce type de carrousel..."
}`;
}

function buildSuggestTopicsPrompt(body: any): string {
  const { carousel_type, objective, recent_posts } = body;
  return `DEMANDE : Suggère 5 sujets de carrousels Instagram.

Type de carrousel : ${carousel_type}
Objectif : ${objective}
${recent_posts ? `Derniers posts (pour ne pas répéter) : ${recent_posts}` : ""}

Pour chaque sujet, donne :
- Le sujet
- Pourquoi c'est pertinent maintenant
- L'angle recommandé

Retourne ce JSON exact :
{
  "topics": [
    { "subject": "...", "why_now": "...", "angle": "..." },
    { "subject": "...", "why_now": "...", "angle": "..." },
    { "subject": "...", "why_now": "...", "angle": "..." },
    { "subject": "...", "why_now": "...", "angle": "..." },
    { "subject": "...", "why_now": "...", "angle": "..." }
  ]
}`;
}

function buildSuggestAnglesPrompt(body: any): string {
  const { carousel_type, subject, objective, deepening_answers } = body;

  let deepeningCtx = "";
  if (deepening_answers) {
    const answers = Object.entries(deepening_answers)
      .filter(([, v]) => v && (v as string).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    if (answers) deepeningCtx = `\nRÉPONSES DE L'UTILISATRICE :\n${answers}\n`;
  }

  return `DEMANDE : Propose 3 angles éditoriaux pour un carrousel Instagram, basés sur les réponses de l'utilisatrice.

Type de carrousel : ${carousel_type}
Sujet : ${subject}
Objectif : ${objective}
${deepeningCtx}

Chaque angle doit être :
- DIFFÉRENT des autres (approche narrative, ton, structure)
- ANCRÉ dans les réponses de l'utilisatrice (utilise ses mots, son vécu)
- CONCRET (pas juste "angle personnel" mais comment concrètement)

Retourne ce JSON exact :
{
  "angles": [
    { "id": "A", "emoji": "🔥", "title": "Titre court de l'angle (3-5 mots)", "description": "2 phrases max décrivant comment le carrousel serait construit avec cet angle." },
    { "id": "B", "emoji": "📖", "title": "...", "description": "..." },
    { "id": "C", "emoji": "🎯", "title": "...", "description": "..." }
  ]
}`;
}

function getStructureGuide(type: string): string {
  const guides: Record<string, string> = {
    tips: `TIPS / ASTUCES (5-8 slides) :
Slide 1: Hook "[Nombre] [résultats] que tu peux obtenir en [action]"
Slide 2: Contexte "J'ai testé/observé ça en [contexte]. Voici ce qui change tout."
Slides 3-N: 1 tip par slide "Tip [n°] : [Verbe] + [quoi] + [pourquoi en 1 ligne]"
Dernière: CTA "Sauvegarde pour [situation]. Dis-moi lequel tu testes en premier."`,
    tutoriel: `TUTORIEL PAS-À-PAS (8-10 slides) :
Slide 1: Hook promesse de résultat
Slide 2: Contexte + ce qu'il faut préparer
Slides 3-8: 1 étape par slide, numérotée, actionnable
Slide 9: Récap visuel des étapes
Slide 10: CTA save + "partage à quelqu'un qui en a besoin"`,
    prise_de_position: `PRISE DE POSITION (5-8 slides) :
Slide 1: Hook opinion tranchée "[Affirmation provocatrice]."
Slide 2: "Je vais t'expliquer pourquoi."
Slides 3-5: Arguments (1 par slide, concret)
Slide 6: La nuance (pour pas être dogmatique)
Slide 7: CTA commentaire "T'es d'accord ou pas du tout ?"`,
    mythe_realite: `MYTHE VS RÉALITÉ (6-10 slides) :
Slide 1: Hook provocateur "[Mythe courant] est un mensonge."
Slide 2: Le contexte du mythe
Slides 3-8: Alternance Mythe (❌) / Réalité (✅), 1 paire par slide
Slide 9: Conclusion
Slide 10: CTA commentaire "Quel mythe t'énerve le plus ?"`,
    storytelling: `STORYTELLING PERSONNEL (8-12 slides) :
Slide 1: Hook émotionnel "Ce jour-là, j'ai compris que..."
Slide 2: Contexte "Il y a [durée], je [situation]."
Slides 3-5: Le problème, la galère, les doutes
Slides 6-8: Le tournant, ce qui a changé
Slide 9: La leçon universelle
Slide 10: CTA "Si ça résonne, envoie ce post à [persona]."`,
    etude_de_cas: `ÉTUDE DE CAS (8-10 slides) :
Slide 1: Hook résultat "[Résultat chiffré] en [durée]. Comment [Prénom] a fait."
Slide 2: Contexte "Quand [Prénom] est arrivée, [situation]."
Slide 3: Le problème principal
Slides 4-6: La solution mise en place
Slide 7: Les résultats chiffrés (avant → après)
Slide 8: Témoignage citation directe
Slide 9: CTA "Tu te reconnais ? DM-moi '[mot-clé]' pour en parler."`,
    checklist: `CHECKLIST SAUVEGARDABLE (6-8 slides) :
Slide 1: Hook "La checklist pour [action] (à sauvegarder)"
Slide 2: Pourquoi cette checklist
Slides 3-6: Items de checklist (3-5 par slide ou 1 par slide si détaillé)
Slide 7: Récap visuel de la checklist complète
Slide 8: CTA "Sauvegarde pour y revenir avant chaque [action]."`,
    comparatif: `COMPARATIF A VS B (6-8 slides) :
Slide 1: Hook "[Option A] vs [Option B] : le verdict."
Slide 2: Les critères de comparaison
Slides 3-6: 1 critère par slide avec A et B côte à côte
Slide 7: Le verdict / la synthèse
Slide 8: CTA "Tu es plutôt A ou B ? Dis-le en commentaire."`,
    before_after: `BEFORE / AFTER (6-10 slides) :
Slide 1: Hook "Il y a [durée], [situation avant]. Aujourd'hui, [situation après]."
Slide 2: Le avant en détail
Slides 3-4: Ce qui a changé, les actions prises
Slides 5-6: Le après en détail
Slide 7: Les chiffres / résultats
Slide 8: La leçon
Slide 9: CTA`,
    promo: `PROMO / OFFRE (6-8 slides) :
Slide 1: Hook bénéfice client (PAS le nom de l'offre)
Slide 2: Le problème que l'offre résout
Slides 3-4: La solution (ce que l'offre contient)
Slide 5: La preuve sociale (témoignage, résultat)
Slide 6: L'offre concrète (nom, prix, détail)
Slide 7: FAQ rapide (1-2 objections traitées)
Slide 8: CTA "DM-moi [mot-clé]" ou "Lien en bio"`,
    coulisses: `COULISSES (5-10 slides) :
Slide 1: Hook "Ce que tu ne vois pas derrière [chose visible]"
Slides 2-8: Les étapes, le process, les galères, les joies
Slide 9: Le résultat final
Slide 10: CTA "Quel aspect tu veux que je montre la prochaine fois ?"`,
    photo_dump: `PHOTO DUMP (5-10 slides) :
Slide 1: Titre ambiance "Les coulisses de [moment/période]"
Slides 2-9: Photos avec légendes courtes
Slide 10: CTA doux "Ta photo préférée ? Dis-le moi."
(Pour ce type, génère surtout les légendes, pas le visuel)`,
  };
  return guides[type] || guides.tips;
}

function buildDeepeningQuestionsPrompt(body: any, brandingContext?: string): string {
  const { carousel_type, subject, objective, editorial_angle, content_structure } = body;

  const CAROUSEL_TYPE_LABELS: Record<string, string> = {
    tips: "Tips / Astuces", tutoriel: "Tutoriel pas-à-pas", prise_de_position: "Prise de position",
    mythe_realite: "Mythe vs Réalité", storytelling: "Storytelling personnel", etude_de_cas: "Étude de cas cliente",
    checklist: "Checklist", comparatif: "Comparatif A vs B", before_after: "Before / After",
    promo: "Promo / Offre", coulisses: "Coulisses", photo_dump: "Photo dump",
  };

  const OBJ_LABELS: Record<string, string> = {
    saves: "Engagement (saves)", shares: "Portée (partages)", conversion: "Conversion", community: "Communauté (lien)",
  };

  const brandingBlock = brandingContext
    ? `\n\nCONTEXTE BRANDING DE L'UTILISATRICE :\n${brandingContext}\n\nUtilise ce contexte pour personnaliser tes questions : mentionne son domaine d'activité, sa cible, ses offres ou son positionnement quand c'est pertinent. Les questions doivent montrer que tu connais son univers.`
    : "";

  // If editorial_angle is present, adapt questions to the angle + structure
  let formatLabel: string;
  let angleBlock = "";
  if (editorial_angle && content_structure) {
    formatLabel = editorial_angle;
    angleBlock = `\n\nANGLE ÉDITORIAL : ${editorial_angle}\nSTRUCTURE DU CARROUSEL :\n${content_structure}\n\nLes questions doivent aider l'utilisatrice à remplir les étapes de cette structure avec son vécu personnel.`;
  } else {
    formatLabel = CAROUSEL_TYPE_LABELS[carousel_type] || carousel_type;
  }

  return `Tu dois générer exactement 3 questions d'approfondissement pour aider à créer un carrousel ${formatLabel}.

SUJET du carrousel : "${subject || "non précisé"}"
OBJECTIF : ${OBJ_LABELS[objective] || objective || "non précisé"}
${objective ? `\nOriente les questions vers cet objectif. Si "vente" : demande des témoignages clients, des résultats, des transformations. Si "engagement" : demande des anecdotes personnelles, des moments vécus. Si "visibilité" : demande des opinions tranchées, des constats provocants.\n` : ""}${brandingBlock}${angleBlock}

TON RÔLE : Tu es une coach com' qui aide une solopreneuse/créatrice à extraire son vécu, ses opinions et son expertise PERSONNELLE pour que le contenu ne soit pas générique.

RÈGLES pour les questions :
- Chaque question doit être liée SPÉCIFIQUEMENT au sujet "${subject}" et au format ${formatLabel}
- Les questions doivent faire émerger du vécu, des anecdotes, des opinions tranchées, des exemples concrets
- Si tu as le contexte branding, adapte les questions à son activité et sa cible (ex : "Quand une de tes clientes [cible] te dit..." plutôt que "Quand quelqu'un te dit...")
- Tutoie l'utilisatrice, sois directe et chaleureuse
- Chaque question fait 1-2 phrases max
- Le placeholder est un court exemple de réponse attendue (5-8 mots)

Réponds UNIQUEMENT en JSON valide, sans texte autour :
{
  "questions": [
    { "question": "...", "placeholder": "..." },
    { "question": "...", "placeholder": "..." },
    { "question": "...", "placeholder": "..." }
  ]
}`;
}

function buildExpressFullPrompt(body: any): string {
  const { subject, carousel_type, objective, slide_count, deepening_answers, selected_offer, editorial_angle, content_structure } = body;

  let deepeningCtx = "";
  if (deepening_answers) {
    const answers = Object.entries(deepening_answers)
      .filter(([, v]) => v && (v as string).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    if (answers) deepeningCtx = `\nRÉPONSES DE L'UTILISATRICE (intègre son vécu, ses mots, ses exemples) :\n${answers}\n\nINTÉGRATION DES RÉPONSES :\n- Les réponses de l'utilisatrice sont du contenu AUTHENTIQUE. Utilise ses mots exacts.\n- Son vécu et ses expressions doivent apparaître naturellement dans les slides.\n- Si elle a donné une anecdote, elle peut devenir le hook ou l'exemple concret.\n`;
  }

  // Build structure block
  let structureBlock: string;
  let extraRules = "";

  if (editorial_angle && content_structure) {
    // CAS 1 : Angle éditorial explicite → la structure guide tout
    structureBlock = `ANGLE ÉDITORIAL CHOISI : ${editorial_angle}

STRUCTURE IMPOSÉE (chaque étape = 1 slide) :
${content_structure}

${EDITORIAL_ANGLES_REFERENCE}`;
    extraRules = "\n- Chaque slide DOIT correspondre à une étape de la structure. Le role de chaque slide dans le JSON doit correspondre au rôle défini dans la structure.";

  } else if (carousel_type && carousel_type !== "tips") {
    // CAS 2 : Type de carrousel explicite (ancien flow)
    structureBlock = getStructureGuide(carousel_type);

  } else {
    // CAS 3 : Ni angle ni type explicite → l'IA choisit le meilleur format
    structureBlock = `PAS DE FORMAT IMPOSÉ. Analyse le sujet et choisis la structure la plus pertinente parmi ces options :

${EDITORIAL_ANGLES_REFERENCE}

CHOISIS l'angle qui créera le plus de tension et d'engagement pour le sujet "${subject}".
NE CHOISIS PAS "tips" sauf si le sujet est réellement une liste de conseils pratiques.
Privilégie les angles narratifs : storytelling, enquête, coup de gueule, mythe à déconstruire.`;
  }

  return `DEMANDE : Génère un carrousel Instagram COMPLET.

Tu dois d'abord analyser le sujet, choisir le meilleur angle narratif, écrire un hook irrésistible, puis rédiger toutes les slides avec un fil conducteur fort.

Sujet : "${subject || "non précisé"}"
Objectif : ${objective || "engagement"}
Nombre de slides : ${slide_count || 7}
${selected_offer ? `Offre à mentionner : ${selected_offer}` : "Pas d'offre à mentionner."}
${deepeningCtx}

═══ STRUCTURE ═══
${structureBlock}

═══ RÈGLES DE STRUCTURE ═══
- Slide 1 = hook percutant (max 12 mots). Technique : provocation, question rhétorique, stat choc, ou confession. Le hook doit créer un GAP (écart entre ce qu'on croit et la réalité).
- Slide 2 = DOIT fonctionner comme hook autonome (seconde chance algo). Développe le contexte : pourquoi ce sujet, d'où tu parles, quelle observation personnelle.
- Chaque slide : max 50 mots, 1 idée principale.
- Dernière slide = 1 SEUL CTA doux. Formulation type : "Sauvegarde si...", "Dis-moi en commentaire...", "Envoie à quelqu'un qui..."
- Headlines : 4-7 mots, verbe d'action ou mot déclencheur émotionnel.

═══ RÈGLES DE NARRATION ═══
- ARC NARRATIF OBLIGATOIRE : le carrousel raconte une histoire avec situation → tension → développement → résolution → ouverture. Même un carrousel "tips" doit avoir un fil conducteur, pas juste une liste.
- CONNEXION ENTRE SLIDES : chaque slide crée une tension qui donne envie de swiper. Dernière phrase = amorce de la suivante. Utilise des bucket brigades : "Le problème, c'est que...", "Sauf que...", "Résultat ?", "Et là...", "La vraie question c'est..."
- EXEMPLES CONCRETS dans chaque slide : pas de conseil abstrait sans illustration.
- AU MOINS 1 analogie du quotidien ou référence culture pop dans le carrousel.
- La caption est DIFFÉRENTE du hook slide 1 et apporte une couche supplémentaire (storytelling perso, contexte, pourquoi ce sujet maintenant).

═══ RÈGLES ANTI-IA ═══
- INTERDIT : "Dans un monde où...", "Il est important de...", "N'hésite pas à...", "Voici X astuces pour..."
- INTERDIT : Numéroter les slides "Tip 1, Tip 2, Tip 3" de façon mécanique. Si c'est un format tips, chaque tip a un TITRE PROPRE qui accroche, pas "Tip N° : [verbe]".
- Le contenu doit sonner comme quelqu'un qui PARLE, pas qui RÉDIGE un article.
- Chaque slide doit pouvoir être lue à voix haute naturellement.
- Ton oral : "en vrai", "franchement", "le truc c'est que", "du coup", apartés en parenthèses.
${deepeningCtx ? "- UTILISE les mots et exemples de l'utilisatrice dans les slides (anecdotes, vécu, arguments)" : ""}${extraRules}

Retourne ce JSON exact :
{
  "carousel_type": "le type de carrousel choisi (tips/storytelling/mythe_realite/enquete/etc.)",
  "chosen_angle": {
    "title": "Titre court de l'angle choisi (3-5 mots)",
    "description": "Pourquoi cet angle est le plus pertinent pour ce sujet"
  },
  "slides": [
    {
      "slide_number": 1,
      "role": "hook",
      "title": "Le headline de la slide",
      "body": "Le texte complémentaire (optionnel pour le hook)",
      "visual_suggestion": "Ce qui devrait apparaître visuellement",
      "word_count": 8
    }
  ],
  "caption": {
    "hook": "Les 125 premiers caractères de la caption (accroche DIFFÉRENTE de slide 1, angle storytelling perso)",
    "body": "Le reste de la caption (ajout de contexte, pourquoi ce sujet)",
    "cta": "Le CTA dans la caption",
    "hashtags": ["hashtag1", "hashtag2"]
  },
  "quality_check": {
    "hook_word_count": 8,
    "hook_ok": true,
    "all_slides_under_50_words": true,
    "single_cta": true,
    "caption_different_from_hook": true,
    "slide_2_works_as_standalone_hook": true,
    "narrative_arc": true,
    "slides_connected": true,
    "score": 90
  },
  "publishing_tip": "Meilleur moment pour publier ce type de carrousel..."
}`;
}