import { photoMatchPhotoCount, photoMatchReserveMs } from "./final-photo-match.ts";
import { NarrativePhotoMismatch } from "./continuous-narrative.ts";
import { PHOTO_NARRATIVE_CONTRACT, PHOTO_QUESTIONS_CONTRACT } from "./photo-narrative.ts";
import { autoMaxSlides, carouselLength, carouselLengthPrompt, carouselStructureIssues, longMixSlideIssues, longTextSlides } from "../_shared/carousel-length.ts";
import { draftSlidesTracker } from "../_shared/carousel-draft-stream.ts";
import { newsWriting } from "./variant-writing.ts";
import { CAROUSEL_WRITER_VERSION } from "./writer.ts";
import { authoredContentSource, currentContentContract, testimonySourceText } from "../_shared/editorial-voice.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildBrandGuardText } from "../_shared/user-context.ts";
import { isQaTestAccount, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { getModelForAction, AnthropicError, type UsageSink, type AnthropicOptions } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { photoReadingContract, CAROUSEL_WRITING_VERSION } from "./writing-contract.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError, clampAiField } from "../_shared/input-validators.ts";
import { carouselNeedsPolish } from "../_shared/correction-pass.ts";
import { parseAudienceAddress } from "../_shared/audience-address.ts";
import { runRedacGate, rescoreCaptionOnly, applyGuardedCarouselCorrection, type CaptionEndingRule } from "../_shared/redac-gate.ts";
import { carouselDurations, logContentQuality, threadOutcome } from "../_shared/content-quality.ts";
import { fetchPreviousHooks } from "../_shared/previous-hooks.ts";
import { recentPassagesPrompt } from "../_shared/recent-passages.ts";
// Mise en forme (schémas, disposition, gabarits) : étape isolée dans layout.ts (lot 8).
import { assignPhotoTemplates, assignTemplatesToProvidedSlides, capVisualSchemas, logSchemaFormatting, normalizeOverlayStyles, placeMixSchemas, placeTextSchemas, revalidatePhotoLayoutContent, withoutMixWriterLayout, withoutPhotoWriterLayout } from "./layout.ts";
import { runWithHeartbeatSSE, type StatusEmitter } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { buildDepthBlock } from "../_shared/depth-research.ts";
import { livedCaseFromCarouselBody, researchNumbersCapFor } from "../_shared/lived-case.ts";
import { buildSeriesContext } from "../_shared/series-context.ts";
import { mergeConfirmedStructure, normalizePhotoIndexes, maxStructurePhotoIndex, analyzeMixComposition } from "../_shared/photo-slide-structure.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";
import { _deps, type CarouselRequestContext, buildPhotoContextRecap, normalizeGeneratedPlanFields, normalizeSlideType, pickCorrectionModel, echoContext, writerTimeoutMs, pickCarouselModel, reviewAllowed, CORRECTION_ABORT_MS, stageTimer, carouselMismatchResponse, firstDraftStream, pushPhotoWithContext, retryIfTooShort, carouselSlideFloor } from "./shared.ts";
import { PHOTO_QUESTIONS_TOOL, QUESTIONS_TOOL, PHOTO_MISMATCH_SYSTEM_REMINDER, MIX_CAROUSEL_TOOL, PHOTO_CAROUSEL_TOOL } from "./tools.ts";
import { buildSystemPrompt, buildHooksPrompt, buildSlidesPrompt, buildSuggestTopicsPrompt, buildSuggestAnglesPrompt, buildMixCarouselNewsReactionPrompt, buildMixCarouselPrompt, buildPhotoCarouselNewsReactionPrompt, buildPhotoCarouselPrompt, buildExpressFullPrompt, buildDeepeningQuestionsPrompt } from "./prompts.ts";
import { startPhotoOutline, emitPlannedTitles, addOutlineUsage } from "./outline.ts";
import { handleStructureProposalRequest } from "./steps/structure.ts";
import { repairCarouselStructure, finalizeCarousel } from "./steps/finalize.ts";

// Fiche 2 (docs/robustesse/gros-fichiers.md) : déplacés à l'identique, réexportés pour les tests.
export { _deps, writerTimeoutMs, normalizeSlideType } from "./shared.ts";
export { plannedTitles } from "./outline.ts";
export { enforceCarouselAudienceAddress } from "./steps/finalize.ts";

// Post-traitement text_first : force photo_index à null partout (l'IA recopie
// parfois le photo_index des exemples JSON) et télémétrie des directives manquantes.
function enforceTextFirstDirectives(content: string): string {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return content;
    const parsed = JSON.parse(jsonMatch[0]);
    const slides = parsed?.slides;
    if (!Array.isArray(slides) || slides.length === 0) return content;
    let missingDirectives = 0;
    slides.forEach((s: any) => {
      if (!s) return;
      s.photo_index = null;
      const isPhoto = s.slide_type === "photo_full" || s.slide_type === "photo_integrated";
      if (isPhoto && !(typeof s.photo_directive === "string" && s.photo_directive.trim())) {
        missingDirectives += 1;
        // Repli (vu en sonde le 10/07) : sans directive, la carte de casting se
        // dégrade en simple « Ajouter une photo » et la slide échappe au
        // verrouillage du CTA. On synthétise depuis ce que la slide fournit.
        const fallback = [s.visual_suggestion, s.overlay_text, s.title]
          .find((x: unknown) => typeof x === "string" && (x as string).trim());
        s.photo_directive = typeof fallback === "string" && fallback.trim()
          ? `Une image qui illustre : ${fallback.trim()}`
          : "Une image cohérente avec l'univers de la marque, qui illustre le propos de cette slide.";
      }
      if (!isPhoto) {
        delete s.photo_directive;
        delete s.photo_query_en;
        delete s.library_photo_index;
        delete s.news_entity;
      }
    });
    if (missingDirectives > 0) {
      console.warn(`[carousel-ai] text_first: ${missingDirectives} slide(s) photo sans photo_directive`);
    }
    return content.replace(jsonMatch[0], JSON.stringify(parsed, null, 2));
  } catch (err) {
    console.warn("[carousel-ai] enforceTextFirstDirectives: échec, content laissé tel quel", err);
    return content;
  }
}
// Étage SCHÉMAS : budget et interrupteur du mixte dans layout.ts (lot 8).
export { MIX_SCHEMAS_ENABLED } from "./layout.ts";

export async function handleRequest(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);
  const wantsSSE = (req.headers.get("accept") || "").includes("text/event-stream");

  // Le corps DOIT être consommé avant de renvoyer la réponse SSE : si le stream
  // démarre alors que le corps (photos en vision, plusieurs Mo) n'est pas encore
  // lu, la passerelle Supabase se bloque — 502/504 sans en-têtes CORS, affiché
  // « blocked by CORS policy » par le navigateur (repro 21/07 sur carousel-visual ;
  // même pattern ici). creative-flow lit déjà son corps avant le stream.
  let body: any = {};
  if (req.method !== "OPTIONS") {
    try { body = await req.json(); } catch { body = {}; }
  }

  const handle = async (emitStatus: StatusEmitter = () => {}): Promise<Response> => {
  const startedAt = Date.now();

  try {

    // Quota is handled below per-category, so we skip it here
    const r = await _deps.runPipeline(req, {
      skipQuota: true,
      workspaceId: body?.workspace_id ?? undefined,
    });
    if (!r.ok) return r.response;
    const { userId, supabase } = r;
    // Banc d'essai du rédacteur (retour à Opus 5) : réservé au compte QA Camille.
    if (!isQaTestAccount(userId)) delete body.writer_bench;
    // Relance du plan avancée pour l'observer en réel (structure-hedge.ts) : compte QA seulement.
    if (!isQaTestAccount(userId)) delete body.qa_structure_hedge_after_ms;

    // Champs écrits par l'IA à une étape précédente (structure_proposal, choix
    // d'angle) puis renvoyés tels quels par le front pour la passe d'écriture :
    // on tronque au lieu de rejeter (narrative_thread > 1000 le 21/07).
    clampAiField(body, "editorial_angle", 100);
    clampAiField(body, "content_structure", 5000);
    clampAiField(body, "narrative_thread", 1000);
    if (Array.isArray(body?.confirmed_structure)) {
      for (const s of body.confirmed_structure) {
        normalizeGeneratedPlanFields(s);
        // Carrousel PHOTO : chaque slide est une slide photo. Une structure
        // renvoyée avec « text » (variante du modèle) devenait text_only, dont le
        // texte va dans title/body que le rendu photo n'affiche pas (vu en live
        // le 04/10/2026 : deux slides sans texte).
        if (body.carousel_type === "photo" && s && typeof s === "object") s.slide_type = "photo_full";
        clampAiField(s, "story_beat", 300);
        clampAiField(s, "visual_anchor", 120);
        clampAiField(s, "photo_observation", 800);
        clampAiField(s, "image_relation", 400);
        clampAiField(s, "factual_basis", 800);
      }
    }

    validateInput(body, z.object({
      type: z.enum(["hooks", "slides", "suggest_topics", "suggest_angles", "deepening_questions", "express_full", "structure_proposal", "assign_templates"]),
      // Mode « Mes slides » (assign_templates) : slides déjà écrites par
      // l'utilisatrice — la passe ne fait que poser les gabarits, jamais le texte.
      slides: z.array(z.record(z.unknown())).max(20).optional(),
      carousel_type: z.string().max(100).optional().nullable(),
      subject: z.string().max(15000).optional().nullable(),
      objective: z.string().max(100).optional().nullable(),
      slide_count: z.number().min(1).max(20).optional(),
      prefer_distinct_photos: z.boolean().optional(),
      workspace_id: z.string().uuid().optional().nullable(),
      editorial_angle: z.string().max(100).optional().nullable(),
      content_structure: z.string().max(5000).optional().nullable(),
      photos: z.array(z.object({ base64: z.string(), context: z.string().max(200).optional(), libraryContext: z.string().max(800).optional(), mimeType: z.string().max(50).optional() })).max(10).optional(),
      photo_contexts: z.array(z.object({ context: z.string().max(200).optional(), libraryContext: z.string().max(800).optional() })).max(10).optional(),
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
        contribution: z.string().max(2000).optional(),
        inherits: z.string().max(2000).optional(),
        develops: z.string().max(2000).optional(),
        source_ids: z.array(z.string().max(80)).max(20).optional(),
        image_role: z.string().max(2000).optional(),
        photo_index: z.number().optional(),
        // Tolère les variantes renvoyées par la proposition de structure (« text »…).
        slide_type: z.preprocess((v) => v == null ? undefined : normalizeSlideType(v), z.enum(["photo_full", "photo_integrated", "text_only"]).optional()),
        story_beat: z.string().max(300).optional(),
        visual_anchor: z.string().max(120).optional(),
        photo_observation: z.string().max(800).optional(),
        image_relation: z.string().max(400).optional(),
        factual_basis: z.string().max(800).optional(),
        overlay_position: z.enum(["top_left", "top_center", "bottom_left", "bottom_center", "center"]).optional(),
      })).optional().nullable(),
      narrative_thread: z.string().max(1000).optional().nullable(),
      scenario_origin: z.enum(["automatic","user_validated","user_authored"]).optional(),
      editorial_intent: z.object({mode:z.string().max(40),idea:z.string().max(2000),reader_takeaway:z.string().max(2000),basis_source_ids:z.array(z.string().max(80)).max(20),inferred:z.boolean()}).optional(),
      recent_briefs_context: z.string().max(6000).optional().nullable(),
      news_context: z.string().max(4000).optional().nullable(),
      // Régime « texte d'abord » (lot 1 casting) : rédaction sans photos, directives
      // d'images par slide + matching strict contre le catalogue bibliothèque.
      text_first: z.boolean().optional(),
      photo_catalog: z.array(z.object({
        index: z.number().int().min(1).max(60),
        description: z.string().max(400),
        kind: z.string().max(30).optional().nullable(),
      })).max(40).optional(),
      series_id: z.string().uuid().optional().nullable(),
      episode_number: z.number().int().min(1).optional().nullable(),
    }).passthrough());
    const { type, workspace_id, launch_context, series_id, episode_number, news_context: newsContext } = body;
    const isLinkedIn = body.channel === "linkedin";

    // ── Mode « Mes slides » : passe gabarits SEULE (15/07) ──
    // Le texte vient de l'utilisatrice : AUCUNE génération, AUCUN runRedacGate,
    // aucun crédit débité (pas de checkQuota/logUsage — mini-passe Haiku de
    // relecture, comme la RELECTURE-gabarits du flux photo). Fail-open : toute
    // erreur renvoie les slides telles quelles, et si cette version de l'edge
    // n'est pas déployée le front continue sans elle (le rendu dérive un
    // gabarit sûr via resolvePhotoTemplate).
    if (type === "assign_templates") {
      return handleAssignTemplatesRequest(body, corsHeaders);
    }

    // Grille Premium du 01/10/2026 : UN carrousel rédigé (express_full, y compris
    // photo/mix, ou slides) = UNE unité de la catégorie `carousel` (20/mois en
    // Premium), Qualité Max compris. Les étapes intermédiaires (accroches…)
    // restent en `content`. `quality_max` ne compte plus rien : c'est seulement
    // le droit d'accès (0 en gratuit → not_available), vérifié à part.
    const isSuggestion = type === "suggest_topics" || type === "suggest_angles" || type === "deepening_questions" || type === "structure_proposal";
    const category = isSuggestion ? "suggestion" : (type === "express_full" || type === "slides") ? "carousel" : "content";
    if (!isSuggestion && body?.quality_max) {
      const qmAccess = await _deps.checkQuota(userId, "quality_max", workspace_id);
      if (!qmAccess.allowed) return quotaDeniedResponse(qmAccess, corsHeaders);
    }
    const quotaCheck = await _deps.checkQuota(userId, category, workspace_id);
    if (!quotaCheck.allowed) {
      return quotaDeniedResponse(quotaCheck, corsHeaders);
    }

    const ctx = await getUserContext(supabase, userId, workspace_id, isLinkedIn ? "linkedin" : "instagram");
    // « Ton cas d'abord » (04/10/2026) : quand la personne a donné son propre cas,
    // il est la preuve centrale. Son histoire de marque n'est pas jointe à la
    // rédaction (« dix ans dans le marketing digital » racontés à la place de
    // son récit, carrousel de référence) et la recherche passe en mode appui.
    // Actu (05/10/2026) : l'accroche écrite par l'IA ne compte jamais comme vécu ;
    // avec ses réponses (« news_feeling »), son ressenti porte le contenu et
    // l'histoire de marque n'est pas jointe non plus, mais la recherche reste en
    // profondeur pour l'actu.
    const livedCase = livedCaseFromCarouselBody(body);
    const tellsOwnCase = (livedCase.provided || livedCase.mode === "news_feeling") && ["express_full", "slides", "hooks"].includes(type);
    const brandingContext = formatContextForAI(ctx, tellsOwnCase ? { ...CONTEXT_PRESETS.posts, includeStory: false } : CONTEXT_PRESETS.posts);
    if (livedCase.provided) console.log(`[carousel-ai] cas personnel fourni (${livedCase.reasons.join(", ")}) — ton cas d'abord, recherche en appui`);
    else if (livedCase.mode === "news_feeling") console.log(`[carousel-ai] actu + ressenti fourni (${livedCase.reasons.join(", ")}) — son ressenti porte le contenu, recherche en profondeur`);
    // Champs de marque bruts (combat, mission, ton…) : le redac-gate s'en sert
    // pour détecter une recopie quasi mot pour mot (audit slop 18/08). Aucune
    // requête supplémentaire — ctx.tone est déjà fetché par getUserContext().
    const brandGuardText = buildBrandGuardText(ctx);

    // Recent briefs context — fetched server-side for deepening_questions ET pour la
    // génération elle-même (anti-sérialité, audit qualité 11/07 : sans mémoire des
    // contenus récents, le moteur re-sert la même idée-pivot, les mêmes amorces et
    // le même CTA d'un carrousel à l'autre du même compte).
    const generationTypes = ["express_full", "slides", "hooks"];
    let recentBriefsContext = body.recent_briefs_context || "";
    if (!recentBriefsContext && (type === "deepening_questions" || generationTypes.includes(type))) {
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

    // L'utilisatrice a-t-elle fourni de la VRAIE matière (réponses d'approfondissement) ?
    // À capturer AVANT le fallback branding ci-dessous, qui remplit le même champ.
    const currentAuthoredText = authoredContentSource(body);
    const currentBrief = [body.subject, body.subject_details, body.photo_description, buildPhotoContextRecap(body.photo_contexts || body.photos), body.editorial_angle, body.objective,
      body.narrative_thread ? `${body.scenario_origin === "automatic" ? "FIL AUTOMATIQUE À RÉÉVALUER" : "FIL CONFIRMÉ À PRÉSERVER"} : ${body.narrative_thread}` : "",
      body.confirmed_structure?.length ? `REPÈRES DU PLAN (analyse IA, pas de nouveaux faits confirmés) : ${JSON.stringify(body.confirmed_structure)}` : "",
      body.content_structure ? `STRUCTURE CHOISIE À PRÉSERVER : ${body.content_structure}` : "",
      currentAuthoredText, typeof body.news_context === "string" ? body.news_context : ""].filter(Boolean).join("\n");
    const semanticReviewEnabled = Deno.env.get("CAROUSEL_SEMANTIC_REVIEW") !== "false";
    // Seule source admise d'un témoignage (« une cliente me disait ») ou d'un vécu
    // au passé (« j'ai essayé ») : ce que la personne a écrit pour CE carrousel
    // (brief, réponses, contexte explicite des photos) et l'actu. Jamais le
    // branding, la recherche ni les indications de bibliothèque (04/10/2026).
    const testimonySource = [body.subject, body.subject_details, body.photo_description, body.editorial_angle, body.objective,
      ...(Array.isArray(body.photo_contexts || body.photos) ? (body.photo_contexts || body.photos).map((p: any) => typeof p?.context === "string" ? p.context : "") : []),
      testimonySourceText(body)].filter((v) => typeof v === "string" && v.trim()).join("\n");

    // Brand context remains reference data; never turn tone into an invented emotion or conviction.

    // Tu ou vous réglé dans la fiche de marque : règle ferme en tête de la
    // rédaction, puis contrôle par le code dans finalizeCarousel (04/10/2026).
    const audienceAddress = parseAudienceAddress(ctx?.tone?.tone_register);
    let systemPrompt = buildSystemPrompt(brandingContext, isLinkedIn, ctx.profile, livedCase.mode, audienceAddress) + "\n" + photoReadingContract(body);
    if (body.editorial_intent) systemPrompt += "\nINTENTION DU PLAN AUTOMATIQUE (proposition à confronter aux sources) :\n" + JSON.stringify(body.editorial_intent);

    // Recherche « creuser le sujet » (lot D-bis, audit qualité 11-12/07) : on va
    // chercher ce qu'il y a sous le sujet (mécanisme réel, lecture sociale, faits
    // sourcés) pour éviter le traitement de surface. Depuis le 04/10/2026 elle tourne
    // aussi avec une actu ou des réponses : l'actu ne donne que le déclencheur et les
    // réponses le vécu, aucun des deux n'apporte les faits qui étayent une position.
    // Condiment : échec 100 % silencieux, borné à 25 s.
    // « Ton cas d'abord » (04/10/2026) : avec un cas personnel fourni, la recherche
    // ne fait que vérifier ou appuyer un point de ce cas (mode « support »).
    // ATTENTE VIVANTE (08/10/2026) : plan envisagé des carrousels photo et
    // mixte lancé AVANT la recherche (jusqu'à 25 s), en parallèle de tout le
    // reste : ils attendaient ~3 min sur un écran fixe. Il n'en a pas besoin.
    const outline = type === "express_full" && (body.carousel_type === "photo" || body.carousel_type === "mix")
      ? startPhotoOutline({ body, emitStatus, isLinkedIn, systemPrompt })
      : undefined;
    let depthBlock = "";
    if (type === "express_full") {
      const newsAngle = typeof body.news_context === "string" ? body.news_context.trim().slice(0, 600) : "";
      const depthMode = livedCase.provided ? "support" : "depth";
      const material = await _deps.fetchDepthMaterial({
        subject: [body.subject || "", newsAngle].filter(Boolean).join("\n"),
        activity: ctx?.profile?.activite,
        model: getModelForAction("content"),
        apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
        logger: (m) => console.log(m),
        mode: depthMode,
        livedCase: livedCase.provided ? [body.subject_details, ...livedCase.answers].filter(Boolean).join("\n") : undefined,
      });
      depthBlock = buildDepthBlock(material, depthMode);
      if (depthBlock) systemPrompt += depthBlock;
    }

    // Liste blanche des chiffres autorisés en sortie (lot 3 anti-chiffres-inventés) :
    // tout ce que l'utilisatrice, son branding, l'actu ou la recherche ont réellement fourni.
    const gateInputText = [
      body.subject,
      body.subject_details,
      body.photo_description,
      body.editorial_angle,
      body.objective,
      body.deepening_answers ? JSON.stringify(body.deepening_answers) : "",
      typeof body.news_context === "string" ? body.news_context : "",
      depthBlock,
      Array.isArray(body.photo_contexts || body.photos) ? (body.photo_contexts || body.photos).map((p: any) => p?.context || "").join("\n") : "",
      Array.isArray(body.photo_catalog) ? body.photo_catalog.map((p: any) => p?.description || "").join("\n") : "",
      brandingContext || "",
    ].filter(Boolean).join("\n");

    // Anti-sérialité : la génération connaît les sujets récents du compte et doit
    // s'en démarquer (idée-pivot, amorces, forme du CTA) — audit qualité 11/07.
    if (recentBriefsContext && generationTypes.includes(type)) {
      systemPrompt += `\n${recentBriefsContext}
CONSIGNE ANTI-SÉRIALITÉ (génération) : ces briefs récents sont là pour t'en DÉMARQUER, pas pour t'en inspirer.
- Si le sujet courant est voisin d'un brief récent, choisis une IDÉE-PIVOT différente : ne redis pas la même thèse avec d'autres mots.
- Ne réutilise AUCUNE formule d'ouverture de slide, de prise de position ou de CTA qui pourrait déjà être sortie sur ces sujets : quelqu'un qui lit le feed voit les carrousels CÔTE À CÔTE.
- Varie la construction par rapport à un carrousel précédent probable : place de la prise de position, forme de la caption, type de hook.`;
    }

    systemPrompt += currentContentContract([
      body.subject, body.photo_description, currentAuthoredText,
      typeof body.news_context === "string" ? body.news_context : "",
    ].filter(Boolean).join("\n"));

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
      ? `\n\nACTUALITÉ FOURNIE (faits de référence) :\n${newsContext.trim()}\n${newsWriting(body)}`
      : "";
    if (newsContextBlock) {
      systemPrompt += newsContextBlock;
      if (type === "deepening_questions") {
        systemPrompt += `\n\n⚠️ NEWSJACKING ACTIF : au moins 1 question sur 3 doit aider à faire le pont entre cette actualité et le vécu / l'opinion / l'expertise de l'utilisatrice (pas une question générique sur le sujet).`;
      }
    }

    // Variance de caption PILOTÉE PAR CODE (audit qualité 11/07 : 9-10 captions
    // sur 10 finissaient par une question sur le même gabarit ; la consigne de
    // prompt seule n'a pas suffi — re-test 12/07). Le tirage force la distribution,
    // et le redac-gate fait RESPECTER la forme tirée (re-test v3 : le modèle
    // désobéissait 4 fois sur 7 à la consigne seule) via captionEndingRule.
    let captionEndingRule: CaptionEndingRule | undefined;
    if (type === "express_full" && !isLinkedIn && !semanticReviewEnabled) {
      const CAPTION_ENDINGS: Array<{ requiresQuestion: boolean; instruction: string }> = [
        { requiresQuestion: true, instruction: `une QUESTION spécifique au cœur du carrousel (jamais générique, elle reprend un mot ou une image des slides)` },
        { requiresQuestion: false, instruction: `une conclusion spécifique au sujet — AUCUNE question, AUCUN point d'interrogation dans le cta` },
        { requiresQuestion: false, instruction: `une INVITATION à raconter UN cas précis en commentaire, à l'impératif — SANS point d'interrogation` },
        { requiresQuestion: false, instruction: `une CONFIDENCE ou un aveu personnel qui clôt le propos — AUCUNE question` },
        { requiresQuestion: false, instruction: `une CHUTE SOBRE : la dernière idée se suffit, pas d'appel explicite à commenter — AUCUNE question` },
      ];
      captionEndingRule = CAPTION_ENDINGS[Math.floor(Math.random() * CAPTION_ENDINGS.length)];
      console.log(`[carousel-ai] chute caption tirée : ${captionEndingRule.requiresQuestion ? "question" : "non-question"} — ${captionEndingRule.instruction.slice(0, 60)}`);
      systemPrompt += `\n\n══ CHUTE DE CAPTION IMPOSÉE POUR CETTE GÉNÉRATION ══\nLa caption se termine par : ${captionEndingRule.instruction}.\nCette forme est NON NÉGOCIABLE pour cette génération (elle assure qu'un feed ne montre pas dix captions construites pareil). Si la forme imposée n'est pas une question, le champ "cta" de la caption ne contient AUCUN point d'interrogation.`;
    }

    if (semanticReviewEnabled) systemPrompt += `\nCONTRAT ÉDITORIAL PRIORITAIRE POUR CE CARROUSEL :\nChaque passage doit servir le propos, la progression ou la voix : explication, distinction réelle, nuance, image éclairante, émotion située, humour. N'ajoute ni opposition de façade, ni révélation banale, ni transition emphatique, ni slogan de conclusion. Juge ces mécanismes en contexte quelle que soit leur formulation ou ponctuation. Une phrase peut être vraie et rester creuse. Une comparaison informative reste utile. Les titres, overlays et légendes suivent le même contrat. Une conviction, une confidence, un retournement ou une chute ne sont jamais obligatoires : ignore les recettes et quotas contraires dans les exemples. Respecte la demande actuelle et son ton ; termine quand l'idée aboutit, avec une action seulement si elle sert l'objectif.\n`;

    // Accroches déjà écrites par cette utilisatrice sur CE sujet. Le bloc
    // anti-sérialité ci-dessus est une CONSIGNE (probabiliste) ; ceci est la
    // MESURE qui va avec (déterministe) : le gate compare l'accroche produite
    // aux précédentes et déclenche une re-passe si elle les redit. Lecture
    // best-effort — une erreur renvoie [] et ne change rien au flux.
    const previousHooks = await fetchPreviousHooks(userId, body.subject, undefined, workspace_id);
    // Derniers contenus de la marque, tous sujets (bilan hebdo 05/10/2026) : le
    // rédacteur ne les redit pas (consigne) et le gate mesure toute phrase reprise
    // mot pour mot (re-passe gardée). Lecture best-effort, [] en cas d'erreur.
    const recentTexts = (type === "express_full" || type === "slides")
      ? await _deps.fetchRecentTexts(userId, workspace_id)
      : [];
    if (recentTexts.length) systemPrompt += `\n\n${recentPassagesPrompt(recentTexts)}`;
    if (previousHooks.length) {
      console.log(`[carousel-ai] ${previousHooks.length} accroche(s) déjà écrite(s) sur ce sujet — garde anti-redite active`);
    }

    const reqCtx: CarouselRequestContext = {
      body,
      currentAuthoredText,
      currentBrief,
      semanticReviewEnabled,
      userId,
      workspaceId: workspace_id,
      category,
      isLinkedIn,
      systemPrompt,
      brandingContext,
      gateInputText,
      researchText: depthBlock,
      // 1 chiffre de recherche pour son cas, 3 pour l'actu (avec ou sans ressenti).
      researchNumbersCap: researchNumbersCapFor(livedCase),
      testimonySource,
      brandGuardText,
      audienceAddress,
      captionEndingRule,
      recentBriefsContext,
      previousHooks,
      recentTexts,
      brandVocabBlock,
      newsContext,
      corsHeaders,
      emitStatus,
      startedAt,
      outline,
    };

    switch (type) {
      case "hooks":
        return await handleHooksRequest(reqCtx);
      case "slides":
        return await handleSlidesRequest(reqCtx);
      case "express_full":
        return await handleExpressFullRequest(reqCtx);
      case "structure_proposal":
        return await handleStructureProposalRequest(reqCtx);
      case "suggest_topics":
        return await handleSuggestTopicsRequest(reqCtx);
      case "suggest_angles":
        return await handleSuggestAnglesRequest(reqCtx);
      case "deepening_questions":
        return await handleDeepeningQuestionsRequest(reqCtx);
      default:
        return new Response(JSON.stringify({ error: "Type invalide" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    if (e instanceof ValidationError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Erreur Anthropic typée (ex. génération coupée car trop longue, 422) :
    // remonter son message actionnable au lieu d'un 500 « Erreur interne ».
    if (e instanceof AnthropicError) {
      console.error("carousel-ai AnthropicError:", e.status, e.message);
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status >= 400 && e.status < 600 ? e.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
}

// `import.meta.main` n'est vrai que lorsque ce fichier est le point d'entrée
// Deno (invocation directe par le runtime edge) — faux quand un test `import`e
// ce module. `serve()` ne tente donc jamais de binder un port pendant les
// tests (qui tournent avec --allow-env --allow-read, sans --allow-net).
if (import.meta.main) {
  serve(handleRequest);
}

// ── Mode « Mes slides » (assign_templates) : passe gabarits SEULE (15/07) ──
// Le texte vient de l'utilisatrice : AUCUNE génération, AUCUN runRedacGate,
// aucun crédit débité (pas de checkQuota/logUsage — mini-passe Haiku de
// relecture, comme la RELECTURE-gabarits du flux photo). Fail-open : toute
// erreur renvoie les slides telles quelles, et si cette version de l'edge
// n'est pas déployée le front continue sans elle (le rendu dérive un
// gabarit sûr via resolvePhotoTemplate).
async function handleAssignTemplatesRequest(body: any, corsHeaders: Record<string, string>): Promise<Response> {
  const enriched = await assignTemplatesToProvidedSlides(body.slides, {
    model: pickCorrectionModel(body),
    logger: (m) => console.log(m),
  });
  return new Response(JSON.stringify({ result: { slides: enriched } }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Partagée par hooks / slides / express_full (texte standard) / suggest_topics /
// suggest_angles / deepening_questions (variante texte) : un seul appel IA,
// passe de correction JSON conditionnelle, quality-gate rédactionnel + cap des
// visual_schema (uniquement express_full/slides), puis logUsage.
async function runGenerationAndRespond(
  type: string,
  userPrompt: string,
  reqCtx: CarouselRequestContext,
): Promise<Response> {
  const { body, currentAuthoredText, currentBrief, semanticReviewEnabled, userId, workspaceId, category, systemPrompt, gateInputText, researchText, testimonySource, brandGuardText, captionEndingRule, isLinkedIn, previousHooks, corsHeaders, emitStatus, startedAt } = reqCtx;

  // L1 : Haiku pour les deepening_questions (tâche structurée et bornée).
  const isWriting = ["express_full", "slides", "hooks"].includes(type);
  const usage: UsageSink = {};
  if (type !== "deepening_questions") emitStatus("writing");
  const writingOptions: Omit<AnthropicOptions, "model"> = {
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    // Carrousel texte jusqu'à 20 slides (04/10/2026) : la réflexion adaptative
    // compte dans ce plafond, 8192 laissait peu de marge à un texte découpé
    // une idée par slide. Un plafond plus haut ne coûte que ce qui est écrit.
    max_tokens: type === "deepening_questions" ? 1024 : 16000,
    // Le carrousel tournait au défaut API (1.0), plus chaud que les autres
    // canaux (0.8) → on cadre la créativité du format vitrine. Les questions
    // (Haiku, tâche bornée) gardent le comportement par défaut.
    ...(type === "deepening_questions" ? {} : { temperature: 0.85 }),
    // Questions = appel Haiku court et borné : 30s/tentative pour qu'un fetch
    // qui traîne bascule en retry plutôt que de bloquer le chemin d'activation.
    // Les autres types (express_full/slides/hooks) tournaient SANS limite avant
    // ce correctif (audit timeouts 17/08) — 120s aligné sur la convention
    // "génération standard" du reste des edges du repo. Depuis le 04/10/2026 la
    // rédaction suit le budget global (writerTimeoutMs) au lieu de 120 s fixes.
    ...(type === "deepening_questions" ? { abortTimeoutMs: 30000, tool: (body.carousel_type === "photo" || body.carousel_type === "mix") ? PHOTO_QUESTIONS_TOOL : QUESTIONS_TOOL } : { abortTimeoutMs: writerTimeoutMs(startedAt) }),
  };
  // Durées par étape (ms), renvoyées avec la réponse : sans elles la lenteur du
  // 30/09 (~190 s) n'était décomposable qu'en devinant entre deux évènements SSE.
  const timings: Record<string, number> = { prep_ms: Date.now() - startedAt };
  const timed = async <T>(key: string, work: Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try { return await work; } finally { timings[key] = (timings[key] || 0) + Date.now() - t0; }
  };
  // SLIDES EN BROUILLON (07/10/2026) : chaque slide terminée part à l'écran
  // pendant l'écriture (évènement status `draft`), le texte relu la remplace.
  const draftStream = type === "express_full" ? { onText: draftSlidesTracker((slides) => emitStatus("draft", { slides })) } : {};
  // Jetons comptés à part : le rédacteur réécrit `usage` en fin d'appel.
  const outlineUsage: UsageSink = {};
  const outline = type === "express_full" ? emitPlannedTitles(systemPrompt, userPrompt, emitStatus, outlineUsage) : Promise.resolve();
  let content = await timed("write_ms", isWriting
    ? _deps.callCarouselWriter({ ...writingOptions, ...draftStream, model: pickCarouselModel(body) }, usage)
    : _deps.callAnthropic({ ...writingOptions, model: getModelForAction(type === "deepening_questions" ? "questions" : "carousel") }, usage));

  // Contextual review for every generated carousel, legacy scan only on rollback.
  // Ne rejette jamais : une relecture en échec rend le texte reçu.
  const review = async (value: string): Promise<string> => {
    try {
      if (semanticReviewEnabled || carouselNeedsPolish(value) || currentAuthoredText.trim()) {
        emitStatus("correcting");
        const corrected = await applyGuardedCarouselCorrection(value, {
          inputText: gateInputText, researchText, testimonySource, brandGuardText, echo: echoContext(reqCtx),
          correction: { currentBrief, semanticReview: semanticReviewEnabled,
            enabled: reviewAllowed(startedAt),
            skipIfShorterThan: 300,
            logger: (msg) => console.log(msg),
            model: pickCorrectionModel(body),
            authoredText: currentAuthoredText,
            abortTimeoutMs: CORRECTION_ABORT_MS,
          },
        });
        if (corrected && corrected !== value) return corrected;
      } else {
        console.log("[correction-pass:carousel-json] SKIPPED (scan déterministe propre, texte)");
      }
    } catch (correctionError) {
      console.error("Correction pass failed in carousel-ai:", correctionError);
    }
    return value;
  };

  const regenerate=(draft:string,defects:string,sink:UsageSink,abortTimeoutMs=120_000)=>_deps.callCarouselWriter({
    ...writingOptions,abortTimeoutMs,model:pickCarouselModel(body),messages:[{role:"user",content:userPrompt+"\n\nBROUILLON À COMPLÉTER :\n"+draft+"\n\n"+defects}],
  },sink);
  let structuralRepair=false;
  if(type==="express_full" || type==="slides") {
    const repaired=await timed("structure_ms",repairCarouselStructure(content,{body,label:type,emitStatus,usage,startedAt,regenerate}));
    content=repaired.content;structuralRepair=repaired.repaired;
  }
  const editorialBaseline=content;
  if(type==="express_full" || type==="slides" || type==="hooks") content=await timed("review_ms",review(content));

  let gateExpress: Awaited<ReturnType<typeof runRedacGate>> | null = null;

  // Garde DÉTERMINISTE sur les schémas (max 2, jamais consécutifs) : layout.ts.
  if (type === "express_full" || type === "slides") {
    content = capVisualSchemas(content, "carousel-ai");
    // Quality-gate rédactionnel : mesures en code + re-passe ciblée si violations
    gateExpress = await timed("gate_ms", runRedacGate(content, {
      isLinkedIn,
      onStatus: emitStatus,
      inputText: gateInputText,
      researchText,
      researchNumbersCap: reqCtx.researchNumbersCap,
      testimonySource,
      echo: echoContext(reqCtx),
      brandGuardText,
      captionEnding: captionEndingRule,
      correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: reviewAllowed(startedAt), skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
    }));
    content = gateExpress.content;
  }

  if (type === "express_full" || type === "slides") {
    content=await timed("thread_ms",finalizeCarousel(content,reqCtx,{usage,repaired:structuralRepair,regenerate,timings,expectedRepairMs:timings.write_ms}));
    // Mesure écrite APRÈS le contrôle du fil : la ligne porte aussi son issue.
    if (gateExpress) await logContentQuality(userId, `carousel_${type}`, gateExpress, usage.model, workspaceId, body.subject, threadOutcome(content),
      carouselDurations(type, { ...timings, total_ms: Date.now() - startedAt }, { content, avantSchemas: true }));
    // SCHÉMAS décidés après l'écriture et ses relectures, sur le texte final
    // (la rédaction ne les connaît plus : un changement d'écriture ne peut plus
    // les faire disparaître). Échec ou manque de temps → aucun schéma, texte livré.
    const withSchemas = await timed("schemas_ms", placeTextSchemas(content, { usage, startedAt, maxSlides: carouselLength(body).exact ? 0 : autoMaxSlides(body) }));
    content = withSchemas.content;
    const finalParsed = tryParseAiJson<any>(content);
    console.log(JSON.stringify({ event: "carousel_rhythm", label: type, slides: Array.isArray(finalParsed?.slides) ? finalParsed.slides.length : 0, long_slides: longTextSlides(finalParsed, body) }));
    logSchemaFormatting(type, withSchemas.plan);
  }

  // deepening_questions (variante texte) est gratuit — arbitrage 10/07/2026 :
  // un carrousel débite 2 crédits (rédaction express_full + carousel_visual),
  // les questions pré-chargées ne comptent pas (aligné sur creative-flow).
  await outline;
  for (const k of ["input_tokens", "output_tokens", "total_tokens"] as const) if (outlineUsage[k]) usage[k] = (usage[k] || 0) + outlineUsage[k]!;
  if (type !== "deepening_questions") {
    await _deps.logUsage(userId, category, `carousel_${type}`, usage.total_tokens, usage.model, workspaceId);
  }

  timings.total_ms = Date.now() - startedAt;
  if (isWriting) console.log(JSON.stringify({ type: "carousel_timings", label: type, review_before_judge: true, ...timings }));
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION,
    ...(isWriting ? { writer: { version: CAROUSEL_WRITER_VERSION, model: usage.model, effort: "medium" }, timings } : {}),
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleHooksRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildHooksPrompt(reqCtx.body, reqCtx.isLinkedIn);
  return runGenerationAndRespond("hooks", userPrompt, reqCtx);
}

async function handleSlidesRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildSlidesPrompt(reqCtx.body, reqCtx.isLinkedIn);
  return runGenerationAndRespond("slides", userPrompt, reqCtx);
}

async function handleSuggestTopicsRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildSuggestTopicsPrompt(reqCtx.body, reqCtx.isLinkedIn);
  return runGenerationAndRespond("suggest_topics", userPrompt, reqCtx);
}

async function handleSuggestAnglesRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildSuggestAnglesPrompt(reqCtx.body, reqCtx.isLinkedIn);
  return runGenerationAndRespond("suggest_angles", userPrompt, reqCtx);
}

// ── Mix carousel mode ──
async function continuousCarouselResponse(ctx: CarouselRequestContext): Promise<Response | null> {
  const usage: UsageSink = {};
  const clock = stageTimer(ctx.startedAt);
  let output;
  // Derniers contenus de la marque : le rédacteur ne les redit pas (bilan
  // hebdo 05/10/2026). Lecture best-effort, [] en cas d'erreur.
  const recentTexts = ctx.recentTexts;
  // Temps gardé pour l'association des photos, selon le nombre de photos
  // (final-photo-match.ts) : le reste va à la rédaction, au juge et à sa réparation.
  const matchReserveMs = photoMatchReserveMs(ctx.body);
  try { output = await _deps.prepareNarrative({
    body:ctx.body, brandingContext:ctx.brandingContext, recentTexts,
    photoContext:buildPhotoContextRecap(ctx.body.photo_contexts || ctx.body.photos),
    newsContext:typeof ctx.newsContext === "string" ? ctx.newsContext : "",
    authoredText:ctx.currentAuthoredText, audienceAddress:ctx.audienceAddress, startedAt:ctx.startedAt, usage,
    emitStatus:ctx.emitStatus, write:_deps.callCarouselWriter, reserveMs:matchReserveMs,
    onDraft:(slides)=>ctx.emitStatus("draft",{slides}), timings:clock.timings,
  }); } catch(error) {
    if(error instanceof NarrativePhotoMismatch) return carouselMismatchResponse(JSON.stringify({photo_mismatch:{reason:error.message}}),ctx.body,usage,ctx.body.carousel_type,ctx.corsHeaders);
    throw error;
  }
  if (!output) return null;
  const measured = await clock.timed("gate_ms", runRedacGate(JSON.stringify(output.doc), {
    isLinkedIn:ctx.isLinkedIn,inputText:ctx.gateInputText,researchText:ctx.researchText,researchNumbersCap:ctx.researchNumbersCap,testimonySource:ctx.testimonySource,
    // Mesure seule (correction coupée, aucun appel IA) : sans la fiche ni les
    // accroches précédentes, recopie de fiche et échos d'accroche comptaient 0.
    brandGuardText:ctx.brandGuardText,echo:echoContext(ctx),
    correction:{enabled:false},
  }));
  // Seul juge du récit photo/mixte (09/10/2026) : il répare si le délai couvre
  // la rédaction mesurée (write_ms), comme pour le texte ; sinon il la saute.
  const written = await clock.timed("thread_ms", finalizeCarousel(measured.content,ctx,{usage,regenerate:output.regenerate,reserveMs:matchReserveMs,timings:clock.timings,expectedRepairMs:clock.timings.write_ms}));
  let matched = await clock.timed("match_ms", _deps.matchPhotos(JSON.parse(written), {body:ctx.body,startedAt:ctx.startedAt,usage,emitStatus:ctx.emitStatus,call:_deps.callAnthropic}));
  // « Tes photos en fond » : les slides posées en ambiance (aucune photo ne
  // montrait le passage) reçoivent une photo libre de droit vérifiée, sans
  // personne ni produit (12/10/2026). L'écran la pose ; la photo d'origine reste en secours.
  if (ctx.body.carousel_type === "photo") {
    matched = await clock.timed("stock_ms", _deps.stockAmbient(matched, {body:ctx.body,startedAt:ctx.startedAt,usage,brandingContext:ctx.brandingContext,call:_deps.callAnthropic}));
    if (matched?.photo_review?.stock_ambient && matched.generation_receipt) matched.generation_receipt = {...matched.generation_receipt,duration_ms:Date.now()-ctx.startedAt};
  }
  const content = JSON.stringify(matched);
  await addOutlineUsage(ctx, usage);
  const timings = clock.done(`continuous_${ctx.body.carousel_type}`);
  await _deps.logUsage(ctx.userId,ctx.category,`carousel_${ctx.body.carousel_type}`,usage.total_tokens,usage.model,ctx.workspaceId);
  await logContentQuality(ctx.userId,`carousel_${ctx.body.carousel_type}`,measured,usage.model,ctx.workspaceId,ctx.body.subject,threadOutcome(written),
    carouselDurations(`continuous_${ctx.body.carousel_type}`,timings,{content:matched,photos:photoMatchPhotoCount(ctx.body)}));
  return new Response(JSON.stringify({content,writing_version:CAROUSEL_WRITING_VERSION,
    writer:{version:CAROUSEL_WRITER_VERSION,model:usage.model,effort:"medium"},timings}),
    {headers:{...ctx.corsHeaders,"Content-Type":"application/json"}});
}

async function handleMixCarouselRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const continuous = await continuousCarouselResponse(reqCtx);
  if (continuous) return continuous;
  const { body, currentAuthoredText, currentBrief, semanticReviewEnabled, userId, workspaceId, category, isLinkedIn, systemPrompt, gateInputText, researchText, testimonySource, brandGuardText, captionEndingRule, newsContext, previousHooks, corsHeaders, emitStatus, startedAt } = reqCtx;

  const hasNews = typeof newsContext === "string" && newsContext.trim().length > 0;
  const mixPrompt = hasNews
    ? buildMixCarouselNewsReactionPrompt(body, isLinkedIn)
    : buildMixCarouselPrompt(body, isLinkedIn);
  let content: string;
  let doGenerate: (sink: UsageSink) => Promise<string>;
  // One bounded repair shares the original sources, including selected photos.
  let doRepair: ((draft: string, defects: string, sink: UsageSink, abortTimeoutMs?: number) => Promise<string>) | undefined;
  const mixUsage: UsageSink = {};
  const clock = stageTimer(startedAt);
  const draftStream = firstDraftStream(emitStatus);
  emitStatus("writing");

  // Cible affichée à l'IA — même valeur que le plancher de retryIfTooShort plus
  // bas (carouselSlideFloor(body, 8)) : sans elle, un mix sans slide_count explicite
  // n'avait AUCUN chiffre de longueur nulle part dans le prompt.
  const mixSlideTarget = carouselLengthPrompt(body);

  if (body.photos && body.photos.length > 0 && !body.confirmed_structure) {
    const messageContent: any[] = [];

    // 1. Brief créatif EN PREMIER (avant les photos)
    const photoCtxRecap = buildPhotoContextRecap(body.photos);
    messageContent.push({
      type: "text",
      text: `BRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer TOUT le carrousel.\n\nObjectif : ${body.objective || "non précisé ; déduire une intention prudente du brief et du contexte de marque"}\n${carouselLengthPrompt(body)}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${body.slide_structure ? `\nStructure imposée : ${body.slide_structure.length} slides définies par l'utilisateur·ice.` : ""}${photoCtxRecap}\n\nVoici ${body.photos.length} photo(s) à intégrer dans le carrousel :`,
    });

    // 2. Photos (avec contexte par photo s'il existe — l'ordre = ordre d'envoi front)
    body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
      pushPhotoWithContext(messageContent, photo, idx);
    });

    // 3. Instruction finale après les photos (le rappel anti-refus vit aussi ici,
    // en dernière position avant la génération — cf. PHOTO_MISMATCH_SYSTEM_REMINDER).
    // Rappel de longueur ajouté ici aussi (audit timeouts 17/08) : en vision, la
    // cible de slides posée tout en haut du 1er bloc se dilue après plusieurs
    // photos — un carrousel écrasé à 1 slide déclenchait un retry complet ~1
    // run/2 en photo (même symptôme probable ici, jamais mesuré côté mix).
    messageContent.push({
      type: "text",
      text: `Analyse ces ${body.photos.length} photo(s) et crée un carrousel mixte qui respecte le brief créatif ci-dessus. Le concept "${body.subject || ""}" doit être la colonne vertébrale de chaque slide.\n\n${mixSlideTarget}\n\nRappel : tu GÉNÈRES avec ces photos (en écarter une individuellement est permis). Le refus photo_mismatch est réservé à une contradiction frontale entre les photos et une chose concrète que le sujet tapé promet de montrer — jamais à un décalage d'esthétique ou d'univers de marque.`,
    });

    doGenerate = (sink: UsageSink) => _deps.callCarouselWriter({
      ...draftStream(),
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + mixPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: messageContent }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
    doRepair = (draft, defects, sink, abortTimeoutMs = 120_000) => _deps.callCarouselWriter({
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + mixPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: [...messageContent, {type:"text",text:"BROUILLON À COMPLÉTER :\n"+draft+"\n"+defects}] }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs,
    }, sink);
  } else {
    const photoDescLine = body.text_first
      ? ""
      : `\nDescription des photos : "${body.photo_description || "non fournie"}"`;
    const textPrompt = mixPrompt + buildPhotoContextRecap(body.photo_contexts || body.photos) + `\n\nBRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer tout le carrousel.\n${photoDescLine}\n${carouselLengthPrompt(body)}\nObjectif : ${body.objective || "non précisé ; déduire une intention prudente du brief et du contexte de marque"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${body.slide_structure ? `\nStructure imposée : ${body.slide_structure.length} slides définies par l'utilisateur·ice.` : ""}`;

    doGenerate = (sink: UsageSink) => _deps.callCarouselWriter({
      ...draftStream(),
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
    doRepair = (draft, defects, sink, abortTimeoutMs = 120_000) => _deps.callCarouselWriter({
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt + "\n\nBROUILLON À COMPLÉTER :\n" + draft + "\n\n" + defects }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs,
    }, sink);
  }

  // DISPOSITION hors de la rédaction (04/10/2026) : ce que la rédaction du
  // mixte écrirait quand même en disposition est ignoré (layout.ts).
  ({ write: doGenerate, repair: doRepair } = withoutMixWriterLayout(doGenerate, doRepair));
  content = await clock.timed("write_ms", doGenerate(mixUsage));
  // Plancher déterministe de slides (audit carrousel photo 12/07) : le modèle
  // peut renvoyer un carrousel écrasé (1 slide vue en live ~1 run/2 en photo).
  // 0 slide = refus légitime (photo_mismatch), laissé au check ci-dessous ;
  // entre 1 et le plancher → UN retry, puis on livre ce qu'on a (gates ensuite).
  content = await clock.timed("write_ms", retryIfTooShort(content, doGenerate, mixUsage, carouselSlideFloor(body, 8), "mix"));

  {
    const mismatch = carouselMismatchResponse(content, body, mixUsage, "mix", corsHeaders);
    if (mismatch) return mismatch;
  }
  const threadMix = await clock.timed("structure_ms", repairCarouselStructure(content, { body, label: "mix", inspect: (v) => { const p = tryParseAiJson(v); return [...carouselStructureIssues(p, body), ...longMixSlideIssues(p, body)]; }, emitStatus, usage: mixUsage, regenerate: doRepair, startedAt }));
  content = threadMix.content;

  const editorialBaseline = content;
  // Contextual review includes photo overlays and every visible text field.
  try {
    if (semanticReviewEnabled || carouselNeedsPolish(content) || currentAuthoredText.trim()) {
      emitStatus("correcting");
      const corrected = await clock.timed("review_ms", applyGuardedCarouselCorrection(content, {
        inputText: gateInputText, researchText, testimonySource, brandGuardText, echo: echoContext(reqCtx),
        correction: { currentBrief, semanticReview: semanticReviewEnabled,
          enabled: reviewAllowed(startedAt),
          skipIfShorterThan: 300,
          logger: (msg) => console.log(msg),
          model: pickCorrectionModel(body),
            authoredText: currentAuthoredText,
          abortTimeoutMs: CORRECTION_ABORT_MS,
        },
      }));
      if (corrected && corrected !== content) {
        content = corrected;
      }
    } else {
      console.log("[correction-pass:carousel-json] SKIPPED (scan déterministe propre, mix)");
    }
  } catch (correctionError) {
    console.error("Correction pass failed in carousel-ai (mix):", correctionError);
  }

  if (body.text_first) {
    content = enforceTextFirstDirectives(content);
  } else {
    // Restaure l'intention de la structure confirmée (photo_index/slide_type)
    // AVANT le filet séquentiel — le modèle les omet en sortie (audit 12/07).
    content = mergeConfirmedStructure(content, body.confirmed_structure?.length ? body.confirmed_structure : body.slide_structure, { automatic: body.scenario_origin === "automatic" });
    const photoCountForIndexes = body.photos?.length || body.photo_contexts?.length || maxStructurePhotoIndex(body.confirmed_structure?.length ? body.confirmed_structure : body.slide_structure);
    content = normalizePhotoIndexes(content, photoCountForIndexes);
    content = normalizeOverlayStyles(content);
    // Télémétrie composition (lot D, audit 12/07) : ratio photo < 40 % ou 3 slides
    // de même type d'affilée — mesure seule, fix éventuel après lecture des logs.
    const comp = analyzeMixComposition(content);
    if (comp && (comp.violatesRatio || comp.violatesRun)) {
      console.warn(JSON.stringify({ event: "carousel_mix_composition", ...comp }));
    }
  }
  content = capVisualSchemas(content, "carousel-ai(mix)");
  // Quality-gate rédactionnel : mesures en code + re-passe ciblée si violations
  const gateMix = await clock.timed("gate_ms", runRedacGate(content, {
    isLinkedIn,
    onStatus: emitStatus,
    inputText: gateInputText,
    researchText,
    researchNumbersCap: reqCtx.researchNumbersCap,
    testimonySource,
    echo: echoContext(reqCtx),
    brandGuardText,
    captionEnding: captionEndingRule,
    correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: reviewAllowed(startedAt), skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
  }));
  content = gateMix.content;
  content = await clock.timed("thread_ms", finalizeCarousel(content,reqCtx,{usage:mixUsage,repaired:threadMix.repaired,regenerate:doRepair,timings:clock.timings}));
  {
    // SCHÉMAS du mixte : slide « pause » dessinée par le code (layout.ts).
    const withSchemas = await clock.timed("schemas_ms", placeMixSchemas(content, { usage: mixUsage, startedAt }));
    content = withSchemas.content;
    logSchemaFormatting("mix", withSchemas.plan);
  }
  await addOutlineUsage(reqCtx, mixUsage);
  const timings = clock.done("mix");
  await _deps.logUsage(userId, category, "carousel_mix", mixUsage.total_tokens, mixUsage.model, workspaceId);
  await logContentQuality(userId, "carousel_mix", gateMix, mixUsage.model, workspaceId, body.subject, threadOutcome(content),
    carouselDurations("mix", timings, { content, photos: photoMatchPhotoCount(body) }));
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION,
    writer: { version: CAROUSEL_WRITER_VERSION, model: mixUsage.model, effort: "medium" }, timings,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Photo carousel mode ──
/** « Photos brutes » : slides photo pleine page sans aucun texte (même liste blanche que l'app, src/lib/pure-photo-slides.ts). */
export function emptySlidesText(content: string): string {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return content;
  let parsed: any;
  try { parsed = JSON.parse(m[0]); } catch { return content; }
  const doc = parsed?.carousel?.slides ? parsed.carousel : parsed;
  if (!Array.isArray(doc?.slides)) return content;
  doc.slides = doc.slides.map((s: any, i: number) => ({
    slide_number: i + 1, role: s?.role || "body", slide_type: "photo_full",
    overlay_text: null, title: "", body: "", photo_index: s?.photo_index ?? i + 1,
  }));
  doc.no_overlay = true;
  return content.replace(m[0], JSON.stringify(parsed, null, 2));
}

async function handlePhotoCarouselRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const continuous = await continuousCarouselResponse(reqCtx);
  if (continuous) return continuous;
  const { body, currentAuthoredText, currentBrief, semanticReviewEnabled, userId, workspaceId, category, isLinkedIn, systemPrompt, gateInputText, researchText, testimonySource, brandGuardText, captionEndingRule, newsContext, previousHooks, corsHeaders, emitStatus, startedAt } = reqCtx;

  const hasNews = typeof newsContext === "string" && newsContext.trim().length > 0;
  const photoPrompt = hasNews
    ? buildPhotoCarouselNewsReactionPrompt(body, isLinkedIn)
    : buildPhotoCarouselPrompt(body, isLinkedIn);
  let content: string;
  let doGenerate: (sink: UsageSink) => Promise<string>;
  // Shares the same source-preserving repair and deadline as mixed carousels.
  let doRepair: ((draft: string, defects: string, sink: UsageSink, abortTimeoutMs?: number) => Promise<string>) | undefined;
  const photoUsage: UsageSink = {};
  const clock = stageTimer(startedAt);
  const draftStream = firstDraftStream(emitStatus);
  emitStatus("writing");

  // Cible affichée à l'IA, réutilisée dans le rappel de fin de message (recency,
  // audit timeouts 17/08) — même valeur que la clause "Nombre de slides cible"
  // du 1er bloc ci-dessous.
  const photoSlideTarget = carouselLengthPrompt(body);

  if (body.photos && body.photos.length > 0 && !body.confirmed_structure) {
    // Vision mode: send photos to Claude
    const messageContent: any[] = [];
    const photoCtxRecap = buildPhotoContextRecap(body.photos);

    // 1. Brief + recap contexte AVANT les photos
    messageContent.push({
      type: "text",
      text: `Voici ${body.photos.length} photo(s) pour un carrousel photo ${isLinkedIn ? "LinkedIn" : "Instagram"}.\n\nSujet : "${body.subject || "non précisé"}"\nObjectif : ${body.objective || "non précisé ; déduire une intention prudente du brief et du contexte de marque"}\n${carouselLengthPrompt(body)}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${photoCtxRecap}`,
    });

    // 2. Photos (avec contexte par photo s'il existe — l'ordre = ordre d'envoi front)
    body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
      pushPhotoWithContext(messageContent, photo, idx);
    });

    // 3. Instruction finale après les photos (le rappel anti-refus vit aussi ici,
    // en dernière position avant la génération — cf. PHOTO_MISMATCH_SYSTEM_REMINDER).
    // Rappel de longueur ajouté ici aussi (audit timeouts 17/08) : la cible posée
    // tout en haut du 1er bloc se dilue après plusieurs photos — carrousel écrasé
    // à 1 slide sur 6 demandées, vu en live ~1 run/2, qui déclenchait un retry
    // complet (2e appel vision de plein tarif) plutôt qu'une exception rare.
    messageContent.push({
      type: "text",
      text: `Construis un propos étayé à partir du brief et de la marque, puis écris ses paragraphes successifs. Les photos accompagnent ce texte ; ne les décris pas l’une après l’autre.\n\n${photoSlideTarget}\n\nRappel : tu GÉNÈRES avec ces photos. Le refus photo_mismatch est réservé à une contradiction frontale entre les photos et une chose concrète que le sujet tapé promet de montrer — jamais à un décalage d'esthétique ou d'univers de marque.`,
    });

    doGenerate = (sink: UsageSink) => _deps.callCarouselWriter({
      ...draftStream(),
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + photoPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: messageContent }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
    doRepair = (draft, defects, sink, abortTimeoutMs = 120_000) => _deps.callCarouselWriter({
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + photoPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: [...messageContent, {type:"text",text:"BROUILLON À COMPLÉTER :\n"+draft+"\n"+defects}] }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs,
    }, sink);
  } else {
    // Text-only mode: description without actual photos
    const textPrompt = photoPrompt + buildPhotoContextRecap(body.photo_contexts || body.photos) + `\n\nSujet : "${body.subject || "non précisé"}"\nDescription des photos : "${body.photo_description || "non fournie"}"\n${carouselLengthPrompt(body)}\nObjectif : ${body.objective || "non précisé ; déduire une intention prudente du brief et du contexte de marque"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}`;

    doGenerate = (sink: UsageSink) => _deps.callCarouselWriter({
      ...draftStream(),
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
    doRepair = (draft, defects, sink, abortTimeoutMs = 120_000) => _deps.callCarouselWriter({
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt + "\n\nBROUILLON À COMPLÉTER :\n" + draft + "\n\n" + defects }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs,
    }, sink);
  }

  content = await clock.timed("write_ms", doGenerate(photoUsage));
  // Plancher déterministe de slides (audit carrousel photo 12/07) : 1 slide
  // livrée sur 6 demandées vue en live ~1 run/2. 0 slide = refus légitime
  // (photo_mismatch), laissé au check ci-dessous.
  // « Photos brutes » (09/10/2026) : l'app efface le texte des slides et ne
  // garde que la légende. Le texte est écrit (la légende naît du même appel),
  // puis vidé tout de suite : relecture et chasse aux tics ne portent plus que
  // sur la légende, et ce qui ne sert qu'aux slides (2e essai si trop court,
  // structure, gabarits, juge du fil, couverture) est sauté.
  const photosOnly = body.photos_only === true;
  if (!photosOnly) content = await clock.timed("write_ms", retryIfTooShort(content, doGenerate, photoUsage, carouselSlideFloor(body, 6), "photo"));

  {
    const mismatch = carouselMismatchResponse(content, body, photoUsage, "photo", corsHeaders);
    if (mismatch) return mismatch;
  }
  const threadPhoto = photosOnly
    ? { content: emptySlidesText(content), repaired: false }
    : await clock.timed("structure_ms", repairCarouselStructure(content, { body, label: "photo", emitStatus, usage: photoUsage, regenerate: doRepair, startedAt }));
  // Mise en page hors de l'écriture : gabarit, chiffre, liste, étape et
  // attribution sont posés ensuite, à partir du texte FINAL (assignPhotoTemplates,
  // après la relecture et le redac-gate, plus bas).
  content = withoutPhotoWriterLayout(threadPhoto.content);
  const editorialBaseline = content;
  // Short photo overlays need the same contextual review as text slides.
  try {
    if (semanticReviewEnabled || carouselNeedsPolish(content) || currentAuthoredText.trim()) {
      emitStatus("correcting");
      const corrected = await clock.timed("review_ms", applyGuardedCarouselCorrection(content, {
        inputText: gateInputText, researchText, testimonySource, brandGuardText, echo: echoContext(reqCtx),
        correction: { currentBrief, semanticReview: semanticReviewEnabled,
          enabled: reviewAllowed(startedAt),
          skipIfShorterThan: 300,
          logger: (msg) => console.log(msg),
          model: pickCorrectionModel(body),
            authoredText: currentAuthoredText,
          abortTimeoutMs: CORRECTION_ABORT_MS,
        },
      }));
      if (corrected && corrected !== content) {
        content = corrected;
      }
    } else {
      console.log("[correction-pass:carousel-json] SKIPPED (scan déterministe propre, photo)");
    }
  } catch (correctionError) {
    console.error("Correction pass failed in carousel-ai (photo):", correctionError);
  }

  // Restaure l'intention de la structure confirmée (photo_index/slide_type)
  // AVANT le filet séquentiel — le modèle les omet en sortie (audit 12/07 :
  // null 13/13 malgré la consigne). En photo pur, une slide sans slide_type
  // EST une slide photo (le renderer front fait déjà cette hypothèse).
  content = mergeConfirmedStructure(content, body.confirmed_structure?.length ? body.confirmed_structure : body.slide_structure, { automatic: body.scenario_origin === "automatic" });
  {
    const photoCountForIndexes = body.photos?.length || body.photo_contexts?.length || maxStructurePhotoIndex(body.confirmed_structure?.length ? body.confirmed_structure : body.slide_structure);
    content = normalizePhotoIndexes(content, photoCountForIndexes, { assumePhotoWhenTypeMissing: true });
  }
  // Un overlay long en style « minimal »/« technique » rend un pavé (lot E).
  content = normalizeOverlayStyles(content);
  content = capVisualSchemas(content, "carousel-ai(photo)");
  const gatePhoto = await clock.timed("gate_ms", runRedacGate(content, {
    isLinkedIn,
    onStatus: emitStatus,
    inputText: gateInputText,
    researchText,
    researchNumbersCap: reqCtx.researchNumbersCap,
    testimonySource,
    echo: echoContext(reqCtx),
    brandGuardText,
    captionEnding: captionEndingRule,
    correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: reviewAllowed(startedAt), skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
  }));
  // La re-passe du gate réécrit tout le JSON : rien ne doit revenir sur les slides.
  content = photosOnly ? emptySlidesText(gatePhoto.content) : gatePhoto.content;
  // Relecture-gabarits (13/07) : sur les textes DÉFINITIFS (post relecture
  // éditoriale et redac-gate), pose le gabarit visuel de chaque slide. Avant le
  // 04/10/2026 elle tournait AVANT la relecture sémantique quand celle-ci était
  // active (pour que la relecture « voie » liste/attribution) : la relecture
  // pouvait alors corriger l'overlay ou patcher big_number/points, et l'extrait
  // mis en valeur ne correspondait plus au texte final. Ces champs sont
  // désormais des extraits EXACTS du texte relu (aucune matière nouvelle à
  // relire) et la relecture ne les patche plus (carouselReviewFields).
  if (!photosOnly) content = await clock.timed("templates_ms", assignPhotoTemplates(content, {
    model: pickCorrectionModel(body),
    logger: (m) => console.log(m),
  }));
  content = await clock.timed("thread_ms", finalizeCarousel(content,reqCtx,{usage:photoUsage,repaired:threadPhoto.repaired,regenerate:doRepair,timings:clock.timings}));
  // Une réparation globale du fil (finalizeCarousel) peut réécrire les textes
  // après l'assignation : la mise en page est revérifiée contre le texte final,
  // un extrait qui n'y figure plus est retiré (reçus ré-empreints s'ils étaient
  // à jour).
  content = await revalidatePhotoLayoutContent(content, (m) => console.log(m));
  // « Photos brutes » : l'app effacera le texte des slides, la note affichée
  // juge la légende seule (sinon « 60/100 » sur un carrousel sans texte).
  if (body.photos_only === true) {
    content = rescoreCaptionOnly(content, { inputText: gateInputText, researchText, researchNumbersCap: reqCtx.researchNumbersCap, brandGuardText, echo: echoContext(reqCtx), testimonySource, authoredText: currentAuthoredText });
  }
  await addOutlineUsage(reqCtx, photoUsage);
  const timings = clock.done("photo");
  await _deps.logUsage(userId, category, "carousel_photo", photoUsage.total_tokens, photoUsage.model, workspaceId);
  await logContentQuality(userId, "carousel_photo", gatePhoto, photoUsage.model, workspaceId, body.subject, threadOutcome(content),
    carouselDurations("photo", timings, { content, photos: photoMatchPhotoCount(body) }));
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION,
    writer: { version: CAROUSEL_WRITER_VERSION, model: photoUsage.model, effort: "medium" }, timings,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleExpressFullRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const { body, isLinkedIn } = reqCtx;
  if (body.carousel_type === "mix") return handleMixCarouselRequest(reqCtx);
  if (body.carousel_type === "photo") return handlePhotoCarouselRequest(reqCtx);
  // ── Standard text carousel ──
  const userPrompt = buildExpressFullPrompt(body, isLinkedIn);
  return runGenerationAndRespond("express_full", userPrompt, reqCtx);
}

// ── Photo / mix carousel: vision-informed questions ──
async function handleDeepeningQuestionsVisionRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const { body, isLinkedIn, brandingContext, brandVocabBlock, recentBriefsContext, systemPrompt, corsHeaders } = reqCtx;
  const isMix = body.carousel_type === "mix";
  const channelLabel = isLinkedIn ? "LinkedIn" : "Instagram";
  const formatLabel = isMix
    ? `carrousel ${channelLabel} MIXTE (slides photo + slides texte alternées)`
    : `carrousel photo ${channelLabel}`;

  // Détecte si l'utilisatrice a vraiment écrit un sujet, ou si c'est juste un fallback automatique
  const rawSubject = (body.subject || "").trim();
  const isFallbackSubject = !rawSubject || rawSubject === "Carrousel basé sur les photos uploadées";
  const hasWrittenIntent = !isFallbackSubject || !!(body.photo_description && body.photo_description.trim().length > 0);

  // A photo-only discovery needs no invented objective or new questionnaire.
  // Explicit subjects/angles still reach the factual clarification pass.
  if (!hasWrittenIntent && !body.objective && !body.editorial_angle) {
    return new Response(JSON.stringify({ content: JSON.stringify({ questions: [] }), writing_version: CAROUSEL_WRITING_VERSION }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const messageContent: any[] = [];
  body.photos.slice(0, 10).forEach((photo: any, idx: number) => {
    pushPhotoWithContext(messageContent, photo, idx);
  });
  const photoCtxRecap = buildPhotoContextRecap(body.photos);

  messageContent.push({
    type: "text",
    text: `Prépare les éventuelles précisions pour un ${formatLabel}.
Sujet : ${hasWrittenIntent ? rawSubject : "aucun sujet explicite ; photos sélectionnées"}
Description : ${body.photo_description || ""}
Objectif : ${body.objective || "non précisé"}
Réponses déjà fournies : ${JSON.stringify(body.deepening_answers || {})}
${photoCtxRecap}
CONTEXTE DE MARQUE : ${brandingContext}
${recentBriefsContext || ""}
${PHOTO_NARRATIVE_CONTRACT}
${PHOTO_QUESTIONS_CONTRACT}
Réponds en JSON : {"questions":[{"question":"...","placeholder":"..."}]}. Tableau vide si aucune précision essentielle.`,
  });

  const deepeningUsage: UsageSink = {};
  const content = await _deps.callAnthropic({
    model: getModelForAction("questions"),
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
    max_tokens: 4096,
    // Questions ancrées sur photos : borne chaque tentative à 60s pour
    // éviter le blocage indéfini d'un fetch qui traîne.
    abortTimeoutMs: 60000,
    tool: PHOTO_QUESTIONS_TOOL,
  }, deepeningUsage);

  // PAS de logUsage — les questions d'approfondissement sont gratuites
  // (arbitrage 10/07/2026 : un carrousel débite 2 crédits, rédaction +
  // visuel ; aligné sur creative-flow où le step "questions" est gratuit).
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleDeepeningQuestionsRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const { body, brandingContext, isLinkedIn, recentBriefsContext, brandVocabBlock } = reqCtx;

  // ── Photo / mix carousel: vision-informed questions ──
  if ((body.carousel_type === "photo" || body.carousel_type === "mix") && body.photos && body.photos.length > 0) {
    return handleDeepeningQuestionsVisionRequest(reqCtx);
  }

  // The same optional-question contract applies when images are unavailable.
  const isPhotoNarrative = body.carousel_type === "photo" || body.carousel_type === "mix";
  const userPrompt = isPhotoNarrative
    ? `Prépare les éventuelles précisions pour un carrousel ${body.carousel_type}.
Sujet : ${body.subject || "aucun sujet explicite"}
Objectif : ${body.objective || "non précisé"}
Description des photos : ${body.photo_description || "non fournie"}
Réponses déjà fournies : ${JSON.stringify(body.deepening_answers || {})}
Angle proposé : ${body.editorial_angle || "non précisé"}
Structure proposée : ${body.content_structure || "non précisée"}
CONTEXTE DE MARQUE : ${brandingContext}
${brandVocabBlock || ""}
${recentBriefsContext || ""}
${PHOTO_NARRATIVE_CONTRACT}
${PHOTO_QUESTIONS_CONTRACT}
Réponds en JSON : {"questions":[{"question":"...","placeholder":"..."}]}. Tableau vide si aucune précision essentielle.`
    : buildDeepeningQuestionsPrompt(body, brandingContext, isLinkedIn, recentBriefsContext, brandVocabBlock);

  return runGenerationAndRespond("deepening_questions", userPrompt, reqCtx);
}