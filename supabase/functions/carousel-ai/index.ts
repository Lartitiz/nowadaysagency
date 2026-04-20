import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildPreGenFallback } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, getModelForAction, getModelForRichContent } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { applyCorrectionPassCarousel } from "../_shared/correction-pass.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { buildSystemPrompt, buildHooksPrompt, buildSlidesPrompt, buildSuggestTopicsPrompt, buildSuggestAnglesPrompt, buildDeepeningQuestionsPrompt, buildExpressFullPrompt, buildPhotoCarouselPrompt, buildMixCarouselPrompt } from "./prompts/builders.ts";

// ── Helpers contexte par photo ──
// L'ordre des photos correspond à l'ordre d'envoi côté front (post-reorder UX).
// `context` (max 200 chars, validé Zod) provient du champ optionnel par photo dans PhotoUploadZone.
function buildPhotoContextRecap(photos: Array<{ base64: string; context?: string }> | undefined): string {
  if (!photos || photos.length === 0) return "";
  const withCtx = photos
    .map((p, i) => ({ idx: i + 1, ctx: p.context?.trim() }))
    .filter((p) => p.ctx);
  if (withCtx.length === 0) return "";
  const lines = withCtx.map((p) => `- Photo ${p.idx} : ${p.ctx}`).join("\n");
  const missing = photos.length - withCtx.length;
  const tail = missing > 0 ? `\n(Les ${missing} autre${missing > 1 ? "s" : ""} photo${missing > 1 ? "s n'ont" : " n'a"} pas de contexte fourni.)` : "";
  return `\n\nINDICES PRÉCIS PAR PHOTO (fournis par l'utilisatrice — utilise-les pour identifier ce qui est représenté) :\n${lines}${tail}\n`;
}

function pushPhotoWithContext(messageContent: any[], photo: { base64: string; context?: string }, index: number) {
  if (!photo.base64) return;
  const ctx = photo.context?.trim();
  if (ctx) {
    messageContent.push({ type: "text", text: `Photo ${index + 1} — contexte fourni par l'utilisatrice : "${ctx}"` });
  }
  const raw = photo.base64.replace(/^data:image\/[a-z]+;base64,/, "");
  messageContent.push({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: raw },
  });
}

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
      type: z.enum(["hooks", "slides", "suggest_topics", "suggest_angles", "deepening_questions", "express_full", "structure_proposal"]),
      carousel_type: z.string().max(100).optional().nullable(),
      subject: z.string().max(15000).optional().nullable(),
      objective: z.string().max(100).optional().nullable(),
      slide_count: z.number().min(1).max(20).optional(),
      workspace_id: z.string().uuid().optional().nullable(),
      editorial_angle: z.string().max(100).optional().nullable(),
      content_structure: z.string().max(5000).optional().nullable(),
      photos: z.array(z.object({ base64: z.string(), context: z.string().max(200).optional() })).max(10).optional(),
      photo_description: z.string().max(2000).optional().nullable(),
      slide_structure: z.array(z.object({
        slide_number: z.number(),
        type: z.enum(["photo_full", "photo_integrated", "text_only"]),
        photo_index: z.number().optional(),
        photo_layout: z.string().optional(),
      })).optional().nullable(),
      confirmed_structure: z.array(z.object({
        slide_number: z.number(),
        role: z.string(),
        title_suggestion: z.string(),
        strategic_note: z.string(),
        photo_index: z.number().optional(),
        slide_type: z.enum(["photo_full", "photo_integrated", "text_only"]).optional(),
      })).optional().nullable(),
      recent_briefs_context: z.string().max(4000).optional().nullable(),
    }).passthrough());
    const { type, workspace_id, launch_context } = body;
    const isLinkedIn = body.channel === "linkedin";

    const category = (type === "suggest_topics" || type === "suggest_angles" || type === "deepening_questions" || type === "structure_proposal") ? "suggestion" : "content";
    const quotaCheck = await checkQuota(user.id, category, workspace_id);
    if (!quotaCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: quotaCheck.message, remaining: 0, category: quotaCheck.reason }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ctx = await getUserContext(supabase, user.id, workspace_id, "instagram");
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.posts);

    // Recent briefs context — fetched server-side as fallback for deepening_questions
    let recentBriefsContext = body.recent_briefs_context || "";
    if (!recentBriefsContext && type === "deepening_questions") {
      recentBriefsContext = await getRecentBriefsContext(supabase, user.id, workspace_id, 3);
    }

    // Brand vocabulary for forcing concrete questions
    const brandVocab: string[] = [];
    if (ctx?.profile?.activite) brandVocab.push(`activité: ${ctx.profile.activite}`);
    if (ctx?.profile?.cible) brandVocab.push(`cible: ${ctx.profile.cible}`);
    if (ctx?.tone?.key_expressions && typeof ctx.tone.key_expressions === "string") {
      brandVocab.push(`expressions clés: ${ctx.tone.key_expressions.slice(0, 200)}`);
    }
    const brandVocabBlock = brandVocab.length > 0
      ? `\n\nVOCABULAIRE MÉTIER (à RÉUTILISER dans les questions, au moins 2/3) :\n${brandVocab.map(v => `- ${v}`).join("\n")}\n`
      : "";

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

    let systemPrompt = buildSystemPrompt(brandingContext, isLinkedIn, ctx.profile);

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
        const mixPrompt = buildMixCarouselPrompt(body, isLinkedIn);
        let content: string;

        if (body.photos && body.photos.length > 0) {
          const messageContent: any[] = [];
          
          // 1. Brief créatif EN PREMIER (avant les photos)
          const photoCtxRecap = buildPhotoContextRecap(body.photos);
          messageContent.push({
            type: "text",
            text: `BRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer TOUT le carrousel.\n\nObjectif : ${body.objective || "engagement"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${body.slide_structure ? `\nStructure imposée : ${body.slide_structure.length} slides définies par l'utilisateur·ice.` : ""}${photoCtxRecap}\n\nVoici ${body.photos.length} photo(s) à intégrer dans le carrousel :`,
          });

          // 2. Photos (avec contexte par photo s'il existe — l'ordre = ordre d'envoi front)
          body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
            pushPhotoWithContext(messageContent, photo, idx);
          });

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
          const textPrompt = mixPrompt + `\n\nBRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer tout le carrousel.\n\nDescription des photos : "${body.photo_description || "non fournie"}"\nNombre de slides estimé : ${body.slide_count || 8}\nObjectif : ${body.objective || "engagement"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${body.slide_structure ? `\nStructure imposée : ${body.slide_structure.length} slides définies par l'utilisateur·ice.` : ""}`;

          content = await callAnthropic({
            model: getModelForRichContent("carousel", !!(body.deepening_answers && Object.values(body.deepening_answers).some(v => v && (v as string).trim().length > 50))),
            system: systemPrompt,
            messages: [{ role: "user", content: textPrompt }],
            max_tokens: 8192,
          });
        }

        // JSON-aware correction pass for carousels
        try {
          const corrected = await applyCorrectionPassCarousel(content, {
            enabled: true,
            skipIfShorterThan: 300,
            logger: (msg) => console.log(msg),
          });
          if (corrected && corrected !== content) {
            content = corrected;
          }
        } catch (correctionError) {
          console.error("Correction pass failed in carousel-ai (mix):", correctionError);
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
          const photoCtxRecap = buildPhotoContextRecap(body.photos);

          // 1. Brief + recap contexte AVANT les photos
          messageContent.push({
            type: "text",
            text: `Voici ${body.photos.length} photo(s) pour un carrousel photo Instagram.\n\nSujet : "${body.subject || "non précisé"}"\nObjectif : ${body.objective || "engagement"}\nNombre de slides : ${body.photos.length}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${photoCtxRecap}`,
          });

          // 2. Photos (avec contexte par photo s'il existe — l'ordre = ordre d'envoi front)
          body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
            pushPhotoWithContext(messageContent, photo, idx);
          });

          // 3. Instruction finale après les photos
          messageContent.push({
            type: "text",
            text: `Analyse chaque photo et génère le carrousel photo.`,
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

        // JSON-aware correction pass for carousels
        try {
          const corrected = await applyCorrectionPassCarousel(content, {
            enabled: true,
            skipIfShorterThan: 300,
            logger: (msg) => console.log(msg),
          });
          if (corrected && corrected !== content) {
            content = corrected;
          }
        } catch (correctionError) {
          console.error("Correction pass failed in carousel-ai (photo):", correctionError);
        }

        await logUsage(user.id, category, "carousel_photo");
        return new Response(JSON.stringify({ content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Standard text carousel ──
      userPrompt = buildExpressFullPrompt(body, isLinkedIn);
    } else if (type === "structure_proposal") {
      const { subject, carousel_type, objective, slide_count, editorial_angle, deepening_answers, photos, photo_description } = body;
      const hasPhotos = photos && Array.isArray(photos) && photos.length > 0;
      const isPhotoMode = carousel_type === "photo";
      const isMixMode = carousel_type === "mix";

      let photoInstruction = "";
      if (hasPhotos && (isPhotoMode || isMixMode)) {
        if (isPhotoMode) {
          photoInstruction = `\nMODE PHOTO — ${photos.length} photo(s) fournies.\nAnalyse chaque photo et propose une structure où CHAQUE slide utilise une photo.\nPour chaque slide, indique "photo_index" (1-based, correspondant à l'ordre des photos fournies) et "slide_type": "photo_full".\nAssigne les photos aux slides en fonction de leur contenu visuel et du rôle narratif de la slide.\n${photo_description ? `Description complémentaire des photos : "${photo_description}"` : ""}`;
        } else {
          photoInstruction = `\nMODE MIXTE — ${photos.length} photo(s) fournies.\nPropose une structure qui MÉLANGE slides photo et slides texte.\nPour les slides avec photo, indique "photo_index" (1-based) et "slide_type": "photo_full" ou "photo_integrated".\nPour les slides sans photo, indique "slide_type": "text_only" et pas de photo_index.\nRépartis les photos intelligemment : la plus impactante en hook ou conclusion, les autres selon leur contenu.\nTu n'es PAS obligé·e d'utiliser toutes les photos.\n${photo_description ? `Description complémentaire des photos : "${photo_description}"` : ""}`;
        }
      }

      const structureSystemPrompt = `${BASE_SYSTEM_RULES}

Tu es une stratège éditoriale spécialisée en carrousels Instagram et LinkedIn.

MISSION : Propose une structure narrative optimale pour un carrousel. Tu ne génères PAS le contenu des slides — uniquement leur architecture.

RÈGLES :
- Chaque slide a un rôle narratif clair (hook, problème, mythe, exemple, solution, transformation, CTA…)
- Justifie chaque choix de position en 1 phrase max
- Propose des titres courts (4-7 mots), percutants, en français
- Sois concise et actionnable, pas théorique
- Le nombre de slides doit être entre ${slide_count || 7} et ${(slide_count || 7) + 2}
${photoInstruction}

CONTEXTE BRANDING :
${brandingContext}

Retourne UNIQUEMENT un objet JSON valide (pas de texte avant ou après, pas de backticks), avec cette structure exacte :
{
  "strategic_rationale": "2-3 phrases expliquant la logique narrative globale",
  "slides": [
    {
      "slide_number": 1,
      "role": "hook",
      "title_suggestion": "titre court proposé",
      "strategic_note": "pourquoi cette slide à cette position"${hasPhotos ? `,
      "photo_index": 1,
      "slide_type": "photo_full"` : ""}
    }
  ],
  "total_slides": 7,
  "carousel_type": "${carousel_type || "auto"}"
}`;

      const structureUserPrompt = `Sujet du carrousel : "${subject || "non précisé"}"
${carousel_type ? `Type de carrousel : ${carousel_type}` : "Choisis le type le plus pertinent."}
${objective ? `Objectif : ${objective}` : ""}
${editorial_angle ? `Angle éditorial souhaité : ${editorial_angle}` : ""}
${deepening_answers ? `Réponses de personnalisation : ${JSON.stringify(deepening_answers)}` : ""}
${hasPhotos ? `Nombre de photos : ${photos.length}` : ""}
Propose la structure optimale.`;

      let content: string;
      if (hasPhotos) {
        const messageContent: any[] = [];
        const photoCtxRecap = buildPhotoContextRecap(photos);
        messageContent.push({
          type: "text",
          text: structureUserPrompt + photoCtxRecap + "\n\nVoici les photos à analyser :",
        });
        // Photos avec contexte par photo s'il existe (l'ordre = ordre d'envoi front)
        photos.slice(0, 10).forEach((photo: any, idx: number) => {
          pushPhotoWithContext(messageContent, photo, idx);
        });
        messageContent.push({
          type: "text",
          text: "Analyse ces photos et propose la structure optimale avec l'assignation photo.",
        });
        content = await callAnthropic({
          model: getModelForAction("content"),
          system: structureSystemPrompt,
          messages: [{ role: "user", content: messageContent }],
          max_tokens: 2048,
        });
      } else {
        content = await callAnthropic({
          model: getModelForAction("content"),
          system: structureSystemPrompt,
          messages: [{ role: "user", content: structureUserPrompt }],
          max_tokens: 2048,
        });
      }

      // PAS de logUsage — cet appel est gratuit
      let structureResult;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        structureResult = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        structureResult = null;
      }

      if (!structureResult) {
        return new Response(JSON.stringify({ error: "Impossible de parser la structure proposée" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ result: structureResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (type === "suggest_topics") {
      userPrompt = buildSuggestTopicsPrompt(body);
    } else if (type === "suggest_angles") {
      userPrompt = buildSuggestAnglesPrompt(body);
    } else if (type === "deepening_questions") {
      // ── Photo / mix carousel: vision-informed questions ──
      if ((body.carousel_type === "photo" || body.carousel_type === "mix") && body.photos && body.photos.length > 0) {
        const isMix = body.carousel_type === "mix";
        const channelLabel = isLinkedIn ? "LinkedIn" : "Instagram";
        const formatLabel = isMix
          ? `carrousel ${channelLabel} MIXTE (slides photo + slides texte alternées)`
          : `carrousel photo ${channelLabel}`;

        const messageContent: any[] = [];
        body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
          pushPhotoWithContext(messageContent, photo, idx);
        });
        const photoCtxRecap = buildPhotoContextRecap(body.photos);
        messageContent.push({
          type: "text",
          text: `Voici ${body.photos.length} photo(s) que l'utilisatrice veut utiliser pour un ${formatLabel}.

Sujet : "${body.subject || "non précisé"}"
Objectif : ${body.objective || "engagement"}
${body.photo_description ? `Description complémentaire fournie en amont : "${body.photo_description}"` : ""}${photoCtxRecap}

Tu es une coach com' spécialisée en contenu visuel. Analyse les photos et pose exactement 3 questions d'approfondissement.

Tes questions doivent :
- MENTIONNER ce que tu VOIS RÉELLEMENT dans les photos (éléments concrets, ambiance, couleurs, scène, geste, lieu)
- Aider l'utilisatrice à définir l'histoire que ces photos racontent ensemble${isMix ? "\n- Identifier QUELLES photos méritent d'être au cœur du carrousel ET QUELS PASSAGES TEXTUELS viennent les accompagner (slides texte intercalées)" : ""}
- Extraire le contexte INVISIBLE : pourquoi ce moment, quelle émotion, quel message, quel hors-champ
- Être SPÉCIFIQUES à CES photos (pas génériques, pas interchangeables avec un autre brief)
${isLinkedIn ? "- Garder un ton PRO (apprentissage business, prise de position, résultat concret derrière l'image)" : "- Garder un ton ÉMOTION/SCÈNE VÉCUE (ressenti, coulisses, instant)"}

Exemples de bonnes questions${isMix ? " (carrousel mixte)" : ""} :
- "Je vois [élément précis]. C'était dans quel contexte ? Qu'est-ce que ce moment représente pour toi ?"
- "L'ambiance sur la photo [N] est [observation]. C'est volontaire ? Quel message tu veux faire passer ?"
${isMix
  ? "- \"Entre la photo [X] et la photo [Y], qu'est-ce que tu veux dire en mots — quelle réflexion / chiffre / conviction vient s'intercaler ?\""
  : "- \"Quelle est l'histoire entre la première et la dernière photo ? Il y a une progression ?\""}

INTERDIT :
- Questions génériques qui pourraient s'appliquer à n'importe quel sujet ou n'importe quelles photos
- Questions sans aucune référence visuelle aux photos analysées

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

        await logUsage(user.id, category, `carousel_deepening_${body.carousel_type}`);
        return new Response(JSON.stringify({ content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Photo/mix carousel with description only (no actual photos) ──
      if ((body.carousel_type === "photo" || body.carousel_type === "mix") && body.photo_description) {
        const photoDescBlock = `\n\nL'utilisatrice décrit ses photos : "${body.photo_description}". Pose des questions en lien avec ce qu'elle décrit : l'ambiance, le contexte invisible, l'émotion derrière ces images, l'histoire qu'elles racontent ensemble.`;
        userPrompt = buildDeepeningQuestionsPrompt(body, brandingContext, isLinkedIn, recentBriefsContext, brandVocabBlock) + photoDescBlock;
      } else {
        userPrompt = buildDeepeningQuestionsPrompt(body, brandingContext, isLinkedIn, recentBriefsContext, brandVocabBlock);
      }
    } else {
      return new Response(JSON.stringify({ error: "Type invalide" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let content = await callAnthropic({
      model: getModelForAction("carousel"),
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 8192,
    });

    // JSON-aware correction pass for carousels
    if (type === "express_full" || type === "slides" || type === "hooks") {
      try {
        const corrected = await applyCorrectionPassCarousel(content, {
          enabled: true,
          skipIfShorterThan: 300,
          logger: (msg) => console.log(msg),
        });
        if (corrected && corrected !== content) {
          content = corrected;
        }
      } catch (correctionError) {
        console.error("Correction pass failed in carousel-ai:", correctionError);
      }
    }

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

