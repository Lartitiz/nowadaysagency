import { newsWriting } from "./variant-writing.ts";
import { authoredContentSource, currentContentContract, testimonySourceText } from "../_shared/editorial-voice.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildBrandGuardText } from "../_shared/user-context.ts";
import { isQaTestAccount, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { getModelForAction, AnthropicError } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { photoReadingContract } from "./writing-contract.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError, clampAiField } from "../_shared/input-validators.ts";
import { parseAudienceAddress } from "../_shared/audience-address.ts";
import { type CaptionEndingRule } from "../_shared/redac-gate.ts";
import { fetchPreviousHooks } from "../_shared/previous-hooks.ts";
import { recentPassagesPrompt } from "../_shared/recent-passages.ts";
// Mise en forme (schémas, disposition, gabarits) : étape isolée dans layout.ts (lot 8).
import { assignTemplatesToProvidedSlides } from "./layout.ts";
import { runWithHeartbeatSSE, type StatusEmitter } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { buildDepthBlock, splitDepthMaterial, type ResearchLink } from "../_shared/depth-research.ts";
import { livedCaseFromCarouselBody, researchNumbersCapFor } from "../_shared/lived-case.ts";
import { buildSeriesContext } from "../_shared/series-context.ts";
import { _deps, type CarouselRequestContext, buildPhotoContextRecap, normalizeGeneratedPlanFields, normalizeSlideType, pickCorrectionModel } from "./shared.ts";
import { buildSystemPrompt, buildExpressFullPrompt } from "./prompts.ts";
import { startPhotoOutline } from "./outline.ts";
import { handleStructureProposalRequest } from "./steps/structure.ts";
import { handleHooksRequest, handleSlidesRequest, handleSuggestTopicsRequest, handleSuggestAnglesRequest } from "./modes/text.ts";
import { handleDeepeningQuestionsRequest } from "./steps/questions.ts";
import { runGenerationAndRespond } from "./steps/generate.ts";
import { handleMixCarouselRequest } from "./modes/mix.ts";
import { handlePhotoCarouselRequest } from "./modes/photo.ts";
export { emptySlidesText } from "./modes/photo.ts";

// Fiche 2 (docs/robustesse/gros-fichiers.md) : déplacés à l'identique, réexportés pour les tests.
export { _deps, writerTimeoutMs, normalizeSlideType } from "./shared.ts";
export { plannedTitles } from "./outline.ts";
export { enforceCarouselAudienceAddress } from "./steps/finalize.ts";
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
    let researchLinks: ResearchLink[] = [];
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
      // Liens des pages trouvées : pour le juge et les pistes de relecture (16/10/2026).
      if (depthBlock) researchLinks = splitDepthMaterial(material).links;
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
      researchLinks,
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

async function handleExpressFullRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const { body, isLinkedIn } = reqCtx;
  if (body.carousel_type === "mix") return handleMixCarouselRequest(reqCtx);
  if (body.carousel_type === "photo") return handlePhotoCarouselRequest(reqCtx);
  // ── Standard text carousel ──
  const userPrompt = buildExpressFullPrompt(body, isLinkedIn);
  return runGenerationAndRespond("express_full", userPrompt, reqCtx);
}