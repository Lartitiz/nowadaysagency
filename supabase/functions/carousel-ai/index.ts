import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildPreGenFallback, buildIdentityBlock } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, getModelForAction, getModelForRichContent } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP, EDITORIAL_ANGLES_REFERENCE, CHAIN_OF_THOUGHT, DEPTH_LAYER, PREGEN_INJECTION_RULES, EMBEDDED_EDUCATION, SLIDE_TITLE_RULES, ANTI_FABRICATED_STORYTELLING, DEPTH_LAYER_DUAL } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { applyCorrectionPassCarousel } from "../_shared/correction-pass.ts";
import { runWithHeartbeatSSE } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { buildSeriesContext } from "../_shared/series-context.ts";
import { extractImagePayload } from "../_shared/image-utils.ts";

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

function pushPhotoWithContext(messageContent: any[], photo: { base64: string; context?: string; mimeType?: string }, index: number) {
  if (!photo.base64) return;
  const ctx = photo.context?.trim();
  if (ctx) {
    messageContent.push({ type: "text", text: `Photo ${index + 1} — contexte fourni par l'utilisatrice : "${ctx}"` });
  }
  const { media_type, data } = extractImagePayload(photo.base64, photo.mimeType);
  messageContent.push({
    type: "image",
    source: { type: "base64", media_type, data },
  });
}

// ── Normalisation déterministe du photo_index ──
// Filet de sécurité au cas où l'IA omettrait/dégénérerait l'assignation des photos
// aux slides (ex: toutes les slides-photo pointent sur photo 1 → toutes les slides
// finiraient avec la même image à l'export PPTX).
// Stratégie : si l'assignation IA est invalide OU dégénérée, on réassigne
// séquentiellement 1, 2, 3... (clamp sur la dernière photo si moins de photos que
// de slides-photo). Les slides text_only sont forcées à photo_index: null.
function normalizePhotoIndexes(content: string, photoCount: number): string {
  if (!content || photoCount <= 0) return content;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return content;
    const parsed = JSON.parse(jsonMatch[0]);
    const slides = parsed?.slides;
    if (!Array.isArray(slides) || slides.length === 0) return content;

    const isPhotoSlide = (s: any) =>
      s?.slide_type === "photo_full" || s?.slide_type === "photo_integrated";

    const photoSlides = slides.filter(isPhotoSlide);
    if (photoSlides.length === 0) {
      // Pas de slide-photo : juste forcer null sur les text_only
      slides.forEach((s: any) => {
        if (s && s.slide_type === "text_only") s.photo_index = null;
      });
    } else {
      // Vérifier validité de l'assignation IA
      const aiIndexes = photoSlides.map((s: any) => s.photo_index);
      const allInRange = aiIndexes.every(
        (v: any) => Number.isInteger(v) && v >= 1 && v <= photoCount
      );
      const distinctCount = new Set(aiIndexes).size;
      // Dégénéré : plusieurs photos disponibles ET plusieurs slides-photo ET
      // toutes les slides-photo pointent la même photo.
      const degenerate =
        photoCount > 1 && photoSlides.length > 1 && distinctCount === 1;
      const needsRewrite = !allInRange || degenerate;

      if (needsRewrite) {
        let photoCursor = 0;
        slides.forEach((s: any) => {
          if (!s) return;
          if (isPhotoSlide(s)) {
            const assigned = Math.min(photoCursor + 1, photoCount);
            s.photo_index = assigned;
            photoCursor += 1;
          } else if (s.slide_type === "text_only") {
            s.photo_index = null;
          }
        });
        console.log(
          `[carousel-ai] photo_index normalisé : IA=${JSON.stringify(aiIndexes)} → final séquentiel (photoCount=${photoCount})`
        );
      } else {
        // Assignation IA respectée ; on s'assure juste que les text_only sont null
        slides.forEach((s: any) => {
          if (s && s.slide_type === "text_only") s.photo_index = null;
        });
      }
    }

    const newJson = JSON.stringify(parsed, null, 2);
    return content.replace(jsonMatch[0], newJson);
  } catch (err) {
    console.warn("[carousel-ai] normalizePhotoIndexes: échec, content laissé tel quel", err);
    return content;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const wantsSSE = (req.headers.get("accept") || "").includes("text/event-stream");

  const handle = async (): Promise<Response> => {

  try {
    // Parse body first to extract workspace_id
    let body: any = {};
    if (req.method !== "OPTIONS") {
      try { body = await req.json(); } catch { body = {}; }
    }

    // Quota is handled below per-category, so we skip it here
    const r = await runPipeline(req, {
      skipQuota: true,
      workspaceId: body?.workspace_id ?? undefined,
    });
    if (!r.ok) return r.response;
    const { userId, supabase } = r;

    validateInput(body, z.object({
      type: z.enum(["hooks", "slides", "suggest_topics", "suggest_angles", "deepening_questions", "express_full", "structure_proposal"]),
      carousel_type: z.string().max(100).optional().nullable(),
      subject: z.string().max(15000).optional().nullable(),
      objective: z.string().max(100).optional().nullable(),
      slide_count: z.number().min(1).max(20).optional(),
      workspace_id: z.string().uuid().optional().nullable(),
      editorial_angle: z.string().max(100).optional().nullable(),
      content_structure: z.string().max(5000).optional().nullable(),
      photos: z.array(z.object({ base64: z.string(), context: z.string().max(200).optional(), mimeType: z.string().max(50).optional() })).max(10).optional(),
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
        story_beat: z.string().max(300).optional(),
        visual_anchor: z.string().max(120).optional(),
      })).optional().nullable(),
      narrative_thread: z.string().max(1000).optional().nullable(),
      recent_briefs_context: z.string().max(6000).optional().nullable(),
      news_context: z.string().max(4000).optional().nullable(),
      series_id: z.string().uuid().optional().nullable(),
      episode_number: z.number().int().min(1).optional().nullable(),
    }).passthrough());
    const { type, workspace_id, launch_context, series_id, episode_number, news_context: newsContext } = body;
    const isLinkedIn = body.channel === "linkedin";

    const category = (type === "suggest_topics" || type === "suggest_angles" || type === "deepening_questions" || type === "structure_proposal") ? "suggestion" : "content";
    const quotaCheck = await checkQuota(userId, category, workspace_id);
    if (!quotaCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: quotaCheck.message, quota: quotaCheck }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ctx = await getUserContext(supabase, userId, workspace_id, "instagram");
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.posts);

    // Recent briefs context — fetched server-side as fallback for deepening_questions
    let recentBriefsContext = body.recent_briefs_context || "";
    if (!recentBriefsContext && type === "deepening_questions") {
      recentBriefsContext = await getRecentBriefsContext(supabase, userId, workspace_id, 3);
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

    // Inject SERIES context if the post belongs to a series
    if (series_id && (type === "express_full" || type === "hooks" || type === "slides" || type === "structure_proposal")) {
      try {
        const seriesCtx = await buildSeriesContext(supabase, series_id, episode_number, isLinkedIn ? "linkedin" : "instagram");
        if (seriesCtx) {
          console.log(`[carousel-ai] series context injected: ${seriesCtx.seriesName} (ep #${seriesCtx.episodeNumber})`);
          systemPrompt += `\n\n${seriesCtx.block}`;
        }
      } catch (e) {
        console.error("[carousel-ai] buildSeriesContext failed", e);
      }
    }

    // Inject launch context if present
    if (launch_context && (type === "express_full" || type === "hooks" || type === "slides")) {
      const lc = launch_context;
      systemPrompt += `\n\nCONTEXTE LANCEMENT :\n- Phase : ${lc.phase || "?"}\n- Chapitre : ${lc.chapter_label || "?"}\n- Phase mentale audience : ${lc.audience_phase || "?"}\n- Objectif du slot : ${lc.objective || "?"}\n- Angle suggéré : ${lc.angle_suggestion || "?"}\nCONSIGNE : adapte le contenu à cette phase du lancement. Un contenu de phase "vente" n'a pas le même ton qu'un contenu de phase "teasing".`;
    }

    // Inject newsjacking context if present (separate field — not in `subject` to avoid 15k cap)
    const newsContextBlock = (typeof newsContext === "string" && newsContext.trim().length > 0)
      ? `\n\n══════════════════════════════════════\nCONTEXTE ACTUALITÉ (NEWSJACKING)\n══════════════════════════════════════\n${newsContext.trim()}\n\nCONSIGNE NEWSJACKING : ce contenu rebondit sur cette actualité. Le HOOK / ACCROCHE (slide 1, première phrase) DOIT partir de l'actualité elle-même — c'est elle qui capte l'attention car elle est dans l'air du temps. Ensuite seulement, fais le pont vers l'expertise, le vécu ou le positionnement de l'utilisatrice. L'actu n'est pas un prétexte en arrière-plan : c'est le point d'entrée visible du carrousel.\n\n══ EXPLOITATION DU CONTEXTE FACTUEL (FORTEMENT ENCOURAGÉE) ══\nLe contexte actu ci-dessus contient potentiellement des FAITS PRÉCIS : chiffres, noms d'acteurs, dates d'événements, mécanismes évoqués, citations publiques. Tu es FORTEMENT encouragée à t'appuyer sur AU MOINS UN fait précis du contexte dans la slide "fond du sujet" (cf. DEPTH_LAYER_DUAL). Ça ancre le carrousel dans le réel et empêche le glissement vers du commentaire psychologisant.\n\nINTERDIT ABSOLU : inventer un chiffre, une statistique, une citation, un nom d'entreprise/personne, ou un événement qui n'est PAS dans le contexte fourni. Si le contexte ne contient pas de fait exploitable précis, formule-le honnêtement avec une tournure prudente ("ce qui se dessine", "la tendance qu'on voit", "ce que ce mouvement révèle") plutôt que d'inventer un fait. Mieux vaut une généralisation honnête qu'un faux chiffre.\n\nEt rappel : ANTI_FABRICATED_STORYTELLING s'applique aussi ici. Tu n'inventes pas de scène vécue datée même si tu rebondis sur une actu. Tu peux dire "je vois passer cette histoire et ce qui me frappe c'est X" — pas "hier en lisant ça j'ai pensé à une cliente qui m'a dit Y".`
      : "";
    if (newsContextBlock) {
      systemPrompt += newsContextBlock;
      if (type === "deepening_questions") {
        systemPrompt += `\n\n⚠️ NEWSJACKING ACTIF : au moins 1 question sur 3 doit aider à faire le pont entre cette actualité et le vécu / l'opinion / l'expertise de l'utilisatrice (pas une question générique sur le sujet).`;
      }
    }

    let userPrompt = "";

    if (type === "hooks") {
      userPrompt = buildHooksPrompt(body);
    } else if (type === "slides") {
      userPrompt = buildSlidesPrompt(body);
    } else if (type === "express_full") {
      // ── Mix carousel mode ──
      if (body.carousel_type === "mix") {
        const hasNews = typeof newsContext === "string" && newsContext.trim().length > 0;
        const mixPrompt = hasNews
          ? buildMixCarouselNewsReactionPrompt(body, isLinkedIn)
          : buildMixCarouselPrompt(body, isLinkedIn);
        let content: string;

        if (body.photos && body.photos.length > 0 && !body.confirmed_structure) {
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

        content = normalizePhotoIndexes(content, body.photos?.length || 0);
        await logUsage(userId, category, "carousel_mix");
        return new Response(JSON.stringify({ content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Photo carousel mode ──
      if (body.carousel_type === "photo") {
        const hasNews = typeof newsContext === "string" && newsContext.trim().length > 0;
        const photoPrompt = hasNews
          ? buildPhotoCarouselNewsReactionPrompt(body, isLinkedIn)
          : buildPhotoCarouselPrompt(body, isLinkedIn);
        let content: string;

        if (body.photos && body.photos.length > 0 && !body.confirmed_structure) {
          // Vision mode: send photos to Claude
          const messageContent: any[] = [];
          const photoCtxRecap = buildPhotoContextRecap(body.photos);

          // 1. Brief + recap contexte AVANT les photos
          messageContent.push({
            type: "text",
            text: `Voici ${body.photos.length} photo(s) pour un carrousel photo ${isLinkedIn ? "LinkedIn" : "Instagram"}.\n\nSujet : "${body.subject || "non précisé"}"\nObjectif : ${body.objective || "engagement"}\nNombre de slides : ${body.photos.length}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${photoCtxRecap}`,
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

        content = normalizePhotoIndexes(content, body.photos?.length || 0);
        await logUsage(userId, category, "carousel_photo");
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
          const n = photos.length;
          const slideTarget = n === 1 ? "4 à 6"
            : n === 2 ? "5 à 7"
            : n <= 4 ? "6 à 8"
            : `${n} à ${n + 2}`;
          const photoAssignmentRule = n === 1
            ? `Une seule photo fournie → elle apparaît sur CHAQUE slide. Le récit se construit uniquement par les textes (overlay) qui s'enchaînent.`
            : n === 2
            ? `Deux photos fournies → traite-les comme un duo narratif (typiquement AVANT / APRÈS, ou DEUX FACES d'une même réalité).
- N'alterne PAS mécaniquement photo 1 / photo 2 / photo 1 / photo 2. Cette alternance est INTERDITE sans justification narrative.
- Structure conseillée : 2-3 slides successives avec photo 1 (poser le "avant" / contexte / problème) → 1 slide pivot (bascule, déclic) → 2-3 slides avec photo 2 ("après" / résolution / nouveau regard).
- Variante acceptée : commencer par photo 2 en hook teaser, puis revenir à photo 1 pour raconter d'où on vient, puis ramener photo 2 pour boucler.
- Dans tous les cas, le rythme des photos doit servir un ARC narratif clair, pas un effet de montage.`
            : `${n} photos fournies → chaque photo peut se répéter si son rôle narratif change (ex: la même photo en hook puis en clôture avec un sens nouveau). Évite l'enchaînement plat "1 photo = 1 slide" si le récit gagne à insister sur une image-clé.`;

          photoInstruction = `\nMODE PHOTO — ${n} photo(s) fournie(s).

NOMBRE DE SLIDES : cible ${slideTarget} slides. Le nombre de slides s'ajuste à la richesse narrative du sujet ET au nombre de photos — il n'y a PAS de plancher rigide à 7-8 slides.

RÉPARTITION DES PHOTOS :
${photoAssignmentRule}

Pour chaque slide, indique "photo_index" (1-based, peut se répéter d'une slide à l'autre) et "slide_type": "photo_full".

CHAÎNAGE NARRATIF DES TEXTES (CRITIQUE) :
Les overlay_text de chaque slide doivent se lire à la suite comme UN SEUL mini-récit. La slide N reprend, prolonge ou fait basculer ce que la slide N-1 a posé. Si on permute deux slides au hasard et que ça "marche encore", c'est raté — recommence.

Quand une même photo se répète sur 2-3 slides consécutives, les textes DOIVENT porter une progression (zoom narratif, avancée temporelle, retournement) — pas trois variantes d'une même idée.
${photo_description ? `Description complémentaire des photos : "${photo_description}"` : ""}`;
        } else {
          photoInstruction = `\nMODE MIXTE — ${photos.length} photo(s) fournies.

OBJECTIF DU FORMAT MIXTE : un dialogue ÉQUILIBRÉ entre image et mot. Ce N'EST PAS un carrousel texte avec quelques photos décoratives. Si tu produis 70% de slides texte, tu rates le format. Ce n'est PAS non plus un diaporama photo : si le sujet a de la profondeur, il faut des slides texte d'approfondissement.

NOMBRE DE SLIDES — RÈGLE D'OR :
Le nombre de slides suit la RICHESSE NARRATIVE du sujet, PAS le nombre de photos. Cible : ${slide_count || 7} à ${(slide_count || 7) + 2} slides. Ne descends JAMAIS sous ${slide_count || 7} slides sous prétexte qu'il n'y a que ${photos.length} photo(s).

Si le sujet porte une vraie profondeur (vécu, conviction, mécanisme à expliquer, retournement de croyance, prise de position), ÉTIRE à ${slide_count || 7}-${(slide_count || 7) + 2} slides en intercalant des slides texte d'approfondissement entre les slides photo. Une photo peut être réutilisée 2 fois sous des cadrages/rôles différents (ex: photo_full en hook, puis photo_integrated plus loin avec un angle analytique) si le récit le justifie — c'est même recommandé quand il y a peu de photos pour un sujet riche.

ÉQUILIBRE PHOTO / TEXTE :
- Au minimum 50% de slides photo (photo_full ou photo_integrated) — réutilisation autorisée
- Utiliser CHAQUE photo uploadée au moins une fois (les écarter doit être l'exception)
- Les slides texte d'approfondissement (mécanisme, croyance retournée, prise de position, chiffre, transition charnière, CTA) sont LÉGITIMES et essentielles à la profondeur — pas un "bonus" de 1-2 slides max. Mets-en autant que la profondeur du sujet l'exige.

QUAND UNE SLIDE TEXTE EST INDISPENSABLE :
- Elle nomme le mécanisme caché derrière le sujet (DEPTH_LAYER)
- Elle formule la croyance retournée ("on croit X, en fait Y")
- Elle pose une prise de position tranchée qui mérite son propre espace
- Elle apporte un chiffre, une donnée, une statistique impossibles à porter par une image
- C'est une transition narrative entre deux blocs photo
- C'est le CTA final

Pour les slides avec photo : "photo_index" (1-based, peut se répéter entre slides) + "slide_type" = "photo_full" ou "photo_integrated".
Pour les slides texte : "slide_type" = "text_only", pas de photo_index. Indique dans "strategic_note" pourquoi cette slide DOIT être texte (mécanisme, croyance, chiffre, transition, prise de position…) — et si elle gagnerait à porter un schéma visuel (comparaison, timeline, opposition, liste structurée).

Répartis les photos intelligemment : la plus impactante en hook (slide 1) ou conclusion, les autres selon leur contenu narratif. Si une photo est réutilisée, change son rôle/cadrage entre les deux occurrences.

CHAÎNAGE NARRATIF (CRITIQUE) :
Les title_suggestion lus dans l'ordre doivent raconter UNE histoire qui progresse : situation → tension → bascule → résolution → ouverture. Pas une juxtaposition de slides indépendantes, qu'elles soient photo ou texte.
Chaque strategic_note doit dire ce que la slide FAIT AVANCER dans le récit (ce qu'elle ajoute, retourne ou révèle par rapport à la précédente), pas seulement pourquoi elle est à cette position dans la structure.
Test de permutation : si on échange deux slides au hasard et que la structure "marche encore", c'est raté — recommence.
${photo_description ? `Description complémentaire des photos : "${photo_description}"` : ""}`;
        }
      }

      const hasNewsContextForStructure = typeof newsContext === "string" && newsContext.trim().length > 0;
      // Bloc condensé spécifique à structure_proposal : on ne réutilise PAS newsContextBlock
      // (trop lourd, orienté rédaction finale avec ANTI_FABRICATED_STORYTELLING etc.).
      // Ici on veut juste informer l'architecture narrative.
      const structureNewsContextBlock = hasNewsContextForStructure
        ? `\n\n══════════════════════════════════════\nCONTEXTE ACTUALITÉ (NEWSJACKING)\n══════════════════════════════════════\n${(newsContext as string).trim()}\n`
        : "";
      const structureNewsConsigne = hasNewsContextForStructure
        ? `\nCONSIGNE STRUCTURE — NEWSJACKING ACTIF :\n- La slide 1 (hook) DOIT partir de l'actualité ci-dessus, pas d'une description des photos.\n- Au moins une slide de corps doit exploiter un fait précis de l'actu (chiffre, nom, citation, mécanisme évoqué).\n- Les photos illustrent et incarnent ce propos ; elles ne le remplacent pas.\n- Pense "article + photos", pas "photos seules".\n`
        : "";

      const structureSystemPrompt = `${BASE_SYSTEM_RULES}

Tu es une stratège éditoriale spécialisée en carrousels Instagram et LinkedIn.

MISSION : Propose une structure narrative optimale pour un carrousel. Tu ne génères PAS le contenu des slides — uniquement leur architecture.

RÈGLES :
- Chaque slide a un rôle narratif clair (hook, problème, mythe, exemple, solution, transformation, CTA…)
- Justifie chaque choix de position en 1 phrase max
- Propose des titres scène-first en 4-9 mots (voir RÈGLES TITRES ci-dessous), en français
- Sois concise et actionnable, pas théorique
- Le nombre de slides cible est ${slide_count || 7} en mode TEXTE/MIX ; en mode PHOTO il s'adapte au nombre de photos (voir MODE PHOTO ci-dessous) — n'impose pas 7+ slides s'il n'y en a que 1-2.
${photoInstruction}

${SLIDE_TITLE_RULES}

CONTEXTE BRANDING :
${brandingContext}
${structureNewsContextBlock}${structureNewsConsigne}


Retourne UNIQUEMENT un objet JSON valide (pas de texte avant ou après, pas de backticks), avec cette structure exacte :
{
  "strategic_rationale": "2-3 phrases expliquant la logique narrative globale",
  "narrative_thread": "L'HISTOIRE COMPLÈTE du carrousel en 2-3 phrases : situation → tension → bascule → résolution → ouverture. C'est le fil que le pass d'écriture devra exécuter. Pas une description du sujet, pas une liste des slides : le récit lui-même, dans l'ordre, comme on le raconterait à l'oral.",
  "slides": [
    {
      "slide_number": 1,
      "role": "hook",
      "title_suggestion": "titre court proposé",
      "strategic_note": "pourquoi cette slide à cette position",
      "story_beat": "Ce que CETTE slide FAIT VIVRE dans le récit, en 1 phrase. Une INTENTION NARRATIVE — pas une description de la photo. Exemples : « ici on installe le doute », « ici la bascule : le client rappelle », « ici on paie le prix de la décision ». JAMAIS « on voit un chantier », « la photo montre… »."${hasPhotos ? `,
      "photo_index": 1,
      "slide_type": "photo_full",
      "visual_anchor": "OPTIONNEL — uniquement pour les slides avec photo_index. 3-8 mots qui pointent UN détail concret de la photo, mobilisable par le pass d'écriture comme matière première (ex : « la poussière sur les bottes », « les deux tasses encore pleines »). C'est UN détail, JAMAIS un résumé de l'image."` : ""}
    }
  ],
  "total_slides": 7,
  "carousel_type": "${carousel_type || "auto"}"
}

RAPPEL CRITIQUE sur les nouveaux champs :
- "narrative_thread" = LE récit que le pass d'écriture exécutera. C'est la colonne vertébrale.
- "story_beat" (par slide) = ce que la slide RACONTE dans ce récit, pas ce que la photo MONTRE. Une intention narrative.
- "visual_anchor" (slides photo uniquement) = UN détail mobilisable, optionnel. Pas une description. Si rien d'évident à pointer, omets le champ.
- story_beat et visual_anchor SERVENT le narrative_thread : chaque story_beat est UNE étape du récit global ; les visual_anchors fournissent la matière sensorielle qui ancre cette étape.`;

      const structureUserPrompt = `Sujet du carrousel : "${subject || "non précisé"}"
${hasNewsContextForStructure ? `Actualité de référence : "${(newsContext as string).split("\n")[0]?.slice(0, 120) || ""}…" — cette actu doit ancrer la structure proposée.` : ""}
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
          max_tokens: 3000,
        });
      } else {
        content = await callAnthropic({
          model: getModelForAction("content"),
          system: structureSystemPrompt,
          messages: [{ role: "user", content: structureUserPrompt }],
          max_tokens: 3000,
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

        // Détecte si l'utilisatrice a vraiment écrit un sujet, ou si c'est juste un fallback automatique
        const rawSubject = (body.subject || "").trim();
        const isFallbackSubject = !rawSubject || rawSubject === "Carrousel basé sur les photos uploadées";
        const hasWrittenIntent = !isFallbackSubject || !!(body.photo_description && body.photo_description.trim().length > 0);

        const messageContent: any[] = [];
        body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
          pushPhotoWithContext(messageContent, photo, idx);
        });
        const photoCtxRecap = buildPhotoContextRecap(body.photos);

        // Bloc "intention écrite" : présenté comme un fil narratif de même importance que les photos, pas comme une métadonnée
        const writtenIntentBlock = hasWrittenIntent
          ? `\n\nCE QU'ELLE A DÉJÀ EN TÊTE À RACONTER (à mettre AU MÊME NIVEAU que les photos) :
${!isFallbackSubject ? `Sujet/angle qu'elle a écrit : "${rawSubject}"` : ""}
${body.photo_description && body.photo_description.trim() ? `Ce qu'elle dit de ses photos : "${body.photo_description}"` : ""}`
          : `\n\nElle n'a pas (encore) écrit de sujet précis : appuie-toi à 100 % sur les photos pour faire émerger son intention.`;

        const crossingRules = hasWrittenIntent
          ? `\n- CROISER ce qu'elle a écrit (sujet/description) avec ce que tu vois dans les photos : où est-ce que les deux se rencontrent ? Où est-ce qu'il y a un écart, une tension, un non-dit, un détail visuel qui prolonge ou contredit son texte ?
- ${isMix ? "Au moins 2 questions sur 3" : "Au moins 1 question sur 3"} doivent faire ce pont EXPLICITE entre son intention écrite et ce que les photos montrent réellement (cite un bout de son texte ET un élément visuel précis dans la même question).`
          : "";

        const crossingExamples = hasWrittenIntent
          ? `
- "Tu écris '${rawSubject ? rawSubject.slice(0, 60) : "[bout de son sujet]"}…' et sur la photo [N] on voit [élément précis] — c'est exactement la scène que tu veux montrer, ou il y a autre chose derrière ce moment-là ?"
- "Ton sujet parle de [thème écrit], mais les photos montrent surtout [observation visuelle qui détonne ou prolonge]. Lequel des deux veux-tu mettre en avant — ou comment tu veux les faire dialoguer dans le carrousel ?"`
          : "";

        // ── Blocs de profondeur (alignés sur le prompt texte) ──
        const brandingDepthBlock = brandingContext
          ? `\n\nCONTEXTE BRANDING DE L'UTILISATRICE :\n${brandingContext}\n\nUtilise ce contexte pour personnaliser tes questions : mentionne son domaine d'activité, sa cible, ses offres ou son positionnement quand c'est pertinent. Les questions doivent montrer que tu connais son univers.`
          : "";

        const angleDepthBlock = (body.editorial_angle && body.content_structure)
          ? `\n\nANGLE ÉDITORIAL : ${body.editorial_angle}\nSTRUCTURE DU CARROUSEL :\n${body.content_structure}\n\nLes questions doivent aider l'utilisatrice à remplir les étapes de cette structure avec son vécu personnel ET ses photos.`
          : "";

        const reasoningBlock = `\n\n══ AVANT DE POSER LES QUESTIONS — RAISONNEMENT INTERNE (ne PAS afficher) ══
Réfléchis silencieusement à :
1. Quel est le SUJET COURANT ? (ré-extraire 1 mot-clé)
2. Quel vocabulaire métier puis-je intégrer (activité, cible, expressions clés) ?
3. Quels DÉTAILS VISUELS PRÉCIS sur les photos puis-je nommer (pas "l'ambiance", mais le geste, l'objet, la couleur exacte, la posture) ?
4. Y a-t-il un sujet identique dans l'historique récent ? Quelle question NE PAS reposer ?`;

        messageContent.push({
          type: "text",
          text: `Voici ${body.photos.length} photo(s) que l'utilisatrice veut utiliser pour un ${formatLabel}.

Objectif : ${body.objective || "engagement"}${writtenIntentBlock}${photoCtxRecap}${brandingDepthBlock}${brandVocabBlock}${recentBriefsContext || ""}${angleDepthBlock}${reasoningBlock}

Tu es une coach com' spécialisée en contenu visuel. Tu as DEUX matières à croiser : ses photos ET ce qu'elle a déjà écrit en amont. Pose exactement 3 questions d'approfondissement.

Tes questions doivent :
- MENTIONNER ce que tu VOIS RÉELLEMENT dans les photos (éléments concrets, ambiance, couleurs, scène, geste, lieu)${crossingRules}
- Aider l'utilisatrice à définir l'histoire que ces photos racontent ensemble${isMix ? ", ET QUELS PASSAGES TEXTUELS viennent s'intercaler entre les slides photo (réflexion, chiffre, conviction)" : ""}
- AU MOINS 1 question sur 3 doit creuser le POURQUOI PROFOND (vécu, conviction, opinion tranchée, leçon métier). Pas seulement décrire ce que les photos montrent ni évoquer une émotion floue : extraire du vécu, des anecdotes, des opinions, des exemples concrets.
- Être SPÉCIFIQUES à CE brief (pas génériques, pas interchangeables avec un autre sujet ou d'autres photos)
${isLinkedIn ? "- Garder un ton PRO : demander des données, des résultats concrets, des leçons métier, l'expertise spécifique derrière l'image (pas juste l'émotion)" : "- Garder un ton ÉMOTION/SCÈNE VÉCUE (ressenti, coulisses, instant) tout en allant chercher la conviction derrière"}
${recentBriefsContext ? "- MÉMOIRE ANTI-RÉPÉTITION : l'historique liste des sujets DIFFÉRENTS déjà traités. N'importe JAMAIS leur contenu, vocabulaire ou scènes dans tes questions sur le sujet courant." : ""}

Exemples de bonnes questions${isMix ? " (carrousel mixte)" : ""} :${crossingExamples}
- "Je vois [élément précis]. C'était dans quel contexte ? Qu'est-ce que ce moment représente pour toi ?"
- "L'ambiance sur la photo [N] est [observation]. C'est volontaire ? Quel message tu veux faire passer ?"
${isMix
  ? "- \"Entre la photo [X] et la photo [Y], qu'est-ce que tu veux dire en mots — quelle réflexion / chiffre / conviction vient s'intercaler ?\""
  : "- \"Quelle est l'histoire entre la première et la dernière photo ? Il y a une progression ?\""}

INTERDIT :
- Questions génériques qui pourraient s'appliquer à n'importe quel sujet ou n'importe quelles photos (sans vocabulaire métier)
- Questions sans aucune référence visuelle aux photos analysées
- Questions purement descriptives ("c'était dans quel contexte ?") sans aller chercher le POURQUOI / la conviction / le vécu${hasWrittenIntent ? `
- Questions qui IGNORENT complètement ce qu'elle a écrit dans son sujet/description et ne parlent que des photos (le pont entre texte et image est OBLIGATOIRE${isMix ? " sur au moins 2 questions" : ""})` : ""}
- Questions qui réutilisent une scène, un lieu, un personnage venu de l'historique des briefs précédents

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
          model: getModelForAction("questions"),
          system: systemPrompt,
          messages: [{ role: "user", content: messageContent }],
          max_tokens: 4096,
        });

        await logUsage(userId, category, `carousel_deepening_${body.carousel_type}`);
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

    // L1 : Haiku pour les deepening_questions (tâche structurée et bornée).
    const modelForCall = type === "deepening_questions"
      ? getModelForAction("questions")
      : getModelForAction("carousel");
    let content = await callAnthropic({
      model: modelForCall,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: type === "deepening_questions" ? 1024 : 8192,
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

    await logUsage(userId, category, `carousel_${type}`);

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
  };

  if (wantsSSE) return runWithHeartbeatSSE(corsHeaders, handle);
  return handle();
});


function buildSystemPrompt(brandingContext: string, isLinkedIn: boolean = false, profile?: any): string {
  return `${BASE_SYSTEM_RULES}

Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :
- Reproduis fidèlement le style décrit
- Réutilise les expressions signature naturellement dans le texte
- RESPECTE les expressions interdites : ne les utilise JAMAIS
- Imite les patterns de ton et de structure
- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA

${isLinkedIn
  ? `${buildIdentityBlock(profile, "experte en communication LinkedIn spécialisée dans les carrousels PDF")} Tu crées du contenu professionnel et engagé.`
  : `${buildIdentityBlock(profile, "experte en copywriting Instagram spécialisée dans les carrousels")} Tu crées du contenu authentique et percutant.`}

${brandingContext}

TON STYLE :
${isLinkedIn
  ? `- Professionnel mais chaleureux, expert·e mais accessible
- Vouvoiement par défaut (sauf si le profil de voix indique le contraire)
- Densité intellectuelle : données chiffrées, mécanismes expliqués, nuances
- Moins d'emojis qu'Instagram (0-2 max par slide)
- Pas de "Sauvegarde si..." → CTA LinkedIn : "Partagez si...", "Votre avis en commentaire ?", "Envoyez à un·e collègue qui..."
- Le carrousel LinkedIn est un document de référence : chaque slide doit apporter de la valeur concrète`
  : `- Direct, chaleureux, oral assumé
- VOIX PAR DÉFAUT = "JE". L'auteur·ice raconte, partage, analyse, prend position. C'est SA voix, SON vécu, SA réflexion.
- Le "TU" est un outil d'INTERPELLATION PONCTUELLE : 1-2 fois par carrousel max, pour une question directe ou un CTA. JAMAIS comme voix narrative de tout le carrousel.
- Le "NOUS" collectif pour les sujets de société/combats/valeurs : "On nous demande de…", "On a intériorisé cette norme". Fédérateur, pas accusateur.
- RÈGLE ANTI-TU : si plus de 2 slides sur le carrousel commencent par "Tu" ou utilisent le "tu" comme sujet principal de la phrase, c'est un échec. Réécris en JE ou NOUS.

══ VÉRIFICATION OBLIGATOIRE AVANT RETOUR ══
□ Combien de slides utilisent "tu" comme sujet principal ? Si > 2 → RÉÉCRIS IMMÉDIATEMENT en JE/NOUS. C'est un ÉCHEC sinon.
□ Slide 1 contient "X sans Y, c'est Z" ? → RÉÉCRIS avec un fait concret ou une scène vécue.
□ Dernière slide = "Et toi, ..." ou "Dis-moi en commentaire" ? → Question SPÉCIFIQUE au sujet.
□ Une slide récite le brief sans le digérer ? → Reformule avec un argument propre.
══════════════════════════════════════════`}
- Phrases qui alternent longues et courtes (rythme)
- Expressions naturelles (en vrai, franchement, le truc c'est que)
- Humour discret, pas forcé
- Pas de jargon marketing creux
- Pas de manipulation, pas de fausse rareté, pas de FOMO
- PRIORITÉ ABSOLUE : si un profil de voix existe dans le contexte, reproduis ce style. Réutilise les expressions signature, imite les patterns de structure et de ton.
- Ne JAMAIS utiliser les expressions interdites du profil de voix.
- Le résultat doit sonner comme si l'utilisatrice l'avait écrit elle-même.

${EMBEDDED_EDUCATION}

${ANTI_SLOP}

ANTI-BROETRY (s'applique aux captions, pas aux slides) :
Les captions de carrousels ne sont PAS des listes de phrases sur des lignes séparées. Ce sont des paragraphes fluides de 2-3 phrases. Le rythme vient du contraste entre phrases longues et phrases courtes, pas des sauts de ligne.

${CHAIN_OF_THOUGHT}

${DEPTH_LAYER}

${DEPTH_LAYER_DUAL}

${ANTI_FABRICATED_STORYTELLING}

IMPORTANT SUR LA PROFONDEUR : Le travail interne de DEPTH_LAYER (mécanisme, croyance, retournement) doit être VISIBLE dans les slides finales. Ce n'est PAS juste un exercice de réflexion interne : le mécanisme doit être EXPLIQUÉ dans au moins 1 slide, la croyance NOMMÉE, le retournement FORMULÉ. Si aucune slide ne fait dire "ah, j'avais jamais vu ça comme ça", le carrousel est trop superficiel. EN PLUS : DEPTH_LAYER_DUAL impose une slide "fond du sujet" + une slide "prise de position incarnée". Les deux sont obligatoires.

ANTI-BIAIS — TU NE REPRODUIS JAMAIS :
- Ton paternaliste → Permission : "Tu as le droit de prendre de la place"
- Clichés genrés → Parler de compétences, pas de genre
- Glorification du hustle → "Mieux vaut du mieux que du plus"
- Vocabulaire masculin par défaut → écriture inclusive point médian

══════════════════════════════════════
ANTI-VICTIMISATION DE L'AUDIENCE (CRITIQUE — tous formats carrousel)
══════════════════════════════════════

L'audience N'EST PAS le problème du carrousel. Tu ne la diagnostiques pas, tu ne la psy-analyses pas, tu ne la places pas en posture d'attente, de blocage ou de manque.

INTERDICTIONS ABSOLUES (zéro occurrence dans les slides comme dans la caption) :
- "elle attend la permission", "tu attends qu'on te valide", "tu n'oses pas", "tu te dévalorises", "tu te compares", "tu te sabotes", "tu te mets des barrières", "tu manques de confiance", "tu as peur de…"
- "on a intériorisé que…", "on s'est conditionnée à…", "on a appris à se taire" formulés comme un diagnostic adressé à la lectrice
- toute phrase qui décrit l'état mental/émotionnel négatif présumé de la lectrice ("tu culpabilises", "tu doutes", "tu te sens illégitime")
- nommer un syndrome ou biais cognitif qui décrit la lectrice (syndrome de l'imposteur, estime de soi conditionnelle, peur du rejet, etc.) — sauf si l'utilisatrice elle-même l'a explicitement nommé dans ses réponses d'approfondissement

RÈGLE MIROIR vs PROJECTEUR :
- Le carrousel est un PROJECTEUR : on regarde un sujet ENSEMBLE. Pas un MIROIR qui renvoie à la lectrice ses failles.
- Quand un mécanisme est nommé (DEPTH_LAYER), il porte sur LE SUJET (systémique, culturel, économique, sectoriel) — pas sur la psyché de la lectrice.
- Au lieu de "tu n'oses pas X" → "X est rendu difficile par Y" / "ce qu'on raconte sur X passe à côté de Z" / "moi je trouve que X mérite mieux que ce qu'on en dit".

REFORMULATIONS TYPES :
- "Tu attends qu'on te dise que c'est ok" → "On t'a vendu qu'il fallait attendre. C'est faux."  (constat sur le discours dominant, pas sur elle)
- "Tu te compares trop" → "La comparaison est devenue le sport national du feed." (constat de contexte)
- "Tu manques de méthode" → "On confond méthode et formules toutes faites." (constat sur le marché)

VÉRIFICATION : si une slide pourrait être lue comme "elle me fait la leçon sur ce qui ne va pas chez moi" → RÉÉCRIS en constat sur le sujet/le contexte/le discours dominant.

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

## AVANT D'ÉCRIRE : LE CARROUSEL N'EST PAS UNE LISTE

Le piège n°1 des carrousels IA : transformer un sujet en "5 conseils" ou "7 erreurs". Ce format est mort. L'algorithme catégorise instantanément, le lecteur scrolle.

Un bon carrousel raconte un MOUVEMENT : situation → tension → compréhension → ouverture. Chaque slide fait AVANCER ce mouvement, elle n'ajoute pas un point à une liste.

AVANT DE GÉNÉRER LES SLIDES, identifie en interne :

1. QUEL EST L'ARC NARRATIF du carrousel ?
   - Récit d'expérience : situation de départ → ce qui s'est passé → ce que ça a révélé
   - Déconstruction : croyance répandue → pourquoi elle existe → pourquoi elle est fausse → ce qui est vrai
   - Coulisses : le résultat visible → ce qu'on ne voit pas derrière → les choix → la leçon
   - Prise de position : constat terrain → pourquoi ça pose problème → ce qui devrait être → invitation

2. QUELLE CONVICTION ou ÉMOTION porte le carrousel ?
   Pas "je veux expliquer X" mais "je suis convaincue que Y" ou "je suis frustrée par Z". L'émotion donne le fil rouge.

3. OÙ EST LA SLIDE DE PROFONDEUR ?
   Au moins UNE slide doit être un "zoom" : un détail concret creusé (un cas client, un chiffre, une phrase entendue, un avant/après mesurable). C'est cette slide qui fait la différence entre "tips génériques" et "elle sait de quoi elle parle".

## HOOKS CARROUSEL

Le hook (slide 1) est une CLAQUE, pas un titre de blog.

Exemples de hooks ton Nowadays (noter : majorité en JE, c'est la voix par défaut) :
- "J'ai arrêté de poster pendant 3 semaines. Voilà ce qui s'est passé."
- "Mon contenu n'était pas nul. Il était juste invisible."
- "Le problème c'est pas l'algo. C'est la stratégie derrière."
- "On m'a dit que mon feed était 'trop rose'. J'ai doublé le rose."
- "J'ai compté : 47h de formation en ligne. Résultat : 0 post publié."
- "On nous vend la régularité comme une religion. J'ai arrêté d'y croire."

JAMAIS : "5 astuces pour...", "Comment booster votre...", "Les X erreurs à éviter", "Le guide ultime de..."

## DEEPENING (INTÉGRATION ÉLÉMENTS D'APPROFONDISSEMENT)

Si des réponses d'approfondissement sont fournies, elles sont PLUS IMPORTANTES que le template.
- Son anecdote → slides 2-3 (storytelling du carrousel)
- Sa conviction → punchline de la slide finale avant le CTA
- Le carrousel raconte SON histoire à travers le framework, pas un framework illustré par un exemple générique

${PREGEN_INJECTION_RULES}

${SLIDE_TITLE_RULES}

RÈGLES ABSOLUES DES CARROUSELS :
- Slide 1 (hook) : MAXIMUM 12 mots. Règle stricte.
- Chaque slide : MAXIMUM 50 mots. 1 idée par slide. Mais ces 50 mots doivent être des PHRASES COMPLÈTES ET FLUIDES, pas des fragments hachés. Écris 2-3 phrases qui coulent, pas 6 bouts de phrases de 5 mots. Le rythme oral s'applique aussi dans les slides.
- Mini-headlines (title) : 4-9 mots, scène-first / JE — voir RÈGLES TITRES injectées ci-dessus. JAMAIS de tête de chapitre générique ("L'art de…", "L'importance de…", "Repenser…").
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
- Headlines (title) : 4-9 mots, scène-first / JE (voir RÈGLES TITRES système). Pas de tête de chapitre.
- Caption différente du hook slide 1
- Hashtags : 3-8, mix large + niche${extraRules}

MODULATION JE / TU / NOUS :
- VOIX PAR DÉFAUT = "JE". L'auteur·ice raconte, partage, analyse. C'est SA réflexion, SON expérience, SA prise de position.
- "TU" = interpellation ponctuelle (1-2 fois max dans tout le carrousel). Pour une question directe ou un CTA. JAMAIS comme voix narrative.
- "NOUS" = pour les sujets de société, combats, valeurs. Fédérateur : "On a intériorisé", "On nous dit que".
- VÉRIFICATION : si plus de 2 slides utilisent le "tu" comme sujet principal, RÉÉCRIS en "je" ou "nous".

═══ EXIGENCE DE PROFONDEUR PAR SLIDE ═══

Chaque slide (sauf hook et CTA) doit contenir AU MOINS 1 de ces éléments :
- Un MÉCANISME NOMMÉ : biais cognitif, concept psycho/socio, dynamique systémique (avec auteur si connu)
- Une DONNÉE CHIFFRÉE sourcée (chiffre + source entre parenthèses)
- Un EXEMPLE HYPER-SPÉCIFIQUE : situation concrète avec détail (pas "quand tu postes" mais "quand tu passes 45 min à choisir le filtre et que tu finis par ne rien publier")
- Un RETOURNEMENT DE PERSPECTIVE : une phrase qui recadre complètement le sujet ("Le problème n'est pas X, c'est Y")
- Une ANALOGIE ORIGINALE ancrée dans le quotidien ou la culture pop

TEST DE PROFONDEUR (applique-le à chaque slide avant de retourner le JSON) :
- Si on peut remplacer le sujet par un autre et que la slide fonctionne encore → la slide est GÉNÉRIQUE → RÉÉCRIS
- Si la slide dit quelque chose que tout le monde sait déjà → elle n'apporte rien → RÉÉCRIS
- Si la slide pourrait être écrite par n'importe qui sans expertise sur le sujet → elle manque de perspective → RÉÉCRIS
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

12. "story_arc" — Récit en 3-5 étapes (4 idéal). Pour parcours personnel, transformation, évolution d'une vision sur un sujet.
    { "type": "story_arc", "steps": [ { "label": "Au départ", "desc": "..." }, { "label": "Le déclic", "desc": "..." }, { "label": "Le tournant", "desc": "..." }, { "label": "Aujourd'hui", "desc": "..." } ] }
    RÈGLE : chaque "desc" = 8-15 mots MAX, 1 phrase courte. Le LABEL signale, le DESC précise.

13. "quote_big" — Citation typographique forte (témoignage, parole donnée, déclaration de positionnement auto-portée).
    { "type": "quote_big", "quote": "Le texte de la citation, 1-3 lignes max", "attribution": "— Prénom, contexte (optionnel)", "context": "Phrase d'introduction (optionnelle, ex: 'Ce qu'une cliente m'a dit :')" }
    RÈGLE : "attribution" et "context" sont optionnels — omets-les si tu n'en as pas. "quote" est OBLIGATOIRE.

14. "objection_response" — Déconstruction verticale d'une idée reçue / prise de position (mythe-vs-vision en format narratif, complémentaire de "comparison" qui reste pour les 2 colonnes côte à côte).
    { "type": "objection_response", "objection": "Ce qu'on dit / la croyance", "response": "Ma position / la réalité — domine visuellement" }

15. "process_visible" — 3 colonnes Avant/Pendant/Après pour montrer un travail invisible, une journée type, une transformation visible.
    { "type": "process_visible", "stages": [ { "label": "Avant", "desc": "..." }, { "label": "Pendant", "desc": "..." }, { "label": "Après", "desc": "..." } ] }
    RÈGLE : EXACTEMENT 3 stages (sinon utilise "timeline"). Labels libres ("Le brief / Le travail / Le rendu", "Le matin / La journée / Le soir", "Au reçu / En séance / À la livraison"…).

RÈGLE DE VALIDITÉ (tous schémas) : si tu ne peux pas remplir toutes les clés requises avec du contenu utile, N'UTILISE PAS ce schéma — préfère un autre type ou du texte pur. Pas de schéma à moitié rempli.

QUAND utiliser un schéma :
- Slide de comparaison (avant/après, bon/mauvais) → before_after ou comparison
- Slide avec des chiffres → stats
- Slide qui explique un process ou une évolution → timeline, flowchart, pyramid
- Slide récap ou synthèse → checklist, icon_grid, matrix_2x2
- Slide qui positionne un concept → scale, equation
- Slide récit / parcours / transformation → story_arc
- Slide témoignage / parole donnée / citation forte → quote_big
- Slide qui déconstruit une idée / prise de position en mode mythe-vs-vision → objection_response
- Slide qui montre un travail invisible ou un process en 3 temps (Avant / Pendant / Après) → process_visible

QUAND NE PAS utiliser de schéma :
- Slide hook (slide 1) → toujours du texte pur avec un titre percutant
- Slide CTA (dernière) → toujours du texte avec appel à l'action
- Slide storytelling personnel libre (différent d'un story_arc structuré) → le texte suffit
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
    "fabricated_scene_detected": false,
    "subject_depth_present": true,
    "personal_stance_present": true,
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
Slide 1: Hook percutant — pas de "X astuces pour", mais une accroche en JE qui crée un gap ("Ce truc que je faisais sans réfléchir... et qui sabotait tout.")
Slide 2: Contexte "J'ai testé/observé ça en [contexte]. Voici ce qui change tout."
Slides 3-N: 1 tip par slide avec un TITRE PROPRE qui accroche (pas "Tip 1 :", mais "J'ai arrêté de me forcer" ou "Le piège de la régularité")
Dernière: CTA "Sauvegarde pour [situation]. Dis-moi en commentaire lequel te parle le plus."`,
    tutoriel: `TUTORIEL PAS-À-PAS (8-10 slides) :
Slide 1: Hook promesse de résultat en JE ("J'ai trouvé la méthode pour [résultat] en [durée].")
Slide 2: Contexte + ce qu'il faut préparer
Slides 3-8: 1 étape par slide, numérotée, actionnable
Slide 9: Récap visuel des étapes
Slide 10: CTA save + "partage à quelqu'un qui en a besoin"`,
    prise_de_position: `PRISE DE POSITION (5-8 slides) :
Slide 1: Hook opinion tranchée en JE "[Affirmation provocatrice issue du vécu]."
Slide 2: "Je vais expliquer pourquoi je pense ça."
Slides 3-5: Arguments (1 par slide, concret, ancré dans l'expérience)
Slide 6: La nuance (pour pas être dogmatique)
Slide 7: CTA commentaire "D'accord ou pas du tout ? Je veux lire vos avis."`,
    mythe_realite: `MYTHE VS RÉALITÉ (6-10 slides) :
Slide 1: Hook provocateur en JE "J'ai cru à [mythe courant] pendant [durée]. C'est faux."
Slide 2: Le contexte du mythe — pourquoi on y croit
Slides 3-8: Alternance Mythe (❌) / Réalité (✅), 1 paire par slide
Slide 9: Conclusion
Slide 10: CTA commentaire "Quel mythe vous énerve le plus dans [domaine] ?"`,
    storytelling: `STORYTELLING PERSONNEL (8-12 slides) :
Slide 1: Hook concret et spécifique en JE "[Situation vécue précise, avec un détail qui accroche]"
Slide 2: Contexte "Il y a [durée], je [situation]."
Slides 3-5: Le problème, la galère, les doutes — racontés au JE
Slides 6-8: Le tournant, ce qui a changé
Slide 9: La leçon universelle (passage au NOUS : "On croit que... mais en fait...")
Slide 10: CTA "Si ça résonne, envoie ce post à [persona]."`,
    etude_de_cas: `ÉTUDE DE CAS (8-10 slides) :
Slide 1: Hook résultat "[Résultat chiffré] en [durée]. Voici comment [Prénom] a fait."
Slide 2: Contexte "Quand [Prénom] est arrivé·e, [situation]."
Slide 3: Le problème principal
Slides 4-6: La solution mise en place
Slide 7: Les résultats chiffrés (avant → après)
Slide 8: Témoignage citation directe
Slide 9: CTA "Cette situation vous parle ? DM-moi '[mot-clé]' pour en discuter."`,
    checklist: `CHECKLIST SAUVEGARDABLE (6-8 slides) :
Slide 1: Hook "La checklist que j'utilise avant chaque [action]"
Slide 2: Pourquoi cette checklist — l'erreur qui m'a poussé·e à la créer
Slides 3-6: Items de checklist (3-5 par slide ou 1 par slide si détaillé)
Slide 7: Récap visuel de la checklist complète
Slide 8: CTA "Sauvegarde pour y revenir avant chaque [action]."`,
    comparatif: `COMPARATIF A VS B (6-8 slides) :
Slide 1: Hook "[Option A] vs [Option B] : j'ai testé les deux. Voici le verdict."
Slide 2: Les critères de comparaison
Slides 3-6: 1 critère par slide avec A et B côte à côte
Slide 7: Le verdict / la synthèse (en JE : "Personnellement, je...")
Slide 8: CTA "Plutôt A ou B ? Dis-le en commentaire."`,
    before_after: `BEFORE / AFTER (6-10 slides) :
Slide 1: Hook en JE "Il y a [durée], je [situation avant]. Aujourd'hui, [situation après]."
Slide 2: Le avant en détail
Slides 3-4: Ce qui a changé, les actions prises
Slides 5-6: Le après en détail
Slide 7: Les chiffres / résultats
Slide 8: La leçon
Slide 9: CTA`,
    promo: `PROMO / OFFRE (6-8 slides) :
Slide 1: Hook bénéfice client — ce que l'offre change concrètement (PAS le nom de l'offre)
Slide 2: Le problème que l'offre résout (raconté en JE : "Je voyais trop de [personas] galérer avec...")
Slides 3-4: La solution (ce que l'offre contient)
Slide 5: La preuve sociale (témoignage, résultat)
Slide 6: L'offre concrète (nom, prix, détail)
Slide 7: FAQ rapide (1-2 objections traitées)
Slide 8: CTA "DM-moi [mot-clé]" ou "Lien en bio"`,
    coulisses: `COULISSES (5-10 slides) :
Slide 1: Hook en JE "Ce qu'on ne voit pas derrière [chose visible]" ou "Les coulisses de [moment]"
Slides 2-8: Les étapes, le process, les galères, les joies — racontés au JE
Slide 9: Le résultat final
Slide 10: CTA "Quel aspect vous voulez que je montre la prochaine fois ?"`,
    photo_dump: `PHOTO DUMP (5-10 slides) :
Slide 1: Titre ambiance "Les coulisses de [moment/période]"
Slides 2-9: Photos avec légendes courtes (en JE : ce que je ressentais, ce que je faisais)
Slide 10: CTA doux "Laquelle vous préférez ? Dites-moi."
(Pour ce type, génère surtout les légendes, pas le visuel)`,
  };
  return guides[type] || guides.tips;
}

function buildDeepeningQuestionsPrompt(body: any, brandingContext?: string, isLinkedIn: boolean = false, recentBriefsContext?: string, brandVocabBlock?: string): string {
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

══════════════════════════════════════
SUJET COURANT — PRIORITÉ ABSOLUE
══════════════════════════════════════
"${subject || "non précisé"}"

Tout ce qui suit (objectif, branding, historique, angle) est SECONDAIRE.
Les 3 questions doivent toutes porter sur CE sujet précis.
Si une question pourrait concerner un autre sujet, elle est invalide.

OBJECTIF : ${OBJ_LABELS[objective] || objective || "non précisé"}
${objective ? `\nOriente les questions vers cet objectif. Si "vente" : témoignages clients, résultats, transformations. Si "engagement" : anecdotes personnelles, moments vécus. Si "visibilité" : opinions tranchées, constats provocants.\n` : ""}${brandingBlock}${brandVocabBlock || ""}${recentBriefsContext || ""}${angleBlock}
${isLinkedIn ? `\nATTENTION : c'est un carrousel LINKEDIN. Les questions doivent orienter vers du contenu expert et professionnel :\n- Demander des données, des résultats concrets, des leçons métier\n- Chercher l'expertise spécifique (pas juste l'émotion)\n- Orienter vers du contenu qui positionne comme référence sur le sujet` : ""}

══ AVANT DE POSER LES QUESTIONS — RAISONNEMENT INTERNE (ne PAS afficher) ══
Réfléchis silencieusement à :
1. Quel est le SUJET COURANT ? (ré-extraire 1 mot-clé)
2. Quel vocabulaire métier puis-je intégrer ?
3. Y a-t-il un sujet identique dans l'historique récent ? Si oui, quelle question NE PAS reposer ?

TON RÔLE : coach com' qui aide à extraire le vécu, les opinions et l'expertise PERSONNELLE pour que le contenu ne soit pas générique.

RÈGLES :
- ANCRAGE SUJET (règle n°1, non négociable) : chaque question doit contenir un mot du sujet courant ou un aspect directement déductible. Une question qui ne référence pas le sujet courant est invalide — réécris-la.
- Chaque question doit faire émerger du vécu, des anecdotes, des opinions tranchées, des exemples concrets
- AU MOINS 1 question sur 3 doit creuser le POURQUOI PROFOND
- Si le contexte branding est présent, adapte les questions à son activité et sa cible
- ${recentBriefsContext ? "MÉMOIRE ANTI-RÉPÉTITION : l'historique liste des sujets DIFFÉRENTS déjà traités. N'importe JAMAIS leur contenu, vocabulaire ou scènes dans tes questions sur le sujet courant." : ""}
- ${isLinkedIn ? "Vouvoyez l'utilisatrice, restez professionnel·le et chaleureux·se" : "Tutoie l'utilisatrice, sois directe et chaleureuse"}
- Chaque question fait 1-2 phrases max
- Le placeholder est un court exemple SPÉCIFIQUE au sujet courant (5-8 mots)

INTERDITS :
- Questions interchangeables d'un user à l'autre (= sans vocabulaire métier)
- Questions trop larges qui pourraient s'appliquer à n'importe quel sujet
- ⚠️ Questions qui réutilisent une scène, un lieu, un personnage venu de l'historique des briefs précédents

Réponds UNIQUEMENT en JSON valide, sans texte autour :
{
  "questions": [
    { "question": "...", "placeholder": "..." },
    { "question": "...", "placeholder": "..." },
    { "question": "...", "placeholder": "..." }
  ]
}`;
}

function buildExpressFullPrompt(body: any, isLinkedIn: boolean = false): string {
  const { subject, carousel_type, objective, slide_count, deepening_answers, selected_offer, editorial_angle, content_structure, confirmed_structure } = body;

  // ── 0. STRUCTURE IMPOSÉE (si confirmée par l'utilisateur·ice) ──
  let confirmedStructureBlock = "";
  if (confirmed_structure && Array.isArray(confirmed_structure) && confirmed_structure.length > 0) {
    const structureList = confirmed_structure
      .map((s: any) => {
        let line = `  Slide ${s.slide_number} — Rôle : ${s.role} — Titre : "${s.title_suggestion}"`;
        if (s.photo_index) line += ` — Photo n°${s.photo_index}${s.slide_type ? ` (${s.slide_type})` : ""}`;
        line += ` — ${s.strategic_note}`;
        return line;
      })
      .join("\n");
    confirmedStructureBlock = `══════════════════════════════════════
STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE — OBLIGATOIRE
══════════════════════════════════════
Tu DOIS générer le contenu pour EXACTEMENT ces slides dans cet ordre :
${structureList}

RÈGLES ABSOLUES :
- Ne change NI l'ordre NI les rôles NI le nombre de slides
- Utilise les titres proposés comme base (tu peux les affiner légèrement)
- Génère uniquement le contenu (body, visual_schema, caption) pour chaque slide
- Le JSON retourné doit contenir exactement ${confirmed_structure.length} slides
- Si une slide a un photo_index, le champ photo_index doit être présent dans le JSON de sortie

`;
  }

  // ── 1. BLOC SUJET (priorité absolue, en tête de prompt) ──

  const subjectBlock = `══════════════════════════════════════
SUJET DU CARROUSEL (ta priorité n°1)
══════════════════════════════════════

"${subject || "non précisé"}"

AVANT D'ÉCRIRE, analyse ce sujet en interne (ne montre pas) :
- Quel est le MESSAGE CENTRAL en 1 phrase ? (Le noyau que chaque slide sert)
- Quel MÉCANISME INVISIBLE est en jeu ? (Biais cognitif, conditionnement social, paradoxe psychologique, dynamique de marché)
- Quelle CROYANCE SOUS-JACENTE alimente le problème ? (Ce que la lectrice n'a jamais formulé consciemment)
- Quel RETOURNEMENT DE PERSPECTIVE ferait dire "j'avais jamais vu ça comme ça" ?
- Quelle DONNÉE ou RÉFÉRENCE crédibilise le propos ? (Étude, chiffre, concept nommé avec auteur)

Le sujet n'est pas un thème vague : c'est le CŒUR du carrousel. Chaque slide doit y revenir. Si on peut remplacer le sujet par un autre et que le carrousel fonctionne encore, c'est raté.`;

  // ── 2. BLOC RÉPONSES UTILISATRICE (juste après le sujet) ──

  let deepeningBlock = "";
  if (deepening_answers) {
    const answers = Object.entries(deepening_answers)
      .filter(([, v]) => v && (v as string).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    if (answers) {
      deepeningBlock = `
══════════════════════════════════════
RÉPONSES DE L'UTILISATRICE (matière première du carrousel)
══════════════════════════════════════

${answers}

Ces réponses sont PLUS IMPORTANTES que n'importe quel template :
- Son anecdote → devient le storytelling des slides 2-3. Utilise ses MOTS EXACTS, pas une reformulation.
- Sa conviction → devient la punchline ou le retournement de perspective.
- Son émotion → donne le TON de tout le carrousel.
- Le carrousel raconte SON histoire à travers le framework, pas un framework illustré par un exemple générique.`;
    }
  }

  // ── 3. BLOC STRUCTURE ÉDITORIALE ──

  let structureBlock: string;
  let extraRules = "";

  if (editorial_angle && content_structure) {
    structureBlock = `ANGLE ÉDITORIAL CHOISI : ${editorial_angle}

STRUCTURE IMPOSÉE (chaque étape = 1 slide) :
${content_structure}

${EDITORIAL_ANGLES_REFERENCE}`;
    extraRules = "\n- Chaque slide DOIT correspondre à une étape de la structure. Le role de chaque slide dans le JSON doit correspondre au rôle défini dans la structure.";

  } else if (carousel_type && carousel_type !== "tips") {
    structureBlock = getStructureGuide(carousel_type);

  } else {
    structureBlock = `PAS DE FORMAT IMPOSÉ. Analyse le sujet "${subject}" et choisis la structure la plus pertinente :

${EDITORIAL_ANGLES_REFERENCE}

CHOISIS l'angle qui crée le plus de tension pour CE sujet précis.
NE CHOISIS PAS "tips" sauf si le sujet est réellement une liste de conseils.
Privilégie les angles narratifs : storytelling, enquête, coup de gueule, mythe à déconstruire.`;
  }

  // ── 4. BLOC LINKEDIN (conditionnel) ──

  const linkedInBlock = isLinkedIn ? `
══════════════════════════════════════
ADAPTATION LINKEDIN
══════════════════════════════════════

Tu écris pour LinkedIn, pas Instagram. Ce qui change fondamentalement :
- POSTURE : expert·e qui partage une analyse, pas coach qui accompagne.
- DENSITÉ : chaque slide a 1 donnée chiffrée OU 1 référence nommée OU 1 cas concret. C'est non négociable sur LinkedIn.
- LONGUEUR : max 80 mots par slide (vs 50 Instagram). Les slides LinkedIn sont plus denses.
- TON : professionnel et engagé. Vouvoiement par défaut (sauf si le profil de voix de l'utilisatrice indique le tutoiement).
- CTA : invitation au débat professionnel ("Partagez si cette réflexion vous parle", "Votre avis ?", "Envoyez à un·e collègue qui..."). PAS de "Sauvegarde si...", PAS de "Dis-moi en commentaire".
- CAPTION : 500-800 caractères, dense, positionnante. Le carrousel doit positionner l'auteur·ice comme référence sur le sujet.` : "";

  // ── ASSEMBLAGE DU PROMPT ──

  return `${confirmedStructureBlock}DEMANDE : Génère un carrousel ${isLinkedIn ? "LinkedIn PDF" : "Instagram"} COMPLET.

${subjectBlock}
${deepeningBlock}

══════════════════════════════════════
PARAMÈTRES
══════════════════════════════════════

Objectif : ${objective || "engagement"}
Nombre de slides : ${slide_count || 7}
${selected_offer ? `Offre à mentionner naturellement : ${selected_offer}` : "Pas d'offre à mentionner."}

══════════════════════════════════════
STRUCTURE ÉDITORIALE
══════════════════════════════════════

${structureBlock}
${linkedInBlock}

══════════════════════════════════════
EXIGENCES DE DENSITÉ (ce qui sépare un bon carrousel d'un carrousel générique)
══════════════════════════════════════

Chaque slide (sauf hook et CTA) doit contenir AU MOINS 1 de ces éléments :
- Une DONNÉE chiffrée sourcée (chiffre + source entre parenthèses)
- Une ANALOGIE originale ancrée dans le quotidien ou la culture pop
- Un EXEMPLE CONCRET et spécifique (prénom, situation, détail)
- Un MÉCANISME NOMMÉ (concept psycho/socio avec auteur si connu)
- Un VERBATIM réel ou vraisemblable (une phrase que quelqu'un dirait)

Exemple de slide DENSE (ce qu'on veut) :
"73% des comptes actifs publient 2-3 fois par semaine (Later 2024). Pas parce que la quantité compte. Parce que la régularité entraîne l'algorithme à montrer le contenu. C'est le biais de simple exposition (Zajonc) : on fait davantage confiance à ce qu'on voit souvent."

Exemple de slide GÉNÉRIQUE (ce qu'on refuse) :
"La régularité est plus importante que la quantité. Publie quand tu as quelque chose à dire. Ton audience préfère un bon contenu par semaine."

La différence : la slide dense a un chiffre + un mécanisme + une implication concrète. La slide générique dit des trucs vrais que tout le monde sait déjà.

══════════════════════════════════════
RÈGLES STRUCTURELLES (s'appliquent à tous les carrousels, quel que soit le style)
══════════════════════════════════════

STRUCTURE :
- Slide 1 = hook percutant (max 12 mots). Technique : provocation, stat choc, confession, question. Le hook crée un GAP entre ce qu'on croit et la réalité.
- Slide 2 = DOIT fonctionner comme hook autonome (seconde chance algorithmique).
- Chaque slide : max ${isLinkedIn ? "80" : "50"} mots, 1 idée principale. Des PHRASES COMPLÈTES ET FLUIDES : 2-3 phrases qui développent l'idée, pas des fragments hachés ni des rafales de 3-4 mots.
- Dernière slide = 1 SEUL CTA. Pas 2. Pas 3.
- Headlines (title) : 4-9 mots, scène-first / JE — voir RÈGLES TITRES système. Pas de "L'art de", "L'importance de", "Repenser", "Le piège de".

NARRATION :
- ARC NARRATIF OBLIGATOIRE : situation → tension → développement → résolution → ouverture. Même un carrousel "tips" a un fil conducteur, pas juste une liste.
- CONNEXION ENTRE SLIDES : chaque slide crée une tension qui donne envie de swiper. La dernière phrase d'une slide amorce la suivante.
- AU MOINS 1 analogie du quotidien ou référence culture pop dans le carrousel.
- La caption est DIFFÉRENTE du hook slide 1. Elle apporte une couche supplémentaire (contexte personnel, pourquoi ce sujet maintenant).

VOIX ET TON :
- Si le contexte contient une section VOIX PERSONNELLE ou TON & STYLE : c'est TA PRIORITÉ. Reproduis ce style. Réutilise les expressions signature. Respecte le registre (tu/vous, oral/soutenu, humour/sérieux).
- Si le contexte ne contient PAS de profil de voix : ${isLinkedIn
    ? "adopte un ton professionnel et engagé, vouvoiement, dense mais accessible."
    : "adopte un ton direct et chaleureux, oral assumé mais pas surjoué. Voix narrative en JE par défaut (voir MODULATION ci-dessous)."
  }
- DANS TOUS LES CAS : le contenu doit sonner comme quelqu'un qui PARLE, pas qui rédige un article. Il doit pouvoir être lu à voix haute naturellement.

MODULATION JE / TU / NOUS (Instagram uniquement, ne s'applique pas à LinkedIn) :
${isLinkedIn ? "" : `La voix par défaut est "JE" (l'auteur·ice raconte, partage, analyse). Le "TU" et le "NOUS" s'utilisent selon le TYPE de sujet :
- SUJETS PRATIQUES (tips, tutoriel, méthode, how-to) → "TU" direct pour le conseil : "Quand tu postes, pense à..."
- SUJETS DE SOCIÉTÉ / COMBATS / VALEURS (normes, injustices, prises de position, body image, représentation, discriminations) → "NOUS" collectif et fédérateur : "On nous demande de nous formater", "On a intériorisé cette norme", "On mérite mieux que ça". JAMAIS de "TU" accusateur sur ces sujets ("Tu te formates" → culpabilisant). Le "nous" inclut l'auteur·ice dans le combat.
- STORYTELLING PERSONNEL → "JE" raconte l'expérience, puis "TU" interpelle en fin de slide ou CTA : "Et toi, tu l'as vécu aussi ?"
- ANALYSE / DÉCRYPTAGE → "JE" analyse et donne un point de vue, "ON" pour les constats partagés : "On voit de plus en plus que..."
En cas de doute, privilégie le "JE" + "NOUS" plutôt que le "TU". Le "TU" direct est un outil d'interpellation ponctuel, pas la voix narrative du carrousel.`}

ANTI-PATTERNS IA (si tu en détectes un dans ton output, RÉÉCRIS avant de retourner) :
- "Dans un monde où...", "Il est important de...", "N'hésitez pas à...", "Voici X astuces pour..." → SUPPRIMER
- Numérotation mécanique "Tip 1, Tip 2, Tip 3" → chaque tip a un TITRE PROPRE qui accroche
- "Et là, tout a basculé." → BANNI, marqueur IA reconnaissable
- Rafales de phrases de 3-4 mots en série → prose fluide
- Reformuler la même idée 3 fois pour remplir → 1 formulation forte suffit
- Conclusion qui résume tout → la fin apporte du NOUVEAU ou n'existe pas
- Anaphore mécanique ("Avec X. Avec Y. Avec Z.") → UNE FOIS MAX par carrousel
${deepeningBlock ? "- UTILISE les mots et exemples de l'utilisatrice dans les slides (anecdotes, vécu, arguments)" : ""}${extraRules}

══════════════════════════════════════
SCHÉMAS VISUELS (quand le sujet s'y prête)
══════════════════════════════════════

2-3 slides schéma par carrousel = le sweet spot. Types disponibles :
1. "before_after" — Avant/Après { before: { label, items }, after: { label, items } }
2. "comparison" — Deux colonnes opposées { left: { label, items }, right: { label, items } }
3. "timeline" — Progression chronologique { steps: [{ label, desc }] }
4. "checklist" — Vérification { title, items: [{ text, checked }] }
5. "stats" — Chiffres clés { items: [{ number, label }] }
6. "matrix_2x2" — 4 quadrants { x_axis, y_axis, quadrants }
7. "pyramid" — Hiérarchie { levels: [{ label, desc }] }
8. "equation" — A + B = C { parts, result, operator }
9. "flowchart" — Arbre de décision { start, branches: [{ condition, result }] }
10. "scale" — Gradient entre 2 extrêmes { left, right, marker }
11. "icon_grid" — Grille d'icônes { items: [{ emoji, label }] }

Utilise un schéma quand la slide compare, chiffre, ou montre un processus. PAS pour le hook, le CTA, ou le storytelling pur.
Quand une slide a un visual_schema, le body peut être plus court : le schéma porte le message visuel.

Retourne ce JSON exact :
{
  "carousel_type": "le type choisi (tips/storytelling/mythe_realite/enquete/prise_de_position/etc.)",
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
    "hook": "Les 125 premiers caractères de la caption (accroche DIFFÉRENTE de slide 1, angle personnel)",
    "body": "Le reste de la caption (contexte, pourquoi ce sujet maintenant)",
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
    "fabricated_scene_detected": false,
    "subject_depth_present": true,
    "personal_stance_present": true,
    "density_check": "chaque slide a au moins 1 élément de densité (donnée/analogie/exemple/mécanisme)",
    "score": 90
  },
  "publishing_tip": "Meilleur moment pour publier ce type de carrousel..."
}`;
}

function buildPhotoCarouselPrompt(body: any, isLinkedIn: boolean = false): string {
  const { editorial_angle, content_structure, deepening_answers, confirmed_structure, narrative_thread } = body;

  // ── STRUCTURE IMPOSÉE (si confirmée par l'utilisateur·ice) ──
  let confirmedStructureBlock = "";
  if (confirmed_structure && Array.isArray(confirmed_structure) && confirmed_structure.length > 0) {
    const structureList = confirmed_structure
      .map((s: any) => {
        let line = `  Slide ${s.slide_number} — Rôle : ${s.role} — Titre : "${s.title_suggestion}"`;
        if (s.photo_index) line += ` — Photo n°${s.photo_index}${s.slide_type ? ` (${s.slide_type})` : ""}`;
        line += ` — ${s.strategic_note}`;
        if (s.story_beat) line += `\n    → Raconte : ${s.story_beat}`;
        if (s.visual_anchor) line += `\n    → Détail mobilisable : ${s.visual_anchor}`;
        return line;
      })
      .join("\n");
    const narrativeBlock = narrative_thread && typeof narrative_thread === "string" && narrative_thread.trim()
      ? `RÉCIT À EXÉCUTER (décidé en voyant les photos) : ${narrative_thread.trim()}
Chaque slide écrit UNE étape de ce récit. Tu n'inventes pas une autre histoire, tu exécutes celle-ci.

`
      : "";
    confirmedStructureBlock = `══════════════════════════════════════
STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE — OBLIGATOIRE
══════════════════════════════════════
${narrativeBlock}Tu DOIS générer le contenu pour EXACTEMENT ces slides dans cet ordre :
${structureList}

RÈGLES ABSOLUES :
- Ne change NI l'ordre NI les rôles NI le nombre de slides
- Utilise les titres proposés comme base (tu peux les affiner légèrement)
- Génère uniquement le contenu (body, visual_schema, caption) pour chaque slide
- Le JSON retourné doit contenir exactement ${confirmed_structure.length} slides
- Si une slide a un photo_index, le champ photo_index doit être présent dans le JSON de sortie
- INTERDIT de décrire la photo. L'overlay écrit l'étape du récit définie par le story_beat ; le visual_anchor est une matière optionnelle (un détail à glisser dans la phrase si naturel), JAMAIS un contenu à réciter.

`;
  }

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

  const channelBlock = isLinkedIn
    ? `═══ ADAPTATION LINKEDIN (OBLIGATOIRE) ═══

Ce carrousel photo est destiné à LinkedIn (PDF natif posté comme document), pas à Instagram. Tu DOIS adapter ton, overlays et légende :

- TON : professionnel mais chaleureux, expert·e mais accessible. Vouvoiement par défaut (sauf si la voix de marque dit le contraire).
- OVERLAYS : sobres, factuels, ancrés dans l'expertise / la leçon métier / le retour terrain. Pas de "vibe" pure ni d'emojis fleurs/cœurs (✨🌸💖). 0-1 emoji max par slide. On privilégie le "narratif" et le "technique" au "sensoriel" pur.
- ARC : photo terrain → analyse / mécanisme / chiffre → preuve ou leçon → ouverture pro (échange, retour d'expérience).
- LÉGENDE : "vous" plutôt que "tu", pas d'emojis décoratifs, hashtags professionnels (secteur, métier, thématique pro) — pas de hashtags lifestyle Instagram.

`
    : "";

  return `${confirmedStructureBlock}${channelBlock}Tu es une DIRECTRICE ARTISTIQUE ÉDITORIALE spécialisée dans les carrousels photo ${isLinkedIn ? "LinkedIn" : "Instagram"}.

Ton rôle : transformer des photos en carrousel éditorial qui RACONTE UNE HISTOIRE. Chaque slide participe à une narration.

═══ RÈGLES OVERLAY ═══
- CHAQUE SLIDE a un overlay_text. C'est obligatoire.
- Exception : 1 slide MAXIMUM sur tout le carrousel peut avoir overlay_text: null (quand la photo est si forte qu'elle se suffit).
- overlay_text : entre 5 et 25 mots. C'est une VRAIE PHRASE COMPLÈTE = un sujet + un verbe conjugué + (souvent) un complément. Pas un titre, pas une étiquette, pas une fiche produit.
- Le texte COMPLÈTE l'image : il raconte ce qu'on ne voit pas, donne du contexte, fait avancer l'histoire.

═══ INTERDIT ABSOLU — STYLE "ÉTIQUETTE / FRAGMENTS" ═══
Une suite de groupes nominaux séparés par des points n'est PAS une phrase. C'est interdit, même si l'effet "punchy" semble travaillé.

❌ INTERDIT (style fragment / étiquette / mots-clés ponctués) :
  - "89 000€. Montluçon. Secteur prisé, actif invisible."
  - "Bord de mer. Vue dégagée. Coup de cœur."
  - "Trois chambres. Jardin. Calme absolu."
  - "Lundi matin. Café froid. Encore."

✅ ATTENDU à la place (mêmes idées, en phrases qui se lisent et s'enchaînent) :
  - "À 89 000€ à Montluçon, ce secteur prisé cache un actif que personne ne voit passer."
  - "Vue dégagée sur la mer, et un calme qu'on n'attendait plus à ce prix-là."
  - "Trois chambres, un jardin, et surtout le silence qu'on cherchait depuis des mois."

Test mental : si on retire les points, l'overlay doit pouvoir se prononcer d'un seul souffle comme une phrase parlée à voix haute. Si ça sonne comme une fiche d'agent immobilier ou une étiquette de prix, c'est raté.

═══ STYLES D'OVERLAY ═══
- "sensoriel" : phrase évocatrice qui fait ressentir ("Ce matin-là, tout sentait la cire d'abeille et le bois chaud.")
- "narratif" : phrase qui fait avancer l'histoire ("Ce qu'on voit dans cette série de gestes, c'est tout sauf un détail." — interdiction d'inventer "un jour, une cliente m'a dit", voir ANTI_FABRICATED_STORYTELLING)
- "minimal" : phrase courte percutante MAIS avec un verbe ("Trois mois ont suffi.", "Personne ne l'a vu venir."). Limite : 1 slide max sur tout le carrousel en style minimal.
- "technique" : un détail concret/chiffré TOUJOURS inséré dans une phrase complète ("Ce lin français a été teint à la main dans notre atelier.", "Les 89 000€ affichés cachent une marge que personne ne calcule.")
- Positions : "bottom_left", "bottom_center", "top_left", "top_center", "center"
- PRIVILÉGIE "sensoriel" et "narratif" — c'est ce qui fait qu'on lit vraiment le carrousel.

═══ PROGRESSION NARRATIVE ═══
L'objectif est qu'en lisant les overlays slide après slide, on suive une vraie histoire qui se déploie, comme un mini-récit qu'on raconterait à l'oral. Pas une galerie d'images légendées.
- Slide 1 (hook) : phrase qui arrête le scroll. Crée une tension, une question, une émotion.
- Slides 2-3 : contexte, développement. On entre dans l'histoire.
- Slides milieu : le cœur. Détails, processus, tournant émotionnel.
- Avant-dernière : le climax ou la révélation.
- Dernière (CTA) : phrase qui ouvre vers l'action ou la conversation.

═══ CHAÎNAGE DES TEXTES — RÈGLE ABSOLUE ═══
Les overlay_text doivent se lire à la suite comme UN SEUL mini-récit continu. Chaque slide REPREND, PROLONGE ou FAIT BASCULER ce que la précédente a posé.

RÈGLE DE SURFACE VÉRIFIABLE : à partir de la slide 2, CHAQUE overlay DOIT contenir au moins l'UN des deux éléments suivants :
  (a) un connecteur narratif en début ou milieu de phrase : "Puis", "Et puis", "Sauf que", "C'est là que", "Alors", "Du coup", "Mais", "Sauf que", "Sauf qu'en vrai", "Trois mois plus tard", "Au début", "Maintenant", "Résultat", "Ce qu'on n'a pas vu venir", "Ce que personne ne dit".
  (b) une reprise lexicale d'un mot/groupe-clé de la slide précédente (le même mot, ou un synonyme évident qui boucle la référence).

Test interne : si on permute deux slides au hasard et que le carrousel "marche encore", c'est raté → recommence. Une slide qui pourrait vivre seule sur ${isLinkedIn ? "LinkedIn" : "Instagram"} = mauvais signe. On veut une slide qui n'a de sens QUE parce qu'on a lu la précédente.

═══ CAS PARTICULIERS SELON LE NOMBRE DE PHOTOS ═══
- 1 photo unique → elle apparaît sur toutes les slides. Tout repose sur les textes qui racontent l'histoire en plusieurs temps (contexte → tension → bascule → résolution → ouverture). Cible 4-6 slides, pas 8.
- 2 photos (avant/après ou duo) → structure conseillée : 2-3 slides avec la photo "avant" (poser le contexte/problème) → 1 slide pivot (la bascule, le déclic) → 2-3 slides avec la photo "après" (résolution, nouveau regard). INTERDIT : alterner mécaniquement photo 1 / 2 / 1 / 2. Cible 5-7 slides.
- 3-4 photos → chaque photo peut se répéter si son rôle narratif change. Une image-clé peut revenir en clôture pour boucler.
- 5+ photos → comportement classique (≈ 1 photo par slide), le chaînage des textes reste obligatoire.

Quand une même photo se répète sur 2-3 slides consécutives, les textes DOIVENT porter une vraie progression (zoom narratif, avancée temporelle, retournement) — JAMAIS trois variantes de la même idée.


═══ RÔLES DES SLIDES ═══
- "hook_visuel" : la première photo + phrase qui arrête le scroll
- "detail" : zoom sur un détail, enrichi d'une phrase sensorielle
- "contexte" : mise en situation avec une phrase narrative
- "process" : coulisses, fabrication, avec un détail concret
- "emotion" : photo émotionnelle + phrase qui amplifie
- "cta_visuel" : dernière slide, invitation douce

${isLinkedIn ? `═══ LÉGENDE LINKEDIN (OPTIONNELLE) ═══
- Légende optionnelle : si tu la rédiges, qu'elle apporte une vraie valeur (contexte métier, leçon, retour terrain) ; sinon laisse les champs vides (elle sera générée par un appel dédié).
- Ton "vous" professionnel et chaleureux, pas d'emojis décoratifs (fleurs, cœurs).
- Hook : phrase d'accroche DIFFÉRENTE du texte de la slide 1.
- Body : ce que les photos ne montrent pas (mécanisme, chiffre, leçon, contexte marché).
- CTA pro : "Votre avis en commentaire ?", "Partagez si cela résonne", "Quelle est votre expérience ?". JAMAIS "Sauvegarde", "DM moi", "Tag une copine".
- Hashtags : 0-5 hashtags PROFESSIONNELS (secteur, métier, thématique pro). PAS de hashtags lifestyle Instagram.` : `═══ LÉGENDE ═══
- 400-800 caractères
- La légende PROLONGE l'histoire des slides, elle ne la répète pas
- Hook : phrase d'accroche DIFFÉRENTE du texte de la slide 1
- Body : ce que les photos ne montrent pas (l'envers du décor, l'émotion, le pourquoi)
- Ton sensoriel : faire ressentir les textures, les lumières, les ambiances
- CTA : invitation à la conversation ("Et toi, tu as déjà ressenti ça ?")
- 5-10 hashtags pertinents`}
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
    "text_chain_continuity": true,
    "slide_count_matches_photo_richness": true,
    "no_mechanical_photo_alternation": true,
    "every_overlay_has_verb": true,
    "no_nominal_fragment_lists": true,
    "score": 85
}`;
}
function buildPhotoCarouselNewsReactionPrompt(body: any, isLinkedIn: boolean = false): string {
  const { editorial_angle, content_structure, deepening_answers, confirmed_structure, narrative_thread, subject, photos } = body;

  // ── STRUCTURE IMPOSÉE (si confirmée par l'utilisateur·ice) — calqué sur buildPhotoCarouselPrompt ──
  let confirmedStructureBlock = "";
  if (confirmed_structure && Array.isArray(confirmed_structure) && confirmed_structure.length > 0) {
    const structureList = confirmed_structure
      .map((s: any) => {
        let line = `  Slide ${s.slide_number} — Rôle : ${s.role} — Titre : "${s.title_suggestion}"`;
        if (s.photo_index) line += ` — Photo n°${s.photo_index}${s.slide_type ? ` (${s.slide_type})` : ""}`;
        line += ` — ${s.strategic_note}`;
        if (s.story_beat) line += `\n    → Raconte : ${s.story_beat}`;
        if (s.visual_anchor) line += `\n    → Détail mobilisable : ${s.visual_anchor}`;
        return line;
      })
      .join("\n");
    const narrativeBlock = narrative_thread && typeof narrative_thread === "string" && narrative_thread.trim()
      ? `RÉCIT À EXÉCUTER (décidé en voyant les photos ET en lisant l'actu) : ${narrative_thread.trim()}
Chaque slide écrit UNE étape de ce récit. Tu n'inventes pas une autre histoire, tu exécutes celle-ci.

`
      : "";
    confirmedStructureBlock = `══════════════════════════════════════
STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE — OBLIGATOIRE
══════════════════════════════════════
${narrativeBlock}Tu DOIS générer le contenu pour EXACTEMENT ces slides dans cet ordre :
${structureList}

RÈGLES ABSOLUES :
- Ne change NI l'ordre NI les rôles NI le nombre de slides
- Utilise les titres proposés comme base (tu peux les affiner légèrement)
- Génère uniquement le contenu (overlay_text, caption) pour chaque slide
- Le JSON retourné doit contenir exactement ${confirmed_structure.length} slides
- Si une slide a un photo_index, le champ photo_index doit être présent dans le JSON de sortie
- INTERDIT de décrire la photo. L'overlay écrit l'étape du récit définie par le story_beat ; le visual_anchor est une matière optionnelle (un détail à glisser dans la phrase si naturel), JAMAIS un contenu à réciter.

`;
  }

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

  const channelBlock = isLinkedIn
    ? `═══ ADAPTATION LINKEDIN (OBLIGATOIRE) ═══

Ce carrousel photo est destiné à LinkedIn (PDF natif posté comme document), pas à Instagram. Tu DOIS adapter ton, overlays et légende :

- TON : professionnel mais chaleureux, expert·e mais accessible. Vouvoiement réservé AU SEUL CTA final (le reste = JE qui réagit).
- OVERLAYS : sobres, factuels, ancrés dans la réaction perso à l'actu / la leçon métier / le retour terrain. 0-1 emoji max par slide.
- LÉGENDE : "vous" seulement dans le CTA, pas d'emojis décoratifs, hashtags professionnels.

`
    : "";

  const nPhotos = Array.isArray(photos) ? photos.length : 0;
  const photoCountBlock = nPhotos > 0
    ? `Carrousel de ${nPhotos} photo(s) → cible ${nPhotos === 1 ? "4 à 6" : nPhotos === 2 ? "5 à 7" : nPhotos <= 4 ? "6 à 8" : `${nPhotos} à ${nPhotos + 2}`} slides.`
    : "";

  return `${confirmedStructureBlock}${channelBlock}Tu es l'AUTRICE qui réagit à une actualité dans un carrousel photo ${isLinkedIn ? "LinkedIn" : "Instagram"}.

Ce N'EST PAS un résumé d'actu. Ce N'EST PAS un diaporama joli avec des légendes. C'est UNE PRISE DE PAROLE PERSONNELLE — incarnée dans tes photos — qui rebondit sur cette actu.

══════════════════════════════════════
MODE "RÉACTION D'AUTRICE EN PHOTOS" — RÈGLES NON NÉGOCIABLES
══════════════════════════════════════

1. VOIX = JE qui réagit
   - L'autrice REGARDE l'actu et PARTAGE ce qu'elle en pense, ce que ça lui fait, ce qu'elle voit que les autres ne voient pas.
   - Pas de "voilà ce qui s'est passé + 3 leçons à en tirer". Pas de "pour mieux comprendre, voici 5 points".
   - À la place : "ce que je vois passer / ce que ça me fait / pourquoi je trouve que c'est plus profond que ce qu'on raconte / ce que ça touche dans MON terrain".

2. ARC NARRATIF UNIQUE (obligatoire)
   - Slide 1 (hook) : l'actu comme point d'entrée — un détail, une phrase, une image qui m'a frappée. PAS le résumé de l'article. L'overlay slide 1 part de l'actu, pas de la photo.
   - Slides milieu : ce qui m'a vraiment frappée + le DÉCALAGE (là où je ne suis pas d'accord avec la lecture commune, là où je vois autre chose). C'est la pépite.
   - Au moins UNE slide doit exploiter un FAIT PRÉCIS de l'actu (chiffre, nom, citation, date, mécanisme). Si l'actu n'en contient pas, formule honnêtement avec une tournure prudente plutôt que d'inventer.
   - Dernière slide : ouverture — pas une leçon, une question ou un constat qui invite à la conversation.

3. PHOTOS INCARNENT, NE REMPLACENT PAS
   - Les photos sont le SUPPORT VISUEL de ta réaction, pas le sujet. Elles incarnent ce que tu dis, elles ne le remplacent pas.
   - L'overlay raconte TA réaction à l'actu ; la photo donne corps à cette réaction. JAMAIS l'inverse (overlay qui décrit ce qu'on voit sur la photo).
   - Une photo peut se répéter sur plusieurs slides si son rôle narratif change.

4. AUDIENCE = TÉMOIN, PAS PATIENTE
   - Le "tu/vous" est INTERDIT dans ce mode (sauf 1 fois dans le CTA final).
   - Pas de diagnostic sur l'audience ("tu n'oses pas", "on a intériorisé que…"). Voir bloc ANTI-VICTIMISATION du system prompt.
   - L'audience est convoquée par RICOCHET via "on" inclusif ("nous toutes qui regardons ça passer") — jamais désignée comme problème.

5. INTERDIT ABSOLU — INVENTION DE FAITS
   - Ne JAMAIS inventer un chiffre, une statistique, une citation, un nom d'entreprise/personne ou un événement absent du contexte fourni.
   - ANTI_FABRICATED_STORYTELLING s'applique : pas de "hier en lisant ça j'ai pensé à une cliente qui m'a dit Y". Tu peux dire "je vois passer cette histoire et ce qui me frappe c'est X".

6. PONT ACTU → MÉTIER (formulation obligatoire)
   - Pas "voilà ce que cette actu dit de TON business".
   - À la place : "voilà ce que cette actu touche dans MON terrain / dans MA pratique / dans ce que je vois passer chez les gens que j'accompagne".

══════════════════════════════════════
ACTU DÉCLENCHEUSE (rappel — détaillée dans le system prompt)
══════════════════════════════════════
Brief créatif personnel : "${subject || ""}"
Cette actu est le POINT D'ENTRÉE visible (slide 1). Le reste du carrousel = TA réaction incarnée par les photos.

═══ RÈGLES OVERLAY (identiques au mode photo classique) ═══
- CHAQUE SLIDE a un overlay_text. Exception : 1 slide MAX peut avoir overlay_text: null.
- overlay_text : 5 à 25 mots, VRAIE PHRASE COMPLÈTE (sujet + verbe conjugué + complément). Pas un titre, pas une étiquette.
- INTERDIT : suite de groupes nominaux séparés par des points ("Bord de mer. Vue dégagée. Coup de cœur."). Test : si on retire les points, l'overlay doit se prononcer d'un seul souffle.
- Styles : "sensoriel", "narratif", "minimal" (1 max), "technique".
- Positions : "bottom_left", "bottom_center", "top_left", "top_center", "center".

═══ COMPOSITION ═══
${photoCountBlock}
- Slide 1 = hook ancré sur l'actu (overlay part de l'actu, pas de la description photo).
- Au moins 1 slide de corps exploite un fait précis de l'actu.
- Dernière slide = ouverture/CTA en JE (pas une leçon).

═══ CHAÎNAGE DES TEXTES — RÈGLE ABSOLUE ═══
Les overlay_text doivent se lire à la suite comme UN MONOLOGUE de l'autrice qui réagit. Chaque slide REPREND, PROLONGE ou FAIT BASCULER ce que la précédente a posé.
À partir de la slide 2, chaque overlay DOIT contenir au moins l'UN des deux :
  (a) un connecteur narratif ("Puis", "Sauf que", "C'est là que", "Ce qui me frappe", "Ce que personne ne dit"…)
  (b) une reprise lexicale d'un mot/groupe-clé de la slide précédente.

${SLIDE_TITLE_RULES}

═══ ASSIGNATION DES PHOTOS ═══
Photos fournies dans l'ordre : photo 1, photo 2... Pour chaque slide, indique photo_index (1-based, peut se répéter).

${deepeningCtx}${angleBlock}

═══ VÉRIFICATION FINALE (avant de retourner le JSON) ═══
- Slide 1 part de l'actu, pas de la description photo.
- Au moins 1 slide de corps cite un fait précis de l'actu (ou formule honnête prudente si pas de fait exploitable).
- Aucun chiffre/citation/nom inventé.
- Voix JE dominante, aucun "tu/vous" hors CTA final.
- Aucune slide ne diagnostique l'audience.
- Test monologue : overlays lus à la suite = UNE pensée qui se déroule.

${isLinkedIn ? `═══ LÉGENDE LINKEDIN (OPTIONNELLE) ═══
Caption gérée par appel dédié. Tu peux mettre {"hook":"","body":"","cta":"","hashtags":[]} ou l'omettre.` : `═══ LÉGENDE INSTAGRAM (OBLIGATOIRE) ═══
- 400-800 caractères, prolonge TA réaction (n'la répète pas)
- "hook" DIFFÉRENT du texte slide 1, ancré dans TA réaction à l'actu
- "body" : ce que les slides ne disent pas, formulé en JE
- "cta" : invitation à la conversation (1 seule)
- 5-10 hashtags pertinents au sujet de l'actu`}

⚠️ Les valeurs ci-dessous montrent la STRUCTURE JSON, PAS le ton. Tout doit être 100% ancré dans l'actu réelle et la voix JE.

RETOURNE UNIQUEMENT ce JSON exact, sans texte avant ou après :
{
  "carousel_type": "photo",
  "chosen_angle": { "title": "Titre court de l'angle (3-5 mots)", "description": "Quel décalage je propose face à cette actu" },
  "slides": [
    {
      "slide_number": 1,
      "role": "hook_actu",
      "photo_index": 1,
      "photo_description": "Description de ce que montre la photo",
      "overlay_text": "Phrase qui part de l'actu, pas de la photo (5-25 mots)",
      "overlay_position": "bottom_left",
      "overlay_style": "sensoriel",
      "note": "Note de direction artistique"
    }
  ],
  "caption": {
    "hook": "Accroche personnelle différente du texte slide 1 (125 car max)",
    "body": "Corps en JE, prolonge la réaction",
    "cta": "Invitation à la conversation (1 seule)",
    "hashtags": ["hashtag1", "hashtag2"]
  },
  "quality_check": {
    "slides_with_text": 5,
    "slides_without_text": 1,
    "max_overlay_words": 20,
    "hook_starts_from_news": true,
    "at_least_one_news_fact_cited": true,
    "no_fabricated_fact": true,
    "je_voice_dominant": true,
    "tu_vous_count_outside_cta": 0,
    "audience_as_victim": false,
    "fabricated_scene_detected": false,
    "text_chain_continuity": true,
    "every_overlay_has_verb": true,
    "no_nominal_fragment_lists": true,
    "score": 85
  }
}`;
}

function buildMixCarouselPrompt(body: any, isLinkedIn: boolean = false): string {
  const { editorial_angle, content_structure, deepening_answers, slide_structure, confirmed_structure, narrative_thread } = body;

  // ── Adaptation éditoriale selon le canal ──
  const channelBlock = isLinkedIn
    ? `═══ ADAPTATION LINKEDIN (OBLIGATOIRE) ═══

Ce carrousel est destiné à LinkedIn (et non Instagram). Tu DOIS adapter ton, overlays et CTA :

- TON : professionnel mais chaleureux, expert·e mais accessible. Vouvoiement par défaut (sauf si la voix de marque dit le contraire).
- DENSITÉ : chaque slide texte apporte de la valeur concrète : chiffre, mécanisme, contexte marché, retour terrain, nuance. Pas de phrases vides.
- OVERLAYS PHOTO : sobres, factuels, sans emojis "girl chic" (✨, 🌸, 💖). 0-1 emoji max par slide. Les overlays décrivent un fait, un moment, une preuve — pas une vibe.
- ARC NARRATIF type LinkedIn : photo terrain en slide 1 → 3-4 slides analyse / leçon / chiffres → 1 slide "preuve sociale" si pertinent (témoignage, photo client, résultat) → slide texte conclusion → CTA.
- CTA FINAL : "Partagez si cela résonne", "Votre avis en commentaire ?", "Envoyez à un·e collègue qui…", "Quelle est votre expérience ?". JAMAIS "Sauvegarde", "DM moi", "Tag une copine".
- LÉGENDE : "vous" plutôt que "tu", pas d'emojis fleurs ni cœurs, hashtags professionnels (secteur, métier, thématique pro).

`
    : "";

  // ── STRUCTURE IMPOSÉE (si confirmée par l'utilisateur·ice) ──
  let confirmedStructureBlock = "";
  if (confirmed_structure && Array.isArray(confirmed_structure) && confirmed_structure.length > 0) {
    const structureList = confirmed_structure
      .map((s: any) => {
        let line = `  Slide ${s.slide_number} — Rôle : ${s.role} — Titre : "${s.title_suggestion}"`;
        if (s.photo_index) line += ` — Photo n°${s.photo_index}${s.slide_type ? ` (${s.slide_type})` : ""}`;
        line += ` — ${s.strategic_note}`;
        if (s.story_beat) line += `\n    → Raconte : ${s.story_beat}`;
        if (s.visual_anchor) line += `\n    → Détail mobilisable : ${s.visual_anchor}`;
        return line;
      })
      .join("\n");
    const narrativeBlock = narrative_thread && typeof narrative_thread === "string" && narrative_thread.trim()
      ? `RÉCIT À EXÉCUTER (décidé en voyant les photos) : ${narrative_thread.trim()}
Chaque slide écrit UNE étape de ce récit. Tu n'inventes pas une autre histoire, tu exécutes celle-ci.

`
      : "";
    confirmedStructureBlock = `══════════════════════════════════════
STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE — OBLIGATOIRE
══════════════════════════════════════
${narrativeBlock}Tu DOIS générer le contenu pour EXACTEMENT ces slides dans cet ordre :
${structureList}

RÈGLES ABSOLUES :
- Ne change NI l'ordre NI les rôles NI le nombre de slides
- Utilise les titres proposés comme base (tu peux les affiner légèrement)
- Génère uniquement le contenu (body, visual_schema, caption) pour chaque slide
- Le JSON retourné doit contenir exactement ${confirmed_structure.length} slides
- Si une slide a un photo_index, le champ photo_index doit être présent dans le JSON de sortie
- INTERDIT de décrire la photo. L'overlay écrit l'étape du récit définie par le story_beat ; le visual_anchor est une matière optionnelle (un détail à glisser dans la phrase si naturel), JAMAIS un contenu à réciter.

`;
  }

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

  return `${confirmedStructureBlock}${channelBlock}Tu es une DIRECTRICE ARTISTIQUE ÉDITORIALE doublée d'une ANALYSTE qui creuse les sujets, spécialisée dans les carrousels ${isLinkedIn ? "LinkedIn" : "Instagram"}.

Tu crées des carrousels MIXTES : un mélange de slides avec photos et de slides texte pur. C'est un format premium qui se démarque dans le feed ${isLinkedIn ? "LinkedIn (où dominent les carrousels PDF tout texte)" : "Instagram"}.

══════════════════════════════════════
PROFONDEUR INTELLECTUELLE — ANALYSE INTERNE OBLIGATOIRE
══════════════════════════════════════

AVANT D'ÉCRIRE LA MOINDRE SLIDE, analyse le sujet "${body.subject || ""}" en interne (ne montre pas cette analyse, mais elle DOIT structurer le carrousel) :

- MESSAGE CENTRAL en 1 phrase : le noyau que chaque slide doit servir.
- MÉCANISME INVISIBLE : quel biais cognitif, conditionnement social, paradoxe psychologique ou dynamique systémique est en jeu ? Nomme-le (ex : estime de soi conditionnelle, comparaison sociale ascendante, biais de confirmation, conditionnement de genre…).
- CROYANCE SOUS-JACENTE : quelle croyance implicite, jamais formulée consciemment, alimente le problème ? (Ex : derrière "j'archive mes posts qui flopent", la croyance est "le nombre de likes mesure ma valeur professionnelle".)
- RETOURNEMENT DE PERSPECTIVE : quelle phrase ferait dire à la lectrice "ah merde, j'avais jamais vu ça comme ça" ? C'est la pépite — pas un conseil, un changement de cadre mental.
- DONNÉE / RÉFÉRENCE D'APPUI (si pertinent) : un chiffre sourcé, un concept nommé avec son auteur, une étude. Intégrer naturellement, pas en mode "selon une étude de Harvard".

Si on peut remplacer le sujet par un autre et que le carrousel fonctionne encore → c'est raté, recommence.

${DEPTH_LAYER}

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
    - Idéal pour : développement narratif, tips détaillés, prise de position, contexte, CTA. Ce ne sont PAS des séparateurs.
    - RÔLE STRATÉGIQUE (CRUCIAL) : chaque slide text_only DOIT porter au moins UN de ces éléments — sinon elle ne sert à rien et tu dois la supprimer ou la réécrire :
      · le MÉCANISME nommé (biais cognitif, concept psycho/socio avec auteur si connu)
      · la CROYANCE retournée ("on croit X, en fait Y")
      · le RETOURNEMENT de perspective (la pépite, le moment "j'avais jamais vu ça comme ça")
      · une DONNÉE chiffrée sourcée
      · un EXEMPLE hyper-spécifique avec détails concrets
      · une PRISE DE POSITION tranchée qui mérite son propre espace
      · une transition narrative charnière entre deux blocs photo
      · le CTA final
    - Une slide texte qui se contente de commenter/paraphraser la photo précédente N'A PAS DE RAISON D'EXISTER → fusionne ou supprime.
    - Champs : title, body, visual_schema (optionnel)

${(() => {
    let structureConstraint = "";
    if (slide_structure && slide_structure.length > 0) {
      const lines = slide_structure.map((s: any) => {
        let line = `- Slide ${s.slide_number} : type="${s.type}"`;
        if (s.photo_index) line += `, photo_index=${s.photo_index}`;
        if (s.photo_layout) line += `, photo_layout="${s.photo_layout}"`;
        return line;
      }).join("\n");
      structureConstraint = `═══ STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE (OBLIGATOIRE) ═══
L'utilisateur·ice a défini manuellement la répartition des slides. Tu DOIS respecter exactement cette structure. Ne change ni le type ni le photo_index d'aucune slide.
${lines}

Nombre total de slides : ${slide_structure.length}
RÈGLE ABSOLUE : le JSON retourné doit avoir EXACTEMENT ${slide_structure.length} slides dans le même ordre, avec les types et photo_index ci-dessus.

`;
    }
    return structureConstraint;
  })()}═══ RÈGLES DE COMPOSITION ═══

- Un carrousel de ${body.photos?.length || "N"} photos devrait avoir ${body.photos?.length || "N"} à ${(body.photos?.length || 6) + 2} slides au total (pas plus — un mixte trop long dilue l'impact)
- Au moins 50% des slides DOIVENT être de type photo_full ou photo_integrated. C'est un format mixte, pas un carrousel texte.
- Commence TOUJOURS par une slide "photo_full" (hook visuel)
- Termine par une slide "text_only" (CTA)
- Préfère utiliser CHAQUE photo uploadée au moins une fois — n'en écarter une que si elle est vraiment hors-sujet par rapport au brief
- Une même photo peut être utilisée dans plusieurs slides (ex: full + detail crop)
- Alterne les types pour créer du rythme : photo → texte → photo → texte
- Ne fais JAMAIS 3 slides du même type à la suite

═══ RÈGLES SPÉCIFIQUES MIX ═══

- ARC NARRATIF : situation → tension → développement → résolution → ouverture. Fil conducteur clair entre slides photo et texte.
- Les slides text_only doivent avoir un body de 30-50 mots MINIMUM (phrases complètes, pas des fragments).
- QUALITÉ VISUELLE des slides texte (CRUCIAL) : une slide text_only n'est PAS un mur de texte. Quand le contenu s'y prête, ajoute un "visual_schema" pour porter le message visuellement (comparaison avant/après, opposition deux colonnes, timeline, liste numérotée structurée, citation mise en avant, chiffre-clé géant). Vise au moins 1 slide texte sur 2 avec un visual_schema. Si la slide est juste du texte, alors le body doit être PERCUTANT (formule, prise de position, micro-récit) — pas un paragraphe descriptif.
- Les overlay_text sur photo_full sont COURTS (5-20 mots) : ils complètent l'image, ils ne la décrivent pas. Ils doivent être ANCRÉS dans CE moment précis (fait sensoriel, détail concret, parole captée), pas une formule chic transposable ("Quand la magie opère", "Un instant suspendu" → INTERDIT).
- Au moins 1 exemple concret OU 1 analogie du quotidien dans le carrousel.
- Le sujet "${body.subject || ""}" est un BRIEF CRÉATIF : si c'est un concept (VS, avant/après, métaphore), il structure l'ensemble. Le titre apparaît (ou est amélioré) sur la slide 1.
- Les autres règles d'écriture (ton oral incarné, anti-jargon, anti-formules vides, écriture inclusive, pas de tirets cadratins) sont déjà définies dans le contexte système.

═══ CHAÎNAGE NARRATIF DES OVERLAYS — RÈGLE ABSOLUE ═══

Le carrousel mix doit se lire comme UN SEUL mini-récit continu, slides photo ET texte confondues. Chaque slide REPREND, PROLONGE ou FAIT BASCULER ce que la précédente a posé — peu importe que la précédente soit une photo_full, photo_integrated ou text_only.

Sur les slides photo_full :
- À partir de la slide 2, CHAQUE overlay_text DOIT contenir au moins l'UN des deux éléments suivants :
  (a) un connecteur narratif en début ou milieu de phrase : "Puis", "Et puis", "Sauf que", "C'est là que", "Alors", "Du coup", "Trois mois plus tard", "Au début", "Maintenant", "Résultat", "Ce qu'on n'a pas vu venir".
  (b) une reprise lexicale d'un mot/groupe-clé de la slide précédente (le même mot, ou un synonyme évident qui boucle la référence).
- Les overlays lus à la suite (en ignorant les text_only entre eux) doivent former un fil narratif cohérent — pas une galerie de légendes interchangeables.

Sur les slides text_only :
- Elles s'OUVRENT sur ce que la slide photo précédente vient de poser (reprise lexicale, ou prolongement direct de l'image montrée).
- Elles DÉVELOPPENT en profondeur (mécanisme, donnée, croyance retournée, prise de position).
- Leur DERNIÈRE phrase TEND vers la slide suivante : elle ouvre la question, la tension ou l'image que la slide suivante va incarner.

Test de permutation : si on échange deux slides au hasard et que le carrousel "marche encore", c'est raté → recommence.

═══ INTERDICTION CASCADE / ESCALIER (CRITIQUE) ═══

La "cascade" est le défaut #1 des carrousels mixtes IA : chaque slide texte paraphrase la précédente en montant d'un cran émotionnel. C'est INTERDIT — à distinguer de la continuité narrative, qui elle est OBLIGATOIRE (voir bloc CHAÎNAGE ci-dessus).

- Test de progression : chaque slide texte DOIT APPORTER un élément nouveau (fait, scène, donnée, mécanisme, bascule, contre-exemple) par rapport à la précédente. Si elle reformule la même idée avec d'autres mots, ou avec une intensité supérieure → c'est une cascade : fusionne avec la précédente ou réécris-la autour d'un contenu neuf.
- Connecteurs d'ouverture : un connecteur narratif en ouverture d'une slide texte est AUTORISÉ s'il introduit un contenu NOUVEAU (scène, fait, donnée, exemple). Il reste INTERDIT s'il introduit une simple reformulation amplifiée de la slide précédente ("En vrai…", "Sauf qu'en fait…", "Le vrai X c'est…" suivis d'une redite = cascade).
- Deux slides texte consécutives ne doivent JAMAIS répéter le même mot-clé central. Si slide N parle de "visibilité", slide N+1 doit changer d'angle (exemple, contre-exemple, scène), pas redéfinir "visibilité".
- Pas de rampe émotionnelle artificielle ("c'est important" → "c'est crucial" → "c'est vital"). Une seule tension, posée une fois, puis on développe par EXEMPLES, pas par escalade rhétorique.
- Anti-TU : voix principale = JE (expérience partagée). Le TU est limité à 2 slides max d'interpellation ponctuelle, jamais comme voix narrative.

${SLIDE_TITLE_RULES}


═══ ASSIGNATION DES PHOTOS ═══

Les photos sont fournies dans l'ordre : photo 1, photo 2, etc.
Pour chaque slide photo (photo_full ou photo_integrated), indique photo_index (1, 2, 3...) pour dire quelle photo utiliser.

${deepeningCtx}${angleBlock}

═══ VÉRIFICATION FINALE (avant de retourner le JSON) ═══

- Les slides text_only ont TOUTES un body d'au moins 30 mots
- Le concept du sujet ("${body.subject || ""}") est visible dans le hook ET structure l'ensemble
- Il y a un arc narratif clair (pas des slides indépendantes)
- TEST DE PROFONDEUR par slide text_only : si on peut remplacer le sujet par un autre et que la slide fonctionne encore → GÉNÉRIQUE → RÉÉCRIS. Si la slide dit ce que tout le monde sait déjà → RÉÉCRIS. Si elle pourrait être écrite sans expertise sur le sujet → RÉÉCRIS.
- Au moins UNE slide text_only nomme explicitement le MÉCANISME identifié dans l'analyse interne (biais, concept, dynamique).
- Au moins UNE slide formule la CROYANCE retournée ("on croit X, en fait Y") OU porte le RETOURNEMENT de perspective (le moment "j'avais jamais vu ça comme ça"). Cette slide est le PIVOT du carrousel — pas le hook, pas le CTA, le milieu.
- Les overlay_text des slides photo_full, lus à la suite, forment un récit continu (reprise, prolongement ou bascule d'une slide à l'autre) — pas une galerie de légendes interchangeables.
- Le test de permutation échoue : déplacer une slide au hasard (photo ou texte) casserait visiblement le récit. Si ce n'est pas le cas, le chaînage est trop faible — réécris.
${isLinkedIn ? `- Pour LinkedIn mix : la légende (caption) est OPTIONNELLE — concentre-toi à 100% sur la qualité des slides PDF. Si tu inclus une caption, ne la bâcle pas, sinon laisse-la vide (elle sera générée par un appel dédié).` : `- Le bloc "caption" complet (hook, body, cta, hashtags) est OBLIGATOIRE dans le JSON — ne JAMAIS l'omettre, ne JAMAIS le laisser vide.`}

${isLinkedIn ? `═══ LÉGENDE LINKEDIN (OPTIONNELLE — peut être vide) ═══

Pour les carrousels mix LinkedIn, la légende est gérée par un appel dédié à linkedin-ai. Tu PEUX inclure un objet "caption" minimal ({"hook":"","body":"","cta":"","hashtags":[]}) ou l'omettre. Ne dépense PAS de tokens à rédiger une caption complète : tout ton effort doit aller dans la qualité des slides PDF (densité, arc narratif, overlays sobres, valeur concrète).` : `═══ LÉGENDE INSTAGRAM (OBLIGATOIRE — DOIT FIGURER DANS LE JSON SOUS LA CLÉ "caption") ═══

Tu DOIS produire un objet "caption" avec ces 4 champs remplis :
- "hook" (string, OBLIGATOIRE) : phrase d'accroche DIFFÉRENTE du texte de la slide 1, 1-2 phrases
- "body" (string, OBLIGATOIRE) : 300-700 caractères — ce que les photos ne montrent pas (l'envers du décor, l'émotion, le pourquoi)
- "cta" (string, OBLIGATOIRE) : invitation concrète à la conversation (question, appel à commenter, à partager)
- "hashtags" (array de 5-10 strings, OBLIGATOIRE) : hashtags pertinents sans le "#"

Total caption (hook + body + cta) : 400-800 caractères.

⚠️ INTERDICTION ABSOLUE de recopier un exemple textuel. La caption doit être 100% ANCRÉE dans le sujet "${body.subject || ""}" et dans CES photos précises. Si tu produis une caption qui pourrait s\'appliquer à un autre sujet (par ex. une rénovation alors que le sujet n\'a rien à voir), c\'est un ÉCHEC GRAVE.

STRUCTURE attendue (REMPLIS chaque champ avec du contenu ORIGINAL, ancré dans CE sujet et CES photos) :
{
  "hook": "<phrase d\'accroche 1-2 lignes, DIFFÉRENTE du texte slide 1, ancrée dans le sujet>",
  "body": "<300-700 caractères : l\'envers du décor de CE moment précis, ce que les photos ne disent pas, l\'émotion / le pourquoi spécifique au sujet>",
  "cta": "<invitation concrète à la conversation, en lien avec le sujet>",
  "hashtags": [<5 à 10 hashtags pertinents au sujet, sans le #>]
}`}


⚠️ Les valeurs ci-dessous sont là pour montrer la STRUCTURE JSON attendue, PAS le ton ni le contenu. Ne copie ni les formulations ("placeholder…"), ni le sujet, ni le rythme. Tout doit être 100% ancré dans le brief réel et les photos réelles.

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
      "overlay_text": "placeholder — phrase courte ancrée dans CETTE photo",
      "overlay_position": "bottom_center",
      "overlay_style": "sensoriel",
      "note": "placeholder — note DA"
    },
    {
      "slide_number": 2,
      "slide_type": "text_only",
      "photo_index": null,
      "role": "context",
      "title": "placeholder — entrée scène/JE en 4-9 mots, PAS un titre-annonce",
      "body": "placeholder — body de 30-50 mots, écrit en JE, qui pose UN point précis lié au brief, sans ouvrir par 'En vrai/Sauf que/Le vrai X', sans amplification dramatique, avec un détail concret ou une scène vécue.",
      "visual_schema": null
    },
    {
      "slide_number": 3,
      "slide_type": "photo_integrated",
      "photo_index": 2,
      "photo_layout": "top_photo",
      "role": "detail",
      "title": "placeholder — entrée scène/JE en 4-9 mots, PAS un titre-annonce",
      "body": "placeholder — texte qui accompagne la photo dans le layout",
      "note": "placeholder — note DA"
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
    "mecanisme_nomme": true,
    "croyance_retournee": true,
    "fabricated_scene_detected": false,
    "subject_depth_present": true,
    "personal_stance_present": true,
    "slide_pivot_number": 4,
    "depth_check": "chaque slide text_only porte un mécanisme, une croyance retournée, une donnée, un exemple ou une prise de position",
    "score": 85
  }
}`;
}

// ════════════════════════════════════════════════════════════════════
// MODE RÉACTION D'AUTRICE — carrousel mix déclenché par une actualité
// ════════════════════════════════════════════════════════════════════
function buildMixCarouselNewsReactionPrompt(body: any, isLinkedIn: boolean = false): string {
  const { editorial_angle, content_structure, deepening_answers, slide_structure, confirmed_structure, subject } = body;

  // Structure imposée (si présente) — réutilise le même bloc que le mode classique
  let confirmedStructureBlock = "";
  if (confirmed_structure && Array.isArray(confirmed_structure) && confirmed_structure.length > 0) {
    const structureList = confirmed_structure
      .map((s: any) => {
        let line = `  Slide ${s.slide_number} — Rôle : ${s.role} — Titre : "${s.title_suggestion}"`;
        if (s.photo_index) line += ` — Photo n°${s.photo_index}${s.slide_type ? ` (${s.slide_type})` : ""}`;
        line += ` — ${s.strategic_note}`;
        return line;
      })
      .join("\n");
    confirmedStructureBlock = `══════════════════════════════════════
STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE — OBLIGATOIRE
══════════════════════════════════════
Tu DOIS générer le contenu pour EXACTEMENT ces slides dans cet ordre :
${structureList}

RÈGLES ABSOLUES :
- Ne change NI l'ordre NI les rôles NI le nombre de slides
- Utilise les titres proposés comme base (tu peux les affiner légèrement)
- Génère uniquement le contenu (body, visual_schema, caption) pour chaque slide
- Le JSON retourné doit contenir exactement ${confirmed_structure.length} slides
- Si une slide a un photo_index, le champ photo_index doit être présent dans le JSON de sortie

`;
  }

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
    angleBlock = `\nANGLE ÉDITORIAL CHOISI : ${editorial_angle}\nSTRUCTURE IMPOSÉE :\n${content_structure}\n`;
  }

  // Structure-imposée slides (front-side)
  let structureConstraint = "";
  if (slide_structure && slide_structure.length > 0) {
    const lines = slide_structure.map((s: any) => {
      let line = `- Slide ${s.slide_number} : type="${s.type}"`;
      if (s.photo_index) line += `, photo_index=${s.photo_index}`;
      if (s.photo_layout) line += `, photo_layout="${s.photo_layout}"`;
      return line;
    }).join("\n");
    structureConstraint = `═══ STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE (OBLIGATOIRE) ═══
${lines}

Nombre total de slides : ${slide_structure.length}
RÈGLE ABSOLUE : le JSON retourné doit avoir EXACTEMENT ${slide_structure.length} slides dans le même ordre.

`;
  }

  return `${confirmedStructureBlock}Tu es l'AUTRICE qui réagit à une actualité dans un carrousel ${isLinkedIn ? "LinkedIn" : "Instagram"} mixte (photos + texte).

Ce N'EST PAS un résumé d'actu. Ce N'EST PAS une explication slide-par-slide. C'est UNE PRISE DE PAROLE PERSONNELLE qui rebondit sur cette actu.

══════════════════════════════════════
MODE "RÉACTION D'AUTRICE" — RÈGLES NON NÉGOCIABLES
══════════════════════════════════════

1. VOIX = JE qui réagit
   - L'autrice REGARDE l'actu et PARTAGE ce qu'elle en pense, ce que ça lui fait, ce qu'elle voit que les autres ne voient pas.
   - Pas de "voilà ce qui s'est passé + 3 leçons à en tirer". Pas de "pour mieux comprendre, voici 5 points".
   - À la place : "voilà ce que je vois passer / ce que ça me fait / pourquoi je trouve que c'est plus profond que ce qu'on raconte / ce que ça touche dans MON terrain".

2. ARC NARRATIF UNIQUE (obligatoire)
   - Slide 1 (hook visuel) : entrée scène — l'actu déclencheuse, mais pas comme un résumé : un détail, une phrase, une image qui m'a frappée.
   - Slides 2-3 : ce qui m'a vraiment frappée (précis, sensoriel, daté). C'est MON regard, pas le résumé.
   - Slide PIVOT (vers le milieu) : LE DÉCALAGE. Là où je ne suis pas d'accord avec la lecture commune. Là où je vois autre chose. C'est la pépite. Pas un diagnostic sur la lectrice — une PRISE DE POSITION sur le sujet.
   - Slides suivantes : ce que ça révèle de plus large (systémique, culturel, sectoriel). Lien avec mon terrain/métier formulé en JE ("dans mon métier je vois", "ce que ça touche chez moi").
   - Dernière slide : ouverture — pas une leçon, pas un conseil, une question ou un constat qui invite à la conversation.

3. CONTINUITÉ SLIDE-À-SLIDE (test obligatoire)
   - Si on lit les "body" des slides text_only à la suite, ça doit former UN MONOLOGUE COHÉRENT — la pensée d'une personne qui se déroule, pas 5 paragraphes indépendants.
   - Chaque slide REPREND quelque chose de la précédente (un mot, une image, une tension) et la fait AVANCER. Pas de slides parallèles qui pourraient être interverties.
   - INTERDIT : ouvrir une slide texte par "Premièrement", "Ensuite", "Pour finir", "1.", "2.", ou par un titre-annonce générique.

4. AUDIENCE = TÉMOIN, PAS PATIENTE
   - Le "tu/vous" est INTERDIT dans ce mode (sauf 1 fois dans le CTA final).
   - Pas de "tu attends la permission", "tu n'oses pas", "tu te compares", "on a intériorisé que…" formulé comme diagnostic. Voir bloc ANTI-VICTIMISATION dans le system prompt — il s'applique à 100% ici.
   - L'audience est convoquée par RICOCHET via "on" inclusif au sens "nous toutes qui regardons ça passer" — jamais désignée comme problème.
   - Si une slide pourrait être lue comme "elle me fait la leçon sur ce qui ne va pas chez moi" → RÉÉCRIS en constat sur le sujet ou le discours dominant.

5. PROFONDEUR = OPINION INCARNÉE, PAS DIAGNOSTIC PSY
   - La slide pivot porte UNE PRISE DE POSITION PERSONNELLE qui décale (ce que toi tu vois et que la lecture dominante rate). Pas "la croyance retournée de la lectrice".
   - Les slides text_only doivent porter au moins UN parmi : un fait précis sur l'actu (chiffre vérifiable, citation, date), une opinion tranchée signée JE, une nuance qu'on entend pas ailleurs, un parallèle concret avec ton terrain/métier.
   - Tranchée OK ("moi je trouve que…", "ça me gonfle que…", "je ne suis pas d'accord avec…"). Pas de vulgarité, pas d'attaque ad hominem.

6. PONT ACTU → MÉTIER (formulation obligatoire)
   - Pas "voilà ce que cette actu dit de TON business".
   - À la place : "voilà ce que cette actu touche dans MON terrain / dans MA pratique / dans ce que je vois passer chez les gens que j'accompagne".

══════════════════════════════════════
ACTU DÉCLENCHEUSE (rappel — détaillée dans le system prompt)
══════════════════════════════════════
Brief créatif personnel : "${subject || ""}"
Cette actu est le POINT D'ENTRÉE visible (slide 1). Le reste du carrousel = TA réaction, pas un résumé prolongé.

═══ TYPES DE SLIDES (identique au mode mix classique) ═══

1. "photo_full" — Photo plein écran + overlay court (5-20 mots, ancré dans CETTE photo, pas une formule chic).
2. "photo_integrated" — Photo intégrée dans un layout (top_photo, left_photo, right_photo, card_photo, banner_photo).
3. "text_only" — Slide texte pure. body 30-50 mots MIN, prose fluide écrite en JE, qui FAIT AVANCER le monologue.

═══ COMPOSITION ═══
- Carrousel de ${body.photos?.length || "N"} photos → ${body.photos?.length || "N"} à ${(body.photos?.length || 6) + 2} slides.
- Au moins 50% des slides en photo_full ou photo_integrated.
- Slide 1 = photo_full (entrée scène). Dernière slide = text_only (ouverture/CTA).
- Jamais 3 slides du même type à la suite. Alterne.

${structureConstraint}═══ CHAÎNAGE NARRATIF DES OVERLAYS — RÈGLE ABSOLUE ═══

Le carrousel mix doit se lire comme UN SEUL mini-récit continu, slides photo ET texte confondues. Chaque slide REPREND, PROLONGE ou FAIT BASCULER ce que la précédente a posé — peu importe que la précédente soit une photo_full, photo_integrated ou text_only.

Sur les slides photo_full :
- À partir de la slide 2, CHAQUE overlay_text DOIT contenir au moins l'UN des deux éléments suivants :
  (a) un connecteur narratif en début ou milieu de phrase : "Puis", "Et puis", "Sauf que", "C'est là que", "Alors", "Du coup", "Trois mois plus tard", "Au début", "Maintenant", "Résultat", "Ce qu'on n'a pas vu venir".
  (b) une reprise lexicale d'un mot/groupe-clé de la slide précédente (le même mot, ou un synonyme évident qui boucle la référence).
- Les overlays lus à la suite (en ignorant les text_only entre eux) doivent former un fil narratif cohérent — pas une galerie de légendes interchangeables.

Sur les slides text_only :
- Elles s'OUVRENT sur ce que la slide photo précédente vient de poser (reprise lexicale, ou prolongement direct de l'image montrée).
- Elles DÉVELOPPENT en profondeur (mécanisme, donnée, croyance retournée, prise de position sur l'actu).
- Leur DERNIÈRE phrase TEND vers la slide suivante : elle ouvre la question, la tension ou l'image que la slide suivante va incarner.

Test de permutation : si on échange deux slides au hasard et que le carrousel "marche encore", c'est raté → recommence.

═══ INTERDICTION CASCADE / ESCALIER (CRITIQUE) ═══

La "cascade" est le défaut #1 des carrousels mixtes IA : chaque slide texte paraphrase la précédente en montant d'un cran émotionnel. C'est INTERDIT — à distinguer de la continuité narrative, qui elle est OBLIGATOIRE (voir bloc CHAÎNAGE ci-dessus).

- Test de progression : chaque slide texte DOIT APPORTER un élément nouveau (fait, scène, donnée, mécanisme, bascule, contre-exemple) par rapport à la précédente. Si elle reformule la même idée avec d'autres mots, ou avec une intensité supérieure → c'est une cascade : fusionne avec la précédente ou réécris-la autour d'un contenu neuf.
- Connecteurs d'ouverture : un connecteur narratif en ouverture d'une slide texte est AUTORISÉ s'il introduit un contenu NOUVEAU (scène, fait, donnée, exemple). Il reste INTERDIT s'il introduit une simple reformulation amplifiée de la slide précédente ("En vrai…", "Sauf qu'en fait…", "Le vrai X c'est…" suivis d'une redite = cascade).
- Deux slides texte consécutives ne doivent JAMAIS répéter le même mot-clé central. Si slide N parle de "visibilité", slide N+1 doit changer d'angle (exemple, contre-exemple, scène), pas redéfinir "visibilité".
- Pas de rampe émotionnelle artificielle ("c'est important" → "c'est crucial" → "c'est vital"). Une seule tension, posée une fois, puis on développe par EXEMPLES, pas par escalade rhétorique.
- Anti-TU : voix principale = JE (expérience ou analyse partagée). Le TU est limité à 2 slides max d'interpellation ponctuelle, jamais comme voix narrative.

${SLIDE_TITLE_RULES}

═══ ASSIGNATION DES PHOTOS ═══
Photos fournies dans l'ordre : photo 1, photo 2... Pour chaque slide photo, indique photo_index.

${deepeningCtx}${angleBlock}

═══ VÉRIFICATION FINALE (avant de retourner le JSON) ═══
- Voix JE dominante : au moins 70% des slides text_only ouvrent ou pivotent sur "je", "moi", "ma/mon".
- Aucune slide ne contient "tu/vous" (sauf 1 max dans le CTA final).
- Aucune slide ne diagnostique l'audience (cf. ANTI-VICTIMISATION du system prompt).
- Au moins 2 slides portent une OPINION SIGNÉE ("moi je…", "je trouve que…", "je ne crois pas que…").
- Slide pivot identifiée : c'est une PRISE DE POSITION qui décale, pas un diagnostic.
- Test monologue : si je lis les body text_only à la suite → ça forme UNE pensée qui se déroule, pas 5 points indépendants.
- Le pont actu → métier est formulé en "ce que ça touche dans MON terrain", pas "ce que ça dit de TON business".
- Les overlay_text des slides photo_full, lus à la suite, forment un récit continu (reprise, prolongement ou bascule d'une slide à l'autre) — pas une galerie de légendes interchangeables.
- Test de permutation : si on échange deux slides au hasard et que le carrousel "marche encore" → raté, recommence.

${isLinkedIn ? `═══ LÉGENDE LINKEDIN (OPTIONNELLE) ═══
Caption gérée par appel dédié. Tu peux mettre {"hook":"","body":"","cta":"","hashtags":[]} ou l'omettre.` : `═══ LÉGENDE INSTAGRAM (OBLIGATOIRE) ═══
Objet "caption" avec :
- "hook" (1-2 phrases, DIFFÉRENT du texte slide 1, ancré dans TA réaction)
- "body" (300-700 caractères : l'envers de TA réaction, ce que les slides ne disent pas, formulé en JE)
- "cta" (invitation à la conversation — UNE seule, pas de liste)
- "hashtags" (5-10 hashtags pertinents au sujet, sans le #)`}

⚠️ Les valeurs ci-dessous montrent la STRUCTURE JSON, PAS le ton. Tout doit être 100% ancré dans l'actu réelle et la voix JE.

RETOURNE UNIQUEMENT ce JSON exact, sans texte avant ou après :
{
  "carousel_type": "mix",
  "chosen_angle": { "title": "Titre court de l'angle (3-5 mots)", "description": "Pourquoi cet angle / quel décalage je propose" },
  "slides": [
    {
      "slide_number": 1,
      "slide_type": "photo_full",
      "photo_index": 1,
      "role": "hook_visuel_actu",
      "overlay_text": "placeholder — détail/phrase/image qui m'a frappée dans cette actu (5-20 mots)",
      "overlay_position": "bottom_center",
      "overlay_style": "sensoriel",
      "note": "placeholder — note DA"
    },
    {
      "slide_number": 2,
      "slide_type": "text_only",
      "photo_index": null,
      "role": "ce_qui_m_a_frappee",
      "title": "placeholder — entrée scène en JE, 4-9 mots",
      "body": "placeholder — 30-50 mots en JE, ce qui m'a vraiment touchée dans cette actu, précis et sensoriel, AUCUN tu/vous, aucune leçon à l'audience",
      "visual_schema": null
    },
    {
      "slide_number": 3,
      "slide_type": "text_only",
      "photo_index": null,
      "role": "decalage_pivot",
      "title": "placeholder — ma prise de position, 4-9 mots",
      "body": "placeholder — 30-50 mots : LE DÉCALAGE. Là où je ne suis pas d'accord avec la lecture commune. Opinion signée JE. Pas un diagnostic sur l'audience.",
      "visual_schema": null
    }
  ],
  "caption": {
    "hook": "Accroche personnelle, différente de la slide 1",
    "body": "Corps de la légende en JE",
    "cta": "Invitation à la conversation (1 seule)",
    "hashtags": ["hashtag1", "hashtag2"]
  },
  "quality_check": {
    "total_slides": 8,
    "photo_full_count": 3,
    "photo_integrated_count": 2,
    "text_only_count": 3,
    "all_photos_used": true,
    "narrative_arc": true,
    "monologue_continuity": true,
    "je_voice_dominant": true,
    "audience_as_victim": false,
    "fabricated_scene_detected": false,
    "subject_depth_present": true,
    "personal_stance_present": true,
    "opinion_visible_in_at_least_2_slides": true,
    "decalage_pivot_slide_number": 3,
    "tu_vous_count_outside_cta": 0,
    "score": 85
  }
}`;
}