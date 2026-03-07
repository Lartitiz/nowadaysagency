import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildPreGenFallback } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, getModelForAction, getModelForRichContent } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP, EDITORIAL_ANGLES_REFERENCE, CHAIN_OF_THOUGHT, DEPTH_LAYER, PREGEN_INJECTION_RULES } from "../_shared/copywriting-prompts.ts";
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
      photos: z.array(z.object({ base64: z.string() })).max(10).optional(),
      photo_description: z.string().max(2000).optional().nullable(),
    }).passthrough());
    const { type, workspace_id, launch_context } = body;

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

    // Fallback: inject branding as deepening_answers if none provided
    if (!body.deepening_answers && (type === "express_full" || type === "slides" || type === "hooks")) {
      const fallback = buildPreGenFallback(ctx);
      if (fallback) {
        body.deepening_answers = {
          anecdote: fallback.anecdote ? `${fallback.anecdote} (élément tiré du branding)` : undefined,
          emotion: fallback.emotion ? `${fallback.emotion} (élément tiré du branding)` : undefined,
          conviction: fallback.conviction ? `${fallback.conviction} (élément tiré du branding)` : undefined,
        };
      }
    }

    let systemPrompt = buildSystemPrompt(brandingContext);

    // Inject launch context if present
    if (launch_context && (type === "express_full" || type === "hooks" || type === "slides")) {
      const lc = launch_context;
      systemPrompt += `\n\nCONTEXTE LANCEMENT :\n- Phase : ${lc.phase || "?"}\n- Chapitre : ${lc.chapter_label || "?"}\n- Phase mentale audience : ${lc.audience_phase || "?"}\n- Objectif du slot : ${lc.objective || "?"}\n- Angle suggéré : ${lc.angle_suggestion || "?"}\nCONSIGNE : adapte le contenu à cette phase du lancement. Un contenu de phase "vente" n'a pas le même ton qu'un contenu de phase "teasing".`;
    }

    let userPrompt = "";

    if (type === "hooks") {
      userPrompt = buildHooksPrompt(body);
    } else if (type === "slides") {
      userPrompt = buildSlidesPrompt(body);
    } else if (type === "express_full") {
      // ── Mix carousel mode ──
      if (body.carousel_type === "mix") {
        const mixPrompt = buildMixCarouselPrompt(body);
        let content: string;

        if (body.photos && body.photos.length > 0) {
          const messageContent: any[] = [];
          
          // 1. Brief créatif EN PREMIER (avant les photos)
          messageContent.push({
            type: "text",
            text: `BRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer TOUT le carrousel.\n\nObjectif : ${body.objective || "engagement"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}\n\nVoici ${body.photos.length} photo(s) à intégrer dans le carrousel :`,
          });

          // 2. Photos
          for (const photo of body.photos.slice(0, 10)) {
            if (photo.base64) {
              const raw = photo.base64.replace(/^data:image\/[a-z]+;base64,/, "");
              messageContent.push({
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: raw },
              });
            }
          }

          // 3. Instruction finale après les photos
          messageContent.push({
            type: "text",
            text: `Analyse ces ${body.photos.length} photo(s) et crée un carrousel mixte qui respecte le brief créatif ci-dessus. Le concept "${body.subject || ""}" doit être la colonne vertébrale de chaque slide.`,
          });

          content = await callAnthropic({
            model: getModelForRichContent("carousel", !!(body.deepening_answers && Object.values(body.deepening_answers).some(v => v && (v as string).trim().length > 50))),
            system: systemPrompt + "\n\n" + mixPrompt,
            messages: [{ role: "user", content: messageContent }],
            max_tokens: 8192,
          });
        } else {
          const textPrompt = mixPrompt + `\n\nBRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer tout le carrousel.\n\nDescription des photos : "${body.photo_description || "non fournie"}"\nNombre de slides estimé : ${body.slide_count || 8}\nObjectif : ${body.objective || "engagement"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}`;

          content = await callAnthropic({
            model: getModelForRichContent("carousel", !!(body.deepening_answers && Object.values(body.deepening_answers).some(v => v && (v as string).trim().length > 50))),
            system: systemPrompt,
            messages: [{ role: "user", content: textPrompt }],
            max_tokens: 8192,
          });
        }

        await logUsage(user.id, category, "carousel_mix");
        return new Response(JSON.stringify({ content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Photo carousel mode ──
      if (body.carousel_type === "photo") {
        const photoPrompt = buildPhotoCarouselPrompt(body);
        let content: string;

        if (body.photos && body.photos.length > 0) {
          // Vision mode: send photos to Claude
          const messageContent: any[] = [];
          for (const photo of body.photos.slice(0, 10)) {
            if (photo.base64) {
              // Strip data:image/jpeg;base64, prefix if present
              const raw = photo.base64.replace(/^data:image\/[a-z]+;base64,/, "");
              messageContent.push({
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: raw },
              });
            }
          }
          messageContent.push({
            type: "text",
            text: `Voici ${body.photos.length} photo(s) pour un carrousel photo Instagram.\n\nSujet : "${body.subject || "non précisé"}"\nObjectif : ${body.objective || "engagement"}\nNombre de slides : ${body.photos.length}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}\n\nAnalyse chaque photo et génère le carrousel photo.`,
          });

          content = await callAnthropic({
            model: getModelForAction("carousel"),
            system: systemPrompt + "\n\n" + photoPrompt,
            messages: [{ role: "user", content: messageContent }],
            max_tokens: 8192,
          });
        } else {
          // Text-only mode: description without actual photos
          const textPrompt = photoPrompt + `\n\nSujet : "${body.subject || "non précisé"}"\nDescription des photos : "${body.photo_description || "non fournie"}"\nNombre de slides estimé : ${body.slide_count || 6}\nObjectif : ${body.objective || "engagement"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}`;

          content = await callAnthropic({
            model: getModelForAction("carousel"),
            system: systemPrompt,
            messages: [{ role: "user", content: textPrompt }],
            max_tokens: 8192,
          });
        }

        await logUsage(user.id, category, "carousel_photo");
        return new Response(JSON.stringify({ content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Standard text carousel ──
      userPrompt = buildExpressFullPrompt(body);
    } else if (type === "suggest_topics") {
      userPrompt = buildSuggestTopicsPrompt(body);
    } else if (type === "suggest_angles") {
      userPrompt = buildSuggestAnglesPrompt(body);
    } else if (type === "deepening_questions") {
      // ── Photo carousel: vision-informed questions ──
      if (body.carousel_type === "photo" && body.photos && body.photos.length > 0) {
        const messageContent: any[] = [];
        for (const photo of body.photos.slice(0, 10)) {
          if (photo.base64) {
            const raw = photo.base64.replace(/^data:image\/[a-z]+;base64,/, "");
            messageContent.push({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: raw },
            });
          }
        }
        messageContent.push({
          type: "text",
          text: `Voici ${body.photos.length} photo(s) que l'utilisatrice veut utiliser pour un carrousel photo Instagram.

Sujet : "${body.subject || "non précisé"}"
Objectif : ${body.objective || "engagement"}
${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}

Tu es une coach com' spécialisée en contenu visuel. Analyse les photos et pose exactement 3 questions d'approfondissement.

Tes questions doivent :
- MENTIONNER ce que tu vois dans les photos (couleurs, ambiance, éléments, scène)
- Aider l'utilisatrice à définir l'histoire que ces photos racontent ensemble
- Extraire le contexte INVISIBLE : pourquoi ce moment, quelle émotion, quel message
- Être spécifiques aux photos (pas génériques)

Exemples de bonnes questions :
- "Je vois [élément]. C'était dans quel contexte ? Qu'est-ce que ce moment représente pour toi ?"
- "L'ambiance de tes photos est [observation]. C'est volontaire ? Quel message tu veux faire passer ?"
- "Quelle est l'histoire entre la première et la dernière photo ? Il y a une progression ?"

Réponds UNIQUEMENT en JSON valide :
{
  "questions": [
    { "question": "...", "placeholder": "..." },
    { "question": "...", "placeholder": "..." },
    { "question": "...", "placeholder": "..." }
  ]
}`,
        });

        const content = await callAnthropic({
          model: getModelForAction("carousel"),
          system: systemPrompt,
          messages: [{ role: "user", content: messageContent }],
          max_tokens: 4096,
        });

        await logUsage(user.id, category, "carousel_deepening_photo");
        return new Response(JSON.stringify({ content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Photo carousel with description only (no actual photos) ──
      if (body.carousel_type === "photo" && body.photo_description) {
        const photoDescBlock = `\n\nL'utilisatrice décrit ses photos : "${body.photo_description}". Pose des questions en lien avec ce qu'elle décrit : l'ambiance, le contexte invisible, l'émotion derrière ces images, l'histoire qu'elles racontent ensemble.`;
        userPrompt = buildDeepeningQuestionsPrompt(body, brandingContext) + photoDescBlock;
      } else {
        userPrompt = buildDeepeningQuestionsPrompt(body, brandingContext);
      }
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
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
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

ANTI-BROETRY (s'applique aux captions, pas aux slides) :
Les captions de carrousels ne sont PAS des listes de phrases sur des lignes séparées. Ce sont des paragraphes fluides de 2-3 phrases. Le rythme vient du contraste entre phrases longues et phrases courtes, pas des sauts de ligne.

${CHAIN_OF_THOUGHT}

${DEPTH_LAYER}

ANTI-BIAIS — TU NE REPRODUIS JAMAIS :
- Ton paternaliste → Permission : "Tu as le droit de prendre de la place"
- Clichés genrés → Parler de compétences, pas de genre
- Glorification du hustle → "Mieux vaut du mieux que du plus"
- Vocabulaire masculin par défaut → écriture inclusive point médian

## PENSÉE VISUELLE (OBLIGATOIRE)

Chaque slide doit être pensée VISUELLEMENT, pas juste textuellement.

Quand le sujet s'y prête, propose des éléments visuels structurants dans le champ visual_suggestion :
- Flux avec flèches : étape 1 → étape 2 → résultat
- Comparaisons côte à côte : AVANT | APRÈS ou MYTHE | RÉALITÉ
- Équations visuelles : X + Y = Z
- Diagrammes simples avec des encadrés reliés
- Emojis utilisés comme PICTOS pour structurer (pas comme décoration)

Le visual_suggestion doit décrire précisément l'élément visuel ("Diagramme : encadré 'Contenu de qualité' + flèche → encadré 'Algo le pousse' + flèche → encadré 'Bonnes personnes le voient'"), pas juste "illustration du concept".

Un carrousel où TOUTES les slides sont du texte dans des cartes blanches, c'est un échec visuel.

## HOOKS CARROUSEL

Le hook (slide 1) est une CLAQUE, pas un titre de blog.

Exemples de hooks ton Nowadays :
- "J'ai arrêté de poster pendant 3 semaines. Voilà ce qui s'est passé."
- "Ton contenu n'est pas nul. Il est juste invisible."
- "Le problème c'est pas l'algo. C'est ta stratégie."
- "On m'a dit que mon feed était 'trop rose'. J'ai doublé le rose."
- "J'ai compté : 47h de formation en ligne. Résultat : 0 post publié."

JAMAIS : "5 astuces pour...", "Comment booster votre...", "Les X erreurs à éviter", "Le guide ultime de..."

## DEEPENING (INTÉGRATION ÉLÉMENTS D'APPROFONDISSEMENT)

Si des réponses d'approfondissement sont fournies, elles sont PLUS IMPORTANTES que le template.
- Son anecdote → slides 2-3 (storytelling du carrousel)
- Sa conviction → punchline de la slide finale avant le CTA
- Le carrousel raconte SON histoire à travers le framework, pas un framework illustré par un exemple générique

${PREGEN_INJECTION_RULES}

RÈGLES ABSOLUES DES CARROUSELS :
- Slide 1 (hook) : MAXIMUM 12 mots. Règle stricte.
- Chaque slide : MAXIMUM 50 mots. 1 idée par slide. Mais ces 50 mots doivent être des PHRASES COMPLÈTES ET FLUIDES, pas des fragments hachés. Écris 2-3 phrases qui coulent, pas 6 bouts de phrases de 5 mots. Le rythme oral s'applique aussi dans les slides.
- Mini-headlines (title) : 4-7 mots, percutant.
- Le body de chaque slide : prose fluide, pas de liste, pas de rafale "Phrase courte. Phrase courte. Phrase courte."
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
- Chaque slide : max 50 mots, 1 idée, mais en PHRASES COMPLÈTES. Pas de fragments. Pas de rafales "Phrase. Phrase. Phrase." Le body est de la prose fluide : 2-3 phrases qui développent l'idée.
- Slide 2 = DOIT fonctionner comme hook autonome (seconde chance algo)
- Dernière slide = 1 SEUL CTA
- Headlines (title) : 4-7 mots, percutant
- Caption différente du hook slide 1
- Hashtags : 3-8, mix large + niche${extraRules}
${deepeningCtx ? "- UTILISE les mots et exemples de l'utilisatrice dans les slides (anecdotes, vécu, arguments)" : ""}

═══ SCHÉMAS VISUELS (PUISSANT — utilise-les !) ═══

Certaines slides gagnent à être des SCHÉMAS plutôt que du texte pur. Quand c'est pertinent, ajoute un "visual_schema" à la slide.
L'IA de design sait dessiner ces schémas en HTML/CSS. N'hésite PAS à les utiliser : 2-3 slides schéma par carrousel = le sweet spot.

Types disponibles et QUAND les utiliser :

1. "before_after" — Avant/Après, comparaison de 2 états
   { "type": "before_after", "before": { "label": "Avant", "items": ["Point 1", "Point 2"] }, "after": { "label": "Après", "items": ["Point 1", "Point 2"] } }

2. "comparison" — Deux colonnes opposées (bon/mauvais, mythe/réalité, toi/les autres)
   { "type": "comparison", "left": { "label": "❌ Ce qu'on te dit", "items": ["Poste tous les jours", "Utilise 30 hashtags"] }, "right": { "label": "✅ Ce qui marche", "items": ["Poste quand t'as un truc à dire", "3-5 hashtags ciblés"] } }

3. "timeline" — Progression chronologique ou étapes
   { "type": "timeline", "steps": [ { "label": "2019", "desc": "L'ère du bio-partout" }, { "label": "2022", "desc": "La crise du greenwashing" }, { "label": "2026", "desc": "L'éthique silencieuse" } ] }

4. "checklist" — Liste de vérification avec ✅/❌
   { "type": "checklist", "title": "Ta com' est éthique si…", "items": [ { "text": "Tu parles de tes valeurs sans jargon", "checked": true }, { "text": "Tu utilises la culpabilité pour vendre", "checked": false } ] }

5. "stats" — Chiffres clés, données percutantes (1-3 stats)
   { "type": "stats", "items": [ { "number": "73%", "label": "des consommateurs vérifient les engagements d'une marque" }, { "number": "2x", "label": "plus de partages sur les posts authentiques" } ] }

6. "matrix_2x2" — Matrice à 4 quadrants
   { "type": "matrix_2x2", "x_axis": { "left": "Facile", "right": "Difficile" }, "y_axis": { "bottom": "Peu d'impact", "top": "Fort impact" }, "quadrants": [ { "position": "top_left", "label": "Quick wins", "emoji": "🎯" }, { "position": "top_right", "label": "Projets stratégiques", "emoji": "🏗️" }, { "position": "bottom_left", "label": "Déléguer", "emoji": "🤷" }, { "position": "bottom_right", "label": "Éviter", "emoji": "🚫" } ] }

7. "pyramid" — Hiérarchie en niveaux (3-5 niveaux, le sommet = le plus important)
   { "type": "pyramid", "levels": [ { "label": "Valeurs", "desc": "Ce en quoi tu crois" }, { "label": "Message", "desc": "Ce que tu dis" }, { "label": "Contenu", "desc": "Comment tu le dis" } ] }

8. "equation" — Relation visuelle A + B = C
   { "type": "equation", "parts": [ { "label": "Authenticité" }, { "label": "Régularité" } ], "result": { "label": "Confiance" }, "operator": "+" }

9. "flowchart" — Arbre de décision simple (max 2 niveaux)
   { "type": "flowchart", "start": "Tu veux poster aujourd'hui ?", "branches": [ { "condition": "J'ai un truc à dire", "result": "Poste ✅" }, { "condition": "Je me force", "result": "Écris plutôt en privé 📝" } ] }

10. "scale" — Spectre/gradient entre deux extrêmes
    { "type": "scale", "left": { "label": "Greenwashing", "emoji": "🤮" }, "right": { "label": "Impact réel", "emoji": "💎" }, "marker": { "position": 75, "label": "Toi ici 👆" } }

11. "icon_grid" — Grille d'icônes avec labels (2-6 items)
    { "type": "icon_grid", "items": [ { "emoji": "🎯", "label": "Clarté" }, { "emoji": "💬", "label": "Dialogue" }, { "emoji": "❤️", "label": "Care" } ] }

QUAND utiliser un schéma :
- Slide de comparaison (avant/après, bon/mauvais) → before_after ou comparison
- Slide avec des chiffres → stats
- Slide qui explique un process ou une évolution → timeline, flowchart, pyramid
- Slide récap ou synthèse → checklist, icon_grid, matrix_2x2
- Slide qui positionne un concept → scale, equation

QUAND NE PAS utiliser de schéma :
- Slide hook (slide 1) → toujours du texte pur avec un titre percutant
- Slide CTA (dernière) → toujours du texte avec appel à l'action
- Slide storytelling personnel → le texte suffit
- Si le texte est plus fort seul → pas besoin d'un schéma forcé

Quand une slide a un visual_schema, le body peut être plus court ou vide — le schéma porte le message visuel.

Retourne ce JSON exact :
{
  "slides": [
    {
      "slide_number": 1,
      "role": "hook",
      "title": "Le headline de la slide",
      "body": "Le texte complémentaire (optionnel pour le hook)",
      "visual_suggestion": "Description visuelle textuelle (ambiance, composition, couleurs)",
      "visual_schema": null,
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
Slide 1: Hook percutant — pas de "X astuces pour", mais une accroche qui crée un gap ("Ce truc que tout le monde fait... et qui sabote tout.")
Slide 2: Contexte "J'ai testé/observé ça en [contexte]. Voici ce qui change tout."
Slides 3-N: 1 tip par slide avec un TITRE PROPRE qui accroche (pas "Tip 1 :", mais "Arrête de te forcer")
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
Slide 1: Hook concret et spécifique "[Situation vécue précise, avec un détail qui accroche]"
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
- AU MOINS 1 question sur 3 doit creuser le POURQUOI PROFOND : "Pourquoi tu penses que [blocage] existe ?", "Qu'est-ce qui fait que [problème] est si répandu selon toi ?", "Si tu devais expliquer à quelqu'un pourquoi [sujet] est un vrai problème, tu dirais quoi ?". L'objectif est d'extraire une réflexion de fond, pas juste un exemple.
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

═══ SCHÉMAS VISUELS (PUISSANT — utilise-les !) ═══

Certaines slides gagnent à être des SCHÉMAS plutôt que du texte pur. Quand c'est pertinent, ajoute un "visual_schema" à la slide.
L'IA de design sait dessiner ces schémas en HTML/CSS. N'hésite PAS à les utiliser : 2-3 slides schéma par carrousel = le sweet spot.

Types disponibles :
1. "before_after" — { "type": "before_after", "before": { "label": "...", "items": [...] }, "after": { "label": "...", "items": [...] } }
2. "comparison" — { "type": "comparison", "left": { "label": "...", "items": [...] }, "right": { "label": "...", "items": [...] } }
3. "timeline" — { "type": "timeline", "steps": [ { "label": "...", "desc": "..." } ] }
4. "checklist" — { "type": "checklist", "title": "...", "items": [ { "text": "...", "checked": true/false } ] }
5. "stats" — { "type": "stats", "items": [ { "number": "73%", "label": "..." } ] }
6. "matrix_2x2" — { "type": "matrix_2x2", "x_axis": {...}, "y_axis": {...}, "quadrants": [...] }
7. "pyramid" — { "type": "pyramid", "levels": [ { "label": "...", "desc": "..." } ] }
8. "equation" — { "type": "equation", "parts": [ { "label": "..." } ], "result": { "label": "..." }, "operator": "+" }
9. "flowchart" — { "type": "flowchart", "start": "...", "branches": [ { "condition": "...", "result": "..." } ] }
10. "scale" — { "type": "scale", "left": { "label": "...", "emoji": "..." }, "right": { "label": "...", "emoji": "..." }, "marker": { "position": 75, "label": "..." } }
11. "icon_grid" — { "type": "icon_grid", "items": [ { "emoji": "...", "label": "..." } ] }

Utilise un schéma quand la slide compare, liste, chiffre, ou montre un process. Pas pour hook, CTA, ou storytelling.

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
      "visual_suggestion": "Description visuelle textuelle (ambiance, composition, couleurs)",
      "visual_schema": null,
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

function buildPhotoCarouselPrompt(body: any): string {
  const { editorial_angle, content_structure, deepening_answers } = body;

  let deepeningCtx = "";
  if (deepening_answers) {
    const answers = Object.entries(deepening_answers)
      .filter(([, v]) => v && (v as string).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    if (answers) deepeningCtx = `\nRÉPONSES DE L'UTILISATRICE (intègre son vécu et ses mots) :\n${answers}\n`;
  }

  let angleBlock = "";
  if (editorial_angle && content_structure) {
    angleBlock = `\nANGLE ÉDITORIAL CHOISI : ${editorial_angle}\nSTRUCTURE IMPOSÉE :\n${content_structure}\n\n${EDITORIAL_ANGLES_REFERENCE}`;
  }

  return `Tu es une DIRECTRICE ARTISTIQUE ÉDITORIALE spécialisée dans les carrousels photo Instagram.

Ton rôle : transformer des photos en carrousel éditorial qui RACONTE UNE HISTOIRE. Chaque slide participe à une narration.

═══ RÈGLES OVERLAY ═══
- CHAQUE SLIDE a un overlay_text. C'est obligatoire. Une phrase courte mais complète.
- Exception : 1 à 2 slides MAXIMUM sur tout le carrousel peuvent avoir overlay_text: null (quand la photo est si forte qu'elle se suffit).
- overlay_text : entre 5 et 20 mots. C'est une VRAIE PHRASE, pas juste un mot-clé.
- Le texte COMPLÈTE l'image : il raconte ce qu'on ne voit pas, il donne du contexte, il fait avancer l'histoire.
- Styles d'overlay :
  · "sensoriel" : phrase évocatrice qui fait ressentir ("Ce matin-là, tout sentait la cire d'abeille et le bois chaud.")
  · "narratif" : phrase qui fait avancer l'histoire ("Et puis un jour, une cliente m'a dit quelque chose qui a tout changé.")
  · "minimal" : phrase courte percutante pour les moments forts ("Trois mois. Zéro regret.")
  · "technique" : détail concret qui crédibilise ("100% lin français, teint à la main dans notre atelier.")
- Positions : "bottom_left", "bottom_center", "top_left", "top_center", "center"
- PRIVILÉGIE "sensoriel" et "narratif" pour que le carrousel raconte vraiment quelque chose.

═══ PROGRESSION NARRATIVE ═══
Chaque carrousel doit suivre un arc narratif clair :
- Slide 1 (hook) : phrase qui arrête le scroll. Crée une tension, une question, une émotion.
- Slides 2-3 : contexte, développement. On entre dans l'histoire.
- Slides milieu : le cœur. Détails, processus, tournant émotionnel.
- Avant-dernière : le climax ou la révélation.
- Dernière (CTA) : phrase qui ouvre vers l'action ou la conversation.

═══ RÔLES DES SLIDES ═══
- "hook_visuel" : la première photo + phrase qui arrête le scroll
- "detail" : zoom sur un détail, enrichi d'une phrase sensorielle
- "contexte" : mise en situation avec une phrase narrative
- "process" : coulisses, fabrication, avec un détail concret
- "emotion" : photo émotionnelle + phrase qui amplifie
- "cta_visuel" : dernière slide, invitation douce

═══ LÉGENDE ═══
- 400-800 caractères
- La légende PROLONGE l'histoire des slides, elle ne la répète pas
- Hook : phrase d'accroche DIFFÉRENTE du texte de la slide 1
- Body : ce que les photos ne montrent pas (l'envers du décor, l'émotion, le pourquoi)
- Ton sensoriel : faire ressentir les textures, les lumières, les ambiances
- CTA : invitation à la conversation ("Et toi, tu as déjà ressenti ça ?")
- 5-10 hashtags pertinents
${deepeningCtx}${angleBlock}

RETOURNE UNIQUEMENT ce JSON exact, sans texte avant ou après :
{
  "carousel_type": "photo",
  "chosen_angle": { "title": "Titre court de l'angle (3-5 mots)", "description": "Pourquoi cet angle" },
  "slides": [
    {
      "slide_number": 1,
      "role": "hook_visuel",
      "photo_description": "Description de ce que montre la photo",
      "overlay_text": "Une vraie phrase courte qui complète l'image",
      "overlay_position": "bottom_left",
      "overlay_style": "sensoriel",
      "note": "Note de direction artistique pour cette slide"
    }
  ],
  "caption": {
    "hook": "Accroche émotionnelle différente du texte slide 1 (125 car max)",
    "body": "Corps de la légende (sensoriel, narratif, ce que les photos ne montrent pas)",
    "cta": "Invitation douce à la conversation",
    "hashtags": ["hashtag1", "hashtag2"]
  },
  "quality_check": {
    "slides_with_text": 5,
    "slides_without_text": 1,
    "max_overlay_words": 15,
    "caption_length": 520,
    "caption_complements_not_describes": true,
    "score": 85
  }
}`;
}

function buildMixCarouselPrompt(body: any): string {
  const { editorial_angle, content_structure, deepening_answers } = body;

  let deepeningCtx = "";
  if (deepening_answers) {
    const answers = Object.entries(deepening_answers)
      .filter(([, v]) => v && (v as string).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    if (answers) deepeningCtx = `\nRÉPONSES DE L'UTILISATRICE (intègre son vécu et ses mots) :\n${answers}\n`;
  }

  let angleBlock = "";
  if (editorial_angle && content_structure) {
    angleBlock = `\nANGLE ÉDITORIAL CHOISI : ${editorial_angle}\nSTRUCTURE IMPOSÉE :\n${content_structure}\n\n${EDITORIAL_ANGLES_REFERENCE}`;
  }

  return `Tu es une DIRECTRICE ARTISTIQUE ÉDITORIALE spécialisée dans les carrousels Instagram.

Tu crées des carrousels MIXTES : un mélange de slides avec photos et de slides texte pur. C'est le format le plus courant et le plus engageant sur Instagram.

═══ TYPES DE SLIDES ═══

Pour chaque slide, tu choisis UN de ces types :

1. "photo_full" — Photo plein écran + texte overlay
   - La photo occupe toute la slide (1080×1350) en background
   - Un texte overlay est posé dessus (5-20 mots)
   - Idéal pour : hook visuel, moment émotion, ambiance, résultat
   - Champs : overlay_text, overlay_position, overlay_style

2. "photo_integrated" — Photo intégrée dans un layout design
   - La photo est un ÉLÉMENT du design (pas le fond)
   - Exemples de layouts :
     · "top_photo" : photo en haut (50-60%), texte en bas sur fond coloré
     · "left_photo" : photo à gauche (40%), texte à droite
     · "right_photo" : texte à gauche, photo à droite (40%)
     · "card_photo" : photo dans une carte arrondie avec texte en dessous
     · "banner_photo" : photo en bandeau horizontal + titre en dessous
   - Champs : photo_layout, title, body, photo_index

3. "text_only" — Slide texte pure (design system)
   - Pas de photo, design classique avec fond coloré/blanc, typos, badges
   - Idéal pour : développement narratif, tips détaillés, prise de position, contexte, CTA. Ce ne sont PAS des séparateurs : chaque slide texte porte du contenu de fond.
   - Champs : title, body, visual_schema (optionnel)

═══ RÈGLES DE COMPOSITION ═══

- Un carrousel de ${body.photos?.length || "N"} photos devrait avoir ${body.photos?.length || "N"} à ${(body.photos?.length || 6) + 3} slides au total
- Commence TOUJOURS par une slide "photo_full" (hook visuel)
- Termine par une slide "text_only" (CTA)
- CHAQUE photo uploadée doit être utilisée AU MOINS une fois
- Une même photo peut être utilisée dans plusieurs slides (ex: full + detail crop)
- Alterne les types pour créer du rythme : photo → texte → photo → texte
- Ne fais JAMAIS 3 slides du même type à la suite

═══ RÈGLES DE NARRATION ═══

- ARC NARRATIF OBLIGATOIRE : le carrousel raconte une histoire (situation → tension → développement → résolution → ouverture). Même un carrousel mixte doit avoir un fil conducteur, pas juste une alternance photo/texte sans logique.
- CONNEXION ENTRE SLIDES : chaque slide crée une tension qui donne envie de swiper. Utilise des bucket brigades : "Le problème, c'est que...", "Sauf que...", "Résultat ?", "Et là...", "La vraie question c'est..."
- Les slides text_only doivent avoir un body de 30-50 mots MINIMUM, pas juste un titre + quelques mots. Du vrai contenu de fond avec des phrases complètes et fluides.
- EXEMPLES CONCRETS dans chaque slide texte : pas de conseil abstrait sans illustration.
- AU MOINS 1 analogie du quotidien ou référence culture pop dans le carrousel.
- Le contenu doit sonner comme quelqu'un qui PARLE, pas qui rédige un article. Ton oral : "en vrai", "franchement", "le truc c'est que", apartés en parenthèses.
- INTERDIT : "Dans un monde où...", "Il est important de...", "N'hésite pas à...", "Voici X astuces pour..."

═══ SUJET = BRIEF CRÉATIF ═══

Le sujet donné par l'utilisatrice est un BRIEF CRÉATIF, pas juste un thème.
- Si le sujet contient un concept (VS, avant/après, métaphore, angle), le carrousel DOIT s'articuler autour de ce concept. C'est la colonne vertébrale du contenu.
- Le titre créatif donné par l'utilisatrice doit apparaître (ou être amélioré) sur la slide 1 comme hook.
- Ne dilue PAS le concept dans un carrousel générique. Le concept structure TOUT.

═══ ASSIGNATION DES PHOTOS ═══

Les photos sont fournies dans l'ordre : photo 1, photo 2, etc.
Pour chaque slide photo (photo_full ou photo_integrated), indique photo_index (1, 2, 3...) pour dire quelle photo utiliser.

═══ LÉGENDE ═══
- 400-800 caractères
- Hook : phrase d'accroche DIFFÉRENTE du texte de la slide 1
- Body : ce que les photos ne montrent pas (l'envers du décor, l'émotion, le pourquoi)
- CTA : invitation à la conversation
- 5-10 hashtags pertinents
${deepeningCtx}${angleBlock}

RETOURNE UNIQUEMENT ce JSON exact, sans texte avant ou après :
{
  "carousel_type": "mix",
  "chosen_angle": { "title": "Titre court de l'angle (3-5 mots)", "description": "Pourquoi cet angle" },
  "slides": [
    {
      "slide_number": 1,
      "slide_type": "photo_full",
      "photo_index": 1,
      "role": "hook_visuel",
      "overlay_text": "Une vraie phrase courte qui complète l'image",
      "overlay_position": "bottom_center",
      "overlay_style": "sensoriel",
      "note": "Note de direction artistique"
    },
    {
      "slide_number": 2,
      "slide_type": "text_only",
      "photo_index": null,
      "role": "context",
      "title": "Le vrai problème, c'est pas l'algo",
      "body": "En vrai, le problème c'est pas l'algorithme. C'est qu'on poste en espérant que les gens vont deviner ce qu'on fait. Sauf que personne ne devine. Les comptes qui marchent, c'est ceux qui ont quelque chose à dire. (Et oui, toi aussi t'as des choses à dire.)",
      "visual_schema": null
    },
    {
      "slide_number": 3,
      "slide_type": "photo_integrated",
      "photo_index": 2,
      "photo_layout": "top_photo",
      "role": "detail",
      "title": "Titre au-dessus ou à côté de la photo",
      "body": "Texte qui accompagne la photo dans le layout",
      "note": "Note DA"
    }
  ],
  "caption": {
    "hook": "Accroche émotionnelle (125 car max)",
    "body": "Corps de la légende",
    "cta": "Invitation douce",
    "hashtags": ["hashtag1", "hashtag2"]
  },
  "quality_check": {
    "total_slides": 8,
    "photo_full_count": 3,
    "photo_integrated_count": 2,
    "text_only_count": 3,
    "all_photos_used": true,
    "narrative_arc": true,
    "slides_connected": true,
    "subject_concept_used": true,
    "text_slides_min_30_words": true,
    "score": 85
  }
}`;
}