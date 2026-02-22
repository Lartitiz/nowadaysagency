import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const body = await req.json();
    const { type } = body;

    const category = type === "suggest_topics" ? "suggestion" : "content";
    const quotaCheck = await checkQuota(user.id, category);
    if (!quotaCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: quotaCheck.message, remaining: 0, category: quotaCheck.reason }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ctx = await getUserContext(supabase, user.id);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.posts);

    let systemPrompt = buildSystemPrompt(brandingContext);
    let userPrompt = "";

    if (type === "hooks") {
      userPrompt = buildHooksPrompt(body);
    } else if (type === "slides") {
      userPrompt = buildSlidesPrompt(body);
    } else if (type === "suggest_topics") {
      userPrompt = buildSuggestTopicsPrompt(body);
    } else {
      return new Response(JSON.stringify({ error: "Type invalide" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = await callAnthropic({
      model: "claude-opus-4-6",
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 8192,
    });

    await logUsage(user.id, category, `carousel_${type}`);

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("carousel-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildSystemPrompt(brandingContext: string): string {
  return `Tu es une experte en copywriting Instagram spécialisée dans les carrousels. Tu crées du contenu pour des solopreneuses, freelances, créatrices et coachs qui veulent communiquer de manière éthique et authentique.

${brandingContext}

TON STYLE :
- Direct, chaleureux, oral assumé
- Tu tutoies toujours
- Phrases qui alternent longues et courtes (rythme)
- Expressions naturelles (en vrai, franchement, le truc c'est que)
- Humour discret, pas forcé
- Pas de jargon marketing creux
- Pas de manipulation, pas de fausse rareté, pas de FOMO

ANTI-SLOP — TU NE GÉNÈRES JAMAIS :
- "Dans un monde où…", "N'hésitez pas à…", "Il est important de noter que…"
- "Plongeons dans…", "Sans plus attendre", "En outre", "Par conséquent"
- "Cela étant dit", "Force est de constater", "Il convient de", "En définitive"
- "Décortiquons", "Explorons", "Découvrons", "Passons à", "Abordons"
- Tout tiret cadratin (—) → remplacer par : ou ;
SI TU DÉTECTES CES PATTERNS DANS TON OUTPUT, RÉÉCRIS AVANT DE RETOURNER.

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
  const { carousel_type, subject, objective, slide_count } = body;
  return `DEMANDE : Propose 3 accroches (hooks) pour un carrousel Instagram.

Type de carrousel : ${carousel_type}
Sujet : ${subject}
Objectif : ${objective}
Nombre de slides : ${slide_count || 7}

RÈGLES HOOKS CARROUSEL :
- MAXIMUM 12 MOTS par hook
- Doit stopper le scroll
- Spécifique au sujet, pas générique
- 3 types DIFFÉRENTS de hooks

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
  const { carousel_type, subject, objective, selected_hook, slide_count, selected_offer } = body;

  const structureGuide = getStructureGuide(carousel_type);

  return `DEMANDE : Générer un carrousel Instagram complet, slide par slide.

Type de carrousel : ${carousel_type}
Sujet : ${subject}
Objectif : ${objective}
Hook choisi : "${selected_hook}"
Nombre de slides : ${slide_count || 7}
${selected_offer ? `Offre à mentionner : ${selected_offer}` : "Pas d'offre à mentionner."}

STRUCTURE RECOMMANDÉE POUR CE TYPE :
${structureGuide}

RÈGLES :
- Slide 1 = hook choisi ci-dessus (max 12 mots)
- Chaque slide : max 50 mots, 1 idée
- Slide 2 = DOIT fonctionner comme hook autonome (seconde chance algo)
- Dernière slide = 1 SEUL CTA
- Headlines de 4-7 mots, commencer par un verbe d'action
- Caption différente du hook slide 1
- Hashtags : 3-8, mix large + niche

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
