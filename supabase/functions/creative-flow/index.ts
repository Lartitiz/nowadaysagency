import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CORE_PRINCIPLES, ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { getUserContext, formatContextForAI } from "../_shared/user-context.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError, clampAiField, adjustContentField } from "../_shared/input-validators.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";

import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction, AnthropicError, type UsageSink } from "../_shared/anthropic.ts";
import { runWithHeartbeatSSE } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { livedCaseFromCreativeBody } from "../_shared/lived-case.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { buildSeriesContext } from "../_shared/series-context.ts";
import { hookEchoesBefore } from "../_shared/redac-gate.ts";
import { fetchPreviousHooks, fetchPreviousHooksByFormat } from "../_shared/previous-hooks.ts";
import { gateNumbers } from "./shared.ts";
import { runNewsletterTwoStep } from "./formats/newsletter.ts";
import { isExplicitlyFictionalBrief, buildFictionalLinkedInQuestions, streamLinkedInPhotoVision, runLinkedInTwoStep } from "./formats/linkedin.ts";
import { streamDefaultPostSSE } from "./formats/post.ts";
import { runVisionQuestions, runVisionGenerate } from "./formats/photo.ts";
import { retiredCarouselStreamResponse } from "./formats/carousel.ts";
import { handleRecycleStep } from "./formats/recycle.ts";
export { buildRecycleSystemPrompt } from "./formats/recycle.ts";
export { enforceCarouselObjectAudienceAddress, retiredCarouselStreamResponse } from "./formats/carousel.ts";
export { correctPostStreamContent } from "./formats/post.ts";
export type { PostStreamQuality } from "./formats/post.ts";
export { HOOKS_ADDRESS_FIELDS, applyReelQualityPass, enforceReelAudienceAddress } from "./formats/reel.ts";
export { STORIES_ADDRESS_FIELDS, applyStoriesCorrectionPass, finalizeRecycledStories } from "./formats/stories.ts";
export type { StoriesGateResult } from "./formats/stories.ts";
export { isExplicitlyFictionalBrief, isFactualFictionalLinkedInBrief, alignFactualLinkedInHook, buildFictionalLinkedInQuestions, applyLinkedInCorrectionPass, runLinkedInTwoStep } from "./formats/linkedin.ts";
export { photoVoiceRule } from "./shared.ts";
export { NEWSLETTER_ADDRESS_FIELDS, applyNewsletterCorrectionPass } from "./formats/newsletter.ts";
export { gateNumbers, _deps, POST_ADDRESS_FIELDS } from "./shared.ts";
import { buildHooksPrompt } from "./formats/reel.ts";
import { buildFollowUpPrompt, buildAdjustPrompt, buildDictationPrompt, buildAnglesPrompt, buildQuestionsPrompt } from "./prompts/assist.ts";
export { buildFollowUpPrompt, buildAdjustPrompt, buildDictationPrompt, buildAnglesPrompt, buildQuestionsPrompt } from "./prompts/assist.ts";
export { resolveFormatHint, detectFormatFlags } from "./format-flags.ts";
export { buildHooksPrompt } from "./formats/reel.ts";
import { logGenerationQualityTelemetry } from "./telemetry.ts";
import { skipDepthResearch, creativeDepthBlock, runDeepResearchWebSearch } from "./research.ts";
export { skipDepthResearch, creativeDepthBlock, runDeepResearchWebSearch } from "./research.ts";
import { callOptionsForStep } from "./call-options.ts";
import { detectFormatFlags, personaChannel } from "./format-flags.ts";
import { buildRequestContext } from "./context.ts";
import { finishGenerated } from "./postprocess.ts";

import { buildGeneratePrompt, generateUsesStoriesBrief } from "./prompts/generate.ts";
import { loadStoriesGenerateData } from "./formats/stories.ts";
export { buildGeneratePrompt } from "./prompts/generate.ts";
// buildBrandingContext replaced by shared getUserContext + formatContextForAI

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  try {
    // Parse body first to extract workspace_id
    let body: any = {};
    if (req.method !== "OPTIONS") {
      try { body = await req.json(); } catch { body = {}; }
    }

    // Facturation par step (décision produit "1 post = 1 crédit") : seules la génération
    // finale et ses variantes (generate/adjust/recycle) débitent un crédit `content`.
    // Les étapes d'assistance (angles/questions/follow-up) et la dictée vocale sont
    // gratuites → on désactive le gate quota ET le logUsage pour elles.
    const BILLED_STEPS = new Set(["generate", "adjust", "recycle"]);
    const isBilledStep = typeof body?.step === "string" && BILLED_STEPS.has(body.step);

    const r = await runPipeline(req, {
      category: "content",
      skipQuota: !isBilledStep,
      workspaceId: body?.workspace_id ?? undefined,
    });
    if (!r.ok) return r.response;
    const { userId, supabase } = r;

    // Champs écrits par l'IA à une étape précédente puis renvoyés par le front
    // (angle choisi, structure, accroches déjà proposées renvoyées en exclusion
    // au refresh « 3 nouvelles accroches ») : on tronque au lieu de rejeter —
    // même classe que narrative_thread (#594).
    clampAiField(body, "editorial_angle", 200);
    clampAiField(body, "content_structure", 5000);
    if (Array.isArray(body?.exclude_hooks)) {
      body.exclude_hooks = body.exclude_hooks
        .map((h: unknown) => (typeof h === "string" ? h.slice(0, 300) : h));
    }

    validateInput(body, z.object({
      step: z.string().max(50),
      contentType: z.string().max(100).optional().nullable(),
      context: z.string().max(8000).optional().nullable(),
      adjustment: z.string().max(2000).optional().nullable(),
      content: adjustContentField,
      sourceText: z.string().max(10000).optional().nullable(),
      targetFormat: z.string().max(100).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
      objective: z.string().max(50).optional().nullable(),
      editorialFormat: z.string().max(100).optional().nullable(),
      editorialFormatLabel: z.string().max(200).optional().nullable(),
      photo_mode: z.boolean().optional(),
      photo_description: z.string().max(2000).optional().nullable(),
      photos: z.array(z.object({ base64: z.string(), mimeType: z.string().optional(), context: z.string().max(200).optional() })).max(10).optional(),
      recent_briefs_context: z.string().max(6000).optional().nullable(),
      face_cam: z.string().max(50).optional().nullable(),
      time_available: z.string().max(50).optional().nullable(),
      is_launch: z.boolean().optional().nullable(),
      selected_hook: z.any().optional().nullable(),
      exclude_hooks: z.array(z.string().max(300)).max(12).optional().nullable(),
      pre_gen_answers: z.any().optional().nullable(),
      inspiration_context: z.string().max(5000).optional().nullable(),
      editorial_angle: z.string().max(200).optional().nullable(),
      content_structure: z.string().max(5000).optional().nullable(),
      launch_context: z.any().optional().nullable(),
      news_context: z.string().max(4000).optional().nullable(),
      price_range: z.string().max(50).optional().nullable(),
      series_id: z.string().uuid().optional().nullable(),
      episode_number: z.number().int().min(1).optional().nullable(),
    }).passthrough());
    const { step, contentType, context, profile, angle, answers, followUpAnswers, content: currentContent, adjustment, calendarContext, preGenAnswers, sourceText, formats, targetFormat, workspace_id, deepResearch, objective, editorialFormat, editorialFormatLabel, variation, previousContent, pinterest_link, pinterest_board, recent_briefs_context: recentBriefsFromBody, series_id, episode_number, news_context: newsContext } = body;

    // Format demandé : une seule détection pour tout le handler (format-flags.ts, lot F3).
    const formatFlags = detectFormatFlags(contentType, angle, body);
    const { isCarousel, isReel, isStories, isLinkedIn, isPinterest, isNewsletter, isCaption, isPhotoMode } = formatFlags;
    // Canal du persona (getUserContext) tiré de la même détection.
    const channelFromType = personaChannel(formatFlags);

    const ctx = await getUserContext(supabase, userId, workspace_id, channelFromType);

    // Recent briefs context — fetched server-side as fallback if not provided.
    // Used by `questions` step to avoid repeating angles already covered.
    let recentBriefsContext = recentBriefsFromBody || "";
    if (!recentBriefsContext && (step === "questions" || step === "follow-up")) {
      recentBriefsContext = await getRecentBriefsContext(supabase, userId, workspace_id, 3);
    }

    // Contexte de marque, COMMON_PREFIX, calendrier, objectif : context.ts (fiche 3, lot D).
    const { newsContextBlock, brandingContext, brandGuardText, audienceAddress, brandVocabBlock, preGenBlock, fullContext, activity, COMMON_PREFIX, QUESTIONS_PREFIX, calendarBlock, effectiveObjective, objectiveBlock } = buildRequestContext({ body, ctx, step });

    let systemPrompt = "";
    let userPrompt: string | null = "";


    // Catalogue de photos de la bibliothèque (stories, lot B) : rempli au moment
    // du brief, relu après le parse pour résoudre photo_index → photo_id.
    // `preferred` (lot D) = photo explicitement choisie à l'étape format.
    let storiesPhotoCatalog: { index: number; id: string; description: string; preferred?: boolean }[] = [];

    // Format labels (used by recycle, declared here for broader scope)
    const formatLabels: Record<string, string> = {
      carrousel: "Carrousel Instagram",
      reel: "Script Reel (30-60 sec)",
      stories: "Séquence Stories",
      linkedin: "Post LinkedIn",
      newsletter: "Email / Newsletter",
    };

    if (step === "angles") {
      ({ systemPrompt, userPrompt } = buildAnglesPrompt({ COMMON_PREFIX, editorialFormatLabel, contentType, context, effectiveObjective, calendarBlock }));

    } else if (step === "questions") {
      if (isLinkedIn && !isPhotoMode && isExplicitlyFictionalBrief(context)) {
        return new Response(JSON.stringify(buildFictionalLinkedInQuestions()), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      ({ systemPrompt, userPrompt } = buildQuestionsPrompt({
        QUESTIONS_PREFIX,
        brandingContext,
        brandVocabBlock,
        context,
        contentType,
        editorialFormatLabel,
        angle,
        calendarBlock,
        objectiveBlock,
        newsContextBlock,
        recentBriefsContext,
      }));

    } else if (step === "follow-up") {
      ({ systemPrompt, userPrompt } = buildFollowUpPrompt({ QUESTIONS_PREFIX, brandingContext, brandVocabBlock, context, answers }));

    } else if (step === "hooks") {
      ({ systemPrompt, userPrompt } = buildHooksPrompt({
        COMMON_PREFIX,
        answers,
        excludeHooksRaw: (body as Record<string, unknown>).exclude_hooks,
        faceCam: body.face_cam,
        context,
        effectiveObjective,
        objective,
      }));

    } else if (step === "generate") {
      // Stories : garde-fou vente et catalogue photos lus ici, la consigne ne touche pas la base (lot F).
      const storiesData = generateUsesStoriesBrief({ isStories, isCarousel, isReel, isLinkedIn, isPhotoMode, context })
        ? await loadStoriesGenerateData({ supabase, userId, workspace_id, body, effectiveObjective })
        : undefined;
      const genResult = await buildGeneratePrompt({
        storiesData, body, COMMON_PREFIX, context, contentType, editorialFormat, editorialFormatLabel,
        angle, answers, followUpAnswers, calendarBlock, objectiveBlock, newsContextBlock, preGenBlock, effectiveObjective,
        pinterest_link, pinterest_board, variation, previousContent,
        isCarousel, isReel, isStories, isLinkedIn, isPinterest, isNewsletter, isPhotoMode, audienceAddress,
      });
      systemPrompt = genResult.systemPrompt;
      userPrompt = genResult.userPrompt;
      storiesPhotoCatalog = genResult.storiesPhotoCatalog;

    } else if (step === "adjust") {
      ({ systemPrompt, userPrompt } = buildAdjustPrompt({ COMMON_PREFIX, editorialFormatLabel, effectiveObjective, angle, currentContent, adjustment, sourceContext: [newsContext, context, JSON.stringify(answers || []), JSON.stringify(followUpAnswers || [])].filter(Boolean).join("\n") }));

    } else if (step === "recycle") {
      // Les prompts du recyclage sont construits PAR FORMAT dans le pipeline
      // parallèle dédié (plus bas, avant la section « Call Anthropic ») via
      // buildRecycleSystemPrompt. Rien à préparer ici.
    } else if (step === "dictation") {
      ({ systemPrompt, userPrompt } = buildDictationPrompt({ COMMON_PREFIX, sourceText, targetFormat }));

    } else {
      return new Response(JSON.stringify({ error: "Step non reconnu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // COMMON_PREFIX already includes BASE_SYSTEM_RULES + voice priority + CORE_PRINCIPLES + ANTI_SLOP + fullContext

    // ── Inject SERIES context (when this post belongs to a series) ──
    if (series_id && step === "generate") {
      try {
        const channelForSeries = isLinkedIn ? "linkedin" : isPinterest ? "pinterest" : isNewsletter ? "newsletter" : "instagram";
        const seriesCtx = await buildSeriesContext(supabase, series_id, episode_number, channelForSeries);
        if (seriesCtx) {
          console.log(`[creative-flow] series context injected (${contentType}): ${seriesCtx.seriesName} (ep #${seriesCtx.episodeNumber})`);
          systemPrompt += `\n\n${seriesCtx.block}`;
        }
      } catch (e) {
        console.error("[creative-flow] buildSeriesContext failed", e);
      }
    }


    // ── Deep Research (web search via Anthropic) ──
    // Texte de recherche ajouté au prompt : il rejoint aussi la source des relectures,
    // sinon ses chiffres sourcés passent pour « inventés » et sont retirés. Il est
    // transmis À PART (researchSource) : un chiffre qu'il est seul à fournir doit
    // garder sa source dans la phrase (gateNumbers, 04/10/2026).
    let researchSource = "";
    if (deepResearch && step === "generate") {
      // Check deep_research quota
      const drQuota = await checkQuota(userId, "deep_research", workspace_id);
      if (!drQuota.allowed) {
        return quotaDeniedResponse(drQuota, corsHeaders);
      }

      researchSource = await runDeepResearchWebSearch({
        userId,
        workspaceId: workspace_id,
        calendarContext,
        context,
        contentType,
        profile,
        effectiveObjective,
        objective,
        editorialFormatLabel,
        angle,
      });
      systemPrompt += researchSource;
    }

    // Recherche « creuser le sujet » pour posts, posts LinkedIn, reels et stories (hors légende photo).
    if (step === "generate" && !deepResearch && !isPhotoMode && (isCaption || isLinkedIn || isReel || isStories)) {
      const lived = livedCaseFromCreativeBody(body);
      if (skipDepthResearch(isStories, lived)) {
        // Décision de Laetitia (05/10/2026) : des stories sur SON cas ne parlent
        // que d'elle, sans aucun chiffre de recherche.
        console.log(`[creative-flow] stories sur son propre cas (${lived.reasons.join(", ")}) — aucune recherche, aucun chiffre de recherche`);
      } else {
        if (lived.provided) console.log(`[creative-flow] cas personnel fourni (${lived.reasons.join(", ")}) — ton cas d'abord, recherche en appui`);
        else if (lived.mode === "news_feeling") console.log(`[creative-flow] actu + ressenti fourni (${lived.reasons.join(", ")}) — son ressenti porte le contenu, recherche en profondeur`);
        const depthBlock = await creativeDepthBlock({ context, newsContext, activity, livedCase: lived.provided ? lived.answers.join("\n") || String(context || "") : undefined });
        if (depthBlock) {
          systemPrompt += depthBlock;
          researchSource = depthBlock;
        }
      }
    }

    // Accroches déjà écrites par cette utilisatrice sur CE sujet — garde
    // déterministe anti-redite (bilan hebdo 24/08 : trois reels d'un même sujet
    // ouvraient tous par « En 2026, on… », notés 100/100 chacun parce que le
    // gate juge un contenu ISOLÉMENT). Calculé UNE fois ici et transmis aux
    // chemins de correction et à la télémétrie. Lecture best-effort : une
    // erreur renvoie [] et ne change rien.
    // ⚠️ AVANT l'aiguillage SSE, jamais dedans : un await de plus une fois le
    // flux ouvert, c'est le deadlock déjà vécu (corps lu DANS le stream).
    const echoSubject = typeof context === "string" ? context : undefined;
    const previousHooks = await fetchPreviousHooks(userId, echoSubject, undefined, workspace_id);
    if (isStories) {
      // Stories : la redite d'accroche se voit aussi ENTRE sujets (même amorce
      // trois semaines plus tard sur un autre thème) → on ajoute les accroches
      // des dernières séquences de la même personne, tous sujets confondus.
      for (const h of await fetchPreviousHooksByFormat(userId, "stories", undefined, workspace_id)) {
        if (!previousHooks.includes(h)) previousHooks.push(h);
      }
    }
    if (previousHooks.length) {
      console.log(`[creative-flow] ${previousHooks.length} accroche(s) déjà écrite(s) sur ce sujet — garde anti-redite active`);
    }

    // ── Streaming SSE (generate step) ──
    // Activé pour : texte pur, ET pour LinkedIn photo (sinon la socket casse pendant la vision).
    const wantsStream = req.headers.get("Accept") === "text/event-stream";
    const isLinkedInPhotoStream = !!body.photo_mode && isLinkedIn && !!body.photos?.[0]?.base64;
    const canStreamPhoto = isLinkedInPhotoStream && !deepResearch;
    if (wantsStream && step === "generate" && !deepResearch && !isStories && !isReel && (!body.photo_mode || canStreamPhoto)) {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
      const model = getModelForAction("content");

      if (canStreamPhoto) {
        return streamLinkedInPhotoVision({ apiKey, model, systemPrompt, body, contentType, answers, context, corsHeaders, userId, workspace_id, audienceAddress });
      }

      if (isLinkedIn) {
        return runWithHeartbeatSSE(corsHeaders, (emitStatus) => runLinkedInTwoStep({ model, systemPrompt, userPrompt: userPrompt!, corsHeaders, userId, workspace_id, body, fullContext, researchSource, audienceAddress, echoSubject, previousHooks }, emitStatus));
      }

      if (isNewsletter) {
        return runWithHeartbeatSSE(corsHeaders, (emitStatus) => runNewsletterTwoStep({ model, systemPrompt, userPrompt: userPrompt!, corsHeaders, userId, workspace_id, body, context, newsContext, fullContext, researchSource, brandGuardText, previousHooks, audienceAddress }, emitStatus));
      }

      if (isCarousel) {
        return retiredCarouselStreamResponse(corsHeaders);
      }

      return streamDefaultPostSSE({ apiKey, model, systemPrompt, userPrompt: userPrompt!, corsHeaders, userId, workspace_id, body, fullContext, researchSource, brandGuardText, echoSubject, previousHooks, audienceAddress, qualityFormat: typeof contentType === "string" && contentType ? contentType : "post" });
    }

    // ── Call Anthropic ──
    let rawContent: string;
    // Une seule des branches ci-dessous s'exécute → un sink partagé suffit.
    const finalUsage: UsageSink = {};

    if (step === "recycle") {
      return await handleRecycleStep({ corsHeaders, userId, workspace_id, formats, sourceText, body, formatLabels, COMMON_PREFIX, objectiveBlock, ctx, profile });
    }

    if (step === "questions" && body.photo_mode && body.photos?.[0]?.base64) {
      rawContent = await runVisionQuestions({ body, contentType, context, objective, QUESTIONS_PREFIX, brandingContext, brandVocabBlock, recentBriefsContext, finalUsage });
    } else if (step === "generate" && body.photo_mode && body.photos?.[0]?.base64) {
      rawContent = await runVisionGenerate({ body, contentType, context, answers, systemPrompt, finalUsage, audienceAddress });
    } else {
      const { maxTokens, tempText, modelForCall, abortMs, structuredTool } = callOptionsForStep({ step, isLinkedIn, isPhotoMode, context });
      rawContent = structuredTool
        ? await callAnthropic({
            model: modelForCall,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt! }],
            temperature: tempText,
            max_tokens: maxTokens ?? 4096,
            abortTimeoutMs: abortMs,
            tool: structuredTool,
          }, finalUsage)
        : await callAnthropicSimple(modelForCall, systemPrompt, userPrompt!, tempText, maxTokens, finalUsage, abortMs);

      // Step "adjust" (bouton "Ajuster" de CreerStepEdit.tsx) : jamais streamé, sans
      // tool forcé quel que soit le format → le modèle peut renvoyer du JSON en texte
      // libre illisible (audit slop 18/08 : ~1 génération non-streamée sur 3 sur ce
      // chemin). Un seul retry avant le 502 sec suffit à verrouiller ce point precis
      // (pas étendu aux autres steps ici, hors périmètre de ce fix).
      if (step === "adjust" && tryParseAiJson<any>(rawContent, `creative-flow:${step}`) === null) {
        console.warn("[creative-flow] parse échec (adjust), retry unique");
        rawContent = await callAnthropicSimple(modelForCall, systemPrompt, userPrompt!, tempText, maxTokens, finalUsage, abortMs);
      }
    }

    // Plus de fallback { raw } muet : une réponse illisible = erreur claire (502),
    // sans débiter le quota (logUsage est plus bas). Parsing robuste centralisé.
    const parsed = tryParseAiJson<any>(rawContent, `creative-flow:${step}`);
    if (parsed === null) {
      console.warn("[creative-flow] parse échec, raw=", String(rawContent || "").slice(0, 500));
      return new Response(
        JSON.stringify({ error: "La génération a échoué (réponse IA illisible). Réessaie." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ajustement sans texte (JSON valide mais vide) : erreur claire, sans débit.
    // Avant le 14/10/2026, le front gardait l'ancien texte et le crédit partait.
    if (step === "adjust" && (typeof parsed?.content !== "string" || !parsed.content.trim())) {
      console.warn("[creative-flow] adjust sans contenu, raw=", String(rawContent || "").slice(0, 300));
      return new Response(
        JSON.stringify({ error: "L'ajustement n'a rien renvoyé. Ton texte est inchangé, réessaie." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Chaîne de finition par format : postprocess.ts (fiche 3, lot E).
    const { earlyExit, storiesGate, textEchoesBefore } = await finishGenerated(parsed, { step, isLinkedIn, isPhotoMode, isNewsletter, isReel, isPinterest, isStories, context, contentType, body, rawContent, corsHeaders, audienceAddress, fullContext, researchSource, brandGuardText, echoSubject, previousHooks, newsContext, effectiveObjective, storiesPhotoCatalog });
    if (earlyExit) return earlyExit;

    // ═══ TÉLÉMÉTRIE QUALITÉ (stories / reel / LinkedIn) ═══
    if (step === "generate") {
      await logGenerationQualityTelemetry(parsed, { userId, context, body, newsContext, fullContext, researchSource, brandGuardText, finalUsage, workspace_id, isStories, isReel, isLinkedIn, previousHooks, storiesGate, hookEchoesBefore: textEchoesBefore });
    }

    // Ne débite que les steps facturés (generate/adjust/recycle) ; angles/questions/follow-up/dictation = gratuits.
    if (isBilledStep) {
      await logUsage(userId, "content", "creative_flow", finalUsage.total_tokens, finalUsage.model, workspace_id);
    }
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    if (e instanceof ValidationError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (e?.status === 429) {
      return new Response(JSON.stringify({ error: "Trop de requêtes. Réessaie dans un moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Les erreurs Anthropic portent déjà un message utilisateur clair (troncature 422,
    // surcharge 529, timeout 504…). Avant, la troncature ("La génération a été coupée
    // car trop longue") tombait dans le message générique "L'IA a eu un blanc" (le
    // filtre includes("IA") est sensible à la casse) : indiagnosticable depuis le front.
    if (e instanceof AnthropicError) {
      console.error("creative-flow anthropic error:", e.status, e.message);
      const status = e.status >= 400 && e.status <= 599 ? e.status : 500;
      return new Response(JSON.stringify({ error: e.message }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("creative-flow error:", e);
    const userMessage = e?.message?.includes("API") || e?.message?.includes("IA")
      ? e.message
      : "L'IA a eu un blanc. Réessaie dans quelques instants.";
    return new Response(JSON.stringify({ error: userMessage }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
