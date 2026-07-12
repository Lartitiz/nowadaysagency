import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CORE_PRINCIPLES, FRAMEWORK_SELECTION, FORMAT_STRUCTURES, WRITING_RESOURCES, ANTI_SLOP, CHAIN_OF_THOUGHT, ANTI_BIAS, PREGEN_INJECTION_RULES, EDITORIAL_ANGLES_REFERENCE, VISUAL_ANALOGIES, LINKEDIN_TEMPLATES, EMBEDDED_EDUCATION } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildProfileBlock, buildPreGenFallback } from "../_shared/user-context.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction, AnthropicError, forcesDisabledThinking, type UsageSink } from "../_shared/anthropic.ts";
import { streamAnthropicSSE, streamAnthropicToolSSE, createClientSSEStream, runWithHeartbeatSSE, type StatusEmitter } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { carouselBrief, reelBrief, storiesBrief, linkedinBrief, pinterestBrief, newsletterBrief, photoCaptionBrief, captionBrief } from "../_shared/format-briefs.ts";
import { buildVisionQuestionsPrompt, buildVisionGenerateBrief } from "../_shared/vision-prompts.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { buildSeriesContext } from "../_shared/series-context.ts";
import { applyCorrectionPass, applyCorrectionPassReel } from "../_shared/correction-pass.ts";
import { analyzeTextRedac, buildTextFixInstructions, numbersIn } from "../_shared/redac-gate.ts";
import {
  countReelSpokenWords,
  enforceReelNoFaceCam,
  enforceSelectedReelHook,
  rebuildReelLectureTest,
  recalibrateReelTimings,
  reelAuditableText,
  reelTemplateLeaks,
} from "../_shared/reel-postprocess.ts";
import { stripMarkdownFromNewsletter } from "../_shared/strip-markdown.ts";

// buildBrandingContext replaced by shared getUserContext + formatContextForAI

// ── Sortie structurée pour les steps `questions` / `follow-up` ──
// Le tool forcé (tool_choice) fait garantir le JSON par l'API elle-même :
// fini les 502 « réponse IA illisible » quand Haiku glisse un guillemet non
// échappé ou un saut de ligne brut dans du JSON texte (vu 2× de suite le
// 05/07 sur le parcours story). Les prompts restent inchangés — c'est la
// couche de transport qui devient déterministe, pas une règle de plus.
const QUESTIONS_TOOL = {
  name: "poser_questions",
  description: "Retourne les 3 questions de brief à poser à l'utilisatrice.",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            placeholder: { type: "string" },
          },
          required: ["question", "placeholder"],
        },
      },
    },
    required: ["questions"],
  },
};

// Lot 7 reels : 3 hooks d'ouverture proposés AVANT la génération complète.
// Le schéma reprend la forme exacte de `selected_hook` attendue par reelBrief
// (format-briefs.ts) : le choix de l'utilisatrice repart tel quel au step generate.
const HOOKS_TOOL = {
  name: "proposer_hooks",
  description: "Retourne 3 hooks d'ouverture de reel, de types différents.",
  input_schema: {
    type: "object",
    properties: {
      hooks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", description: "vecu_perso | contre_intuition | objection_retournee | question_choc | fait_brut | scene_coupee" },
            type_label: { type: "string", description: "label court lisible du type, ex. « Vécu perso »" },
            text: { type: "string", description: "le hook PARLÉ, 8-20 mots, 1-2 phrases, tension immédiate" },
            text_overlay: { type: "string", description: "overlay écran muet, 3-8 mots MAJUSCULES, autoporteur sans le son, ne répète pas le parlé mot pour mot" },
            format_recommande: { type: "string", description: "face_cam_confession | voix_off_broll | hook_loop" },
            format_label: { type: "string", description: "label lisible de la structure, ex. « Voix off + B-roll »" },
            duree_cible: { type: "string", description: "durée estimée du reel avec ce hook, ex. « ~30 sec »" },
          },
          required: ["type", "type_label", "text", "text_overlay", "format_recommande", "format_label", "duree_cible"],
        },
      },
    },
    required: ["hooks"],
  },
};

const FOLLOW_UP_TOOL = {
  name: "poser_questions_suivi",
  description: "Retourne 1 à 2 questions d'approfondissement.",
  input_schema: {
    type: "object",
    properties: {
      follow_up_questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            placeholder: { type: "string" },
            why: { type: "string" },
          },
          required: ["question", "placeholder"],
        },
      },
    },
    required: ["follow_up_questions"],
  },
};

// ── Sortie structurée pour le POST (Instagram) et le Pinterest en streaming ──
// Même remède que les questions : le tool forcé fait garantir le JSON par l'API.
// Le post streamait en TEXTE LIBRE avec un prompt « Réponds UNIQUEMENT en JSON »
// (forme identique au schéma ci-dessous) — Sonnet (thinking off) cassait ce JSON
// par intermittence (saut de ligne ET guillemet droit non échappé dans `content`)
// → le blob ```json fuyait au rendu (filets front #511/#524). En passant par le
// tool, le JSON assemblé côté Anthropic est valide par construction. Le schéma
// REPREND À L'IDENTIQUE la forme demandée dans le prompt (cf. bloc « Réponds
// UNIQUEMENT en JSON » du step generate) — le prompt reste inchangé, seule la
// couche de transport devient déterministe.
const POST_TOOL = {
  name: "rediger_post",
  description: "Retourne le post rédigé (contenu prêt à poster) au format structuré.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string", description: "Le contenu complet, prêt à poster." },
      accroche: { type: "string", description: "La première phrase / accroche." },
      format: { type: "string" },
      pillar: { type: "string" },
      objectif: { type: "string" },
      personal_tip: {
        type: ["string", "null"],
        description: "Conseil d'incarnation SEULEMENT si demandé plus haut, sinon null.",
      },
    },
    required: ["content", "accroche"],
  },
};

/**
 * Detect the actual media_type of an image payload so we never claim
 * image/jpeg when the bytes are image/png (Anthropic returns a 400 otherwise).
 *  1) If a data URL prefix is present, trust it (strip it from the data).
 *  2) Otherwise, sniff base64 magic bytes (PNG / JPEG / WEBP / GIF).
 *  3) Fall back to the caller-provided mime, then image/jpeg.
 */
function extractImagePayload(input: string, fallbackMime?: string): { media_type: string; data: string } {
  const m = input.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (m) return { media_type: m[1].toLowerCase(), data: m[2] };
  const head = input.slice(0, 16);
  let sniffed: string | undefined;
  if (head.startsWith("iVBORw0KGgo")) sniffed = "image/png";
  else if (head.startsWith("/9j/")) sniffed = "image/jpeg";
  else if (head.startsWith("UklGR")) sniffed = "image/webp";
  else if (head.startsWith("R0lGOD")) sniffed = "image/gif";
  return { media_type: sniffed || fallbackMime || "image/jpeg", data: input };
}

/**
 * System prompt du RECYCLAGE, paramétré par format(s). Le pipeline parallèle
 * l'appelle avec UN format à la fois (un appel Sonnet par format) — le schéma
 * JSON de sortie ne contient alors que ce format, et la garantie
 * anti-chevauchement est portée par le PLAN (angles imposés dans le user
 * prompt), plus par une consigne d'auto-arbitrage.
 */
function buildRecycleSystemPrompt(
  fmtIds: string[],
  formatLabels: Record<string, string>,
  commonPrefix: string,
  objectiveBlock: string,
  activity: string,
  target: string,
  piliers: string,
): string {
  const requestedFormats = fmtIds.map((f) => formatLabels[f] || f);
  return `${commonPrefix}

${ANTI_BIAS}

${CHAIN_OF_THOUGHT}

${FORMAT_STRUCTURES}

${WRITING_RESOURCES}
${objectiveBlock}
═══════════════════════════════════════════════════
MISSION : RECYCLAGE DE CONTENU
═══════════════════════════════════════════════════

Tu vas recycler un contenu existant en ${requestedFormats.length} format(s) : ${requestedFormats.join(", ")}.

Ce n'est pas du reformatage (dire la même chose en plus court). C'est de la dérivation (explorer une facette différente du même sujet).

Matrice d'angles par format :
- Carrousel : prend l'idée la plus PÉDAGOGIQUE. Développe-la en profondeur. Structure en progression logique (constat > bascule > solution > application).
- Reel : prend l'idée la plus PROVOCANTE ou CONTRE-INTUITIVE. Hook en 3 secondes. Oral, direct, une seule idée martelée.
- Stories : prend l'angle le plus INTIME ou PERSONNEL. Comme un message vocal à une amie. Confidences, coulisses, réactions spontanées.
- LinkedIn : prend l'angle le plus ENGAGÉ. Prise de position, conviction, question de fond. Ton direct et pro-amical. Dense (1300-2000 car.), pas de remplissage.
- Newsletter : prend l'angle le plus PROFOND. C'est le format qui a le plus de place : développe une réflexion complète avec nuances, apartés, exemples concrets.

RÉDACTION : pour chaque format, rédige un contenu COMPLET et PRÊT À POSTER. Pas un brouillon.

${activity ? `L'utilisatrice est : ${activity}.` : ""}
${target ? `Sa cible : ${target}. Adapte le vocabulaire et les exemples à cette audience.` : ""}
${piliers ? `Ses piliers de contenu : ${piliers}. Le recyclage doit rester cohérent avec ces piliers.` : ""}

LONGUEURS OBLIGATOIRES :
- Carrousel : 8 slides détaillées (slide 1 = hook, slides 2-7 = développement, slide 8 = punchline + CTA). Chaque slide = 2-4 phrases. Pas de slides d'1 mot.
- Reel : script complet avec timecodes (0-3s hook, 3-15s contexte, 15-45s coeur, 45-60s CTA). Indique les cuts et le texte à l'écran.
- Stories : séquence de 5-7 stories. Chaque story = ce qui est affiché (texte, sticker, sondage) + indication visuelle. Story 4 = interaction obligatoire.
- LinkedIn : 1300-2000 caractères. Prose fluide, pas de listes à puces. Accroche dans les 210 premiers caractères. 0-2 hashtags en fin.
- Instagram (Carrousel, Reel, Stories) : 3 hashtags maximum en fin de légende. Jamais plus, même si la légende est longue. Choisis-les ciblés (pas de #love #life génériques).
- Newsletter : 1500-3000 caractères. Objet d'email accrocheur. Structure : hook personnel > développement > leçon > CTA.

RÈGLE DE PROFONDEUR :
Tu ne raccourcis JAMAIS une idée pour "faire court" ou "tout faire rentrer".
Un carrousel de 8 slides qui va au bout d'UNE idée > un carrousel de 8 slides qui survole 3 idées.
Un reel de 45 secondes sur UN point percutant > un reel de 60 secondes qui liste des conseils.

RÈGLE DE VOIX :
Chaque format doit sonner comme si l'utilisatrice l'avait écrit elle-même. Si elle utilise "en vrai", "le truc c'est que", "franchement" dans le contenu source, RÉUTILISE ces expressions. L'IA structure et amplifie, elle ne réécrit pas.

SELF-CHECK FINAL (fais-le en interne avant de répondre) :
- Si un ANGLE t'est imposé dans le message : est-ce que tu l'as vraiment suivi, sans déborder sur les angles des autres formats ?
- Est-ce que les accroches sont assez fortes pour stopper le scroll ?
- Est-ce que le contenu passe le test du café (lisible à voix haute sans sonner robot) ?
- Est-ce que j'ai utilisé des expressions de la source ou est-ce que j'ai tout réécrit en mode IA ?
- Est-ce que les longueurs sont respectées ?

Réponds UNIQUEMENT en JSON valide :
{
  "results": {
    ${fmtIds.map((f: string) => f === "carrousel"
      ? `"carrousel": {
      "slides": [
        { "slide_number": 1, "title": "hook court", "body": "2-4 phrases" },
        { "slide_number": 2, "title": "...", "body": "..." },
        { "slide_number": 3, "title": "...", "body": "..." },
        { "slide_number": 4, "title": "...", "body": "..." },
        { "slide_number": 5, "title": "...", "body": "..." },
        { "slide_number": 6, "title": "...", "body": "..." },
        { "slide_number": 7, "title": "...", "body": "..." },
        { "slide_number": 8, "title": "punchline + CTA", "body": "2-4 phrases" }
      ],
      "caption": { "hook": "1-2 phrases d'accroche", "body": "développement de la légende", "cta": "appel à l'action final" }
    }`
      : `"${f}": "contenu complet ici"`).join(",\n    ")}
  },
  "topics": {
    ${fmtIds.map((f: string) => `"${f}": "le sujet réel de ce contenu en 5-10 mots (pas 'recyclage', le VRAI sujet traité)"`).join(",\n    ")}
  }
}
${fmtIds.includes("carrousel") ? `\nIMPORTANT pour le carrousel : tu DOIS renvoyer un OBJET structuré avec exactement 8 slides (slide_number 1 à 8, chaque slide a title + body de 2-4 phrases) et une caption {hook, body, cta}. Pas une string. Pas moins de 8 slides. Les règles de longueur et d'arc narratif (slide 1 = hook, 2-7 = développement, 8 = punchline + CTA) s'appliquent au champ body de chaque slide.` : ""}`;
}

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

    validateInput(body, z.object({
      step: z.string().max(50),
      contentType: z.string().max(100).optional().nullable(),
      context: z.string().max(8000).optional().nullable(),
      adjustment: z.string().max(2000).optional().nullable(),
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

    // Reusable newsjacking block — injected into prompts when present.
    // Kept separate from `context` to avoid blowing the 8000-char cap on subjects.
    const newsContextBlock = (typeof newsContext === "string" && newsContext.trim().length > 0)
      ? `\n\n══════════════════════════════════════\nCONTEXTE ACTUALITÉ (NEWSJACKING)\n══════════════════════════════════════\n${newsContext.trim()}\n\nCONSIGNE NEWSJACKING : ce contenu rebondit sur cette actualité. Le HOOK / ACCROCHE doit partir de l'actualité elle-même (c'est elle qui capte l'attention car elle est dans l'air du temps). Ensuite seulement, fais le pont vers l'expertise, le vécu ou le positionnement de l'utilisatrice. L'actu n'est pas un prétexte en arrière-plan : c'est le point d'entrée visible du contenu.\n`
      : "";

    // Determine channel from contentType for persona selection
    const channelFromType = contentType?.includes("linkedin") ? "linkedin" : contentType?.includes("instagram") || contentType?.includes("carousel") || contentType?.includes("reel") || contentType?.includes("stories") ? "instagram" : undefined;

    const profileBlock = profile ? buildProfileBlock(profile) : "";
    const ctx = await getUserContext(supabase, userId, workspace_id, channelFromType);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);

    // Recent briefs context — fetched server-side as fallback if not provided.
    // Used by `questions` step to avoid repeating angles already covered.
    let recentBriefsContext = recentBriefsFromBody || "";
    if (!recentBriefsContext && (step === "questions" || step === "follow-up")) {
      recentBriefsContext = await getRecentBriefsContext(supabase, userId, workspace_id, 3);
    }

    // Extract vocabulary keywords from branding (offers names, target name, key expressions)
    // → forces the AI to use the user's actual vocabulary in questions
    const brandVocab: string[] = [];
    if (ctx?.profile?.activite) brandVocab.push(`activité: ${ctx.profile.activite}`);
    if (ctx?.profile?.cible) brandVocab.push(`cible: ${ctx.profile.cible}`);
    if (ctx?.tone?.key_expressions) {
      const keyExp = typeof ctx.tone.key_expressions === "string" ? ctx.tone.key_expressions : "";
      if (keyExp) brandVocab.push(`expressions clés: ${keyExp.slice(0, 200)}`);
    }
    // ctx.tone = ligne brand_profile (dont `offer`), fallback profiles.offre — même priorité que formatContextForAI
    const offerDesc = typeof ctx?.tone?.offer === "string" && ctx.tone.offer
      ? ctx.tone.offer
      : (typeof ctx?.profile?.offre === "string" ? ctx.profile.offre : "");
    if (offerDesc) brandVocab.push(`offre: ${offerDesc.slice(0, 150)}`);
    const offerNames = (Array.isArray(ctx?.offers) ? ctx.offers : []).map((o: { name?: string }) => o?.name).filter(Boolean);
    if (offerNames.length > 0) brandVocab.push(`noms des offres: ${offerNames.slice(0, 4).join(", ")}`);
    const brandVocabBlock = brandVocab.length > 0
      ? `\n\nVOCABULAIRE MÉTIER DE L'UTILISATRICE (à RÉUTILISER dans les questions) :\n${brandVocab.map(v => `- ${v}`).join("\n")}\n\nRÈGLE : au moins 2 questions sur 3 doivent réutiliser un mot/concept de ce vocabulaire (nom de l'offre, terme de la cible, expression clé). Les questions doivent montrer que tu connais SON univers, pas un univers générique.\n`
      : "";

    // Voice profile — already fetched by getUserContext() with correct workspace owner resolution.
    // Do NOT re-fetch with userId (that would use the coach's voice instead of the client's).
    let voiceBlock = "";
    if (ctx.voice) {
      const v = ctx.voice;
      const vl: string[] = ["PROFIL DE VOIX DE L'UTILISATRICE :"];
      if (v.structure_patterns?.length) vl.push(`- Structure : ${(Array.isArray(v.structure_patterns) ? v.structure_patterns : []).join(", ")}`);
      if (v.tone_patterns?.length) vl.push(`- Ton : ${(Array.isArray(v.tone_patterns) ? v.tone_patterns : []).join(", ")}`);
      if (v.signature_expressions?.length) vl.push(`- Expressions signature à utiliser : ${(Array.isArray(v.signature_expressions) ? v.signature_expressions : []).join(", ")}`);
      if (v.banned_expressions?.length) vl.push(`- Expressions interdites (NE JAMAIS UTILISER) : ${(Array.isArray(v.banned_expressions) ? v.banned_expressions : []).join(", ")}`);
      if (v.voice_summary) vl.push(`- Style résumé : ${v.voice_summary}`);
      vl.push("UTILISE ce profil de voix pour TOUT le contenu généré.");
      vl.push("PRIORITÉ VOIX : reproduis ce style. Réutilise les expressions signature. Respecte les expressions interdites. Le résultat doit sonner comme si l'utilisatrice l'avait écrit elle-même.");
      voiceBlock = "\n" + vl.join("\n") + "\n";
    }

    // Pre-generation personal answers (with branding fallback)
    let effectivePreGen = preGenAnswers;
    if (!effectivePreGen && step === "generate") {
      effectivePreGen = buildPreGenFallback(ctx);
    }
    let preGenBlock = "";
    if (effectivePreGen) {
      const fromBranding = (effectivePreGen as any)._fromBranding;
      const sourceNote = fromBranding ? " (éléments tirés du branding, pas du coaching direct)" : "";
      const pl: string[] = [];
      if (effectivePreGen.anecdote) pl.push(`- Anecdote${sourceNote} (UTILISE ses mots exacts, garde le côté brut et authentique) : "${effectivePreGen.anecdote}"`);
      if (effectivePreGen.emotion) pl.push(`- Énergie/émotion visée${sourceNote} (guide le ton de TOUT le contenu) : ${effectivePreGen.emotion}`);
      if (effectivePreGen.conviction) pl.push(`- Conviction/phrase clé${sourceNote} (doit apparaître TEXTUELLEMENT dans le contenu, c'est SA voix) : "${effectivePreGen.conviction}"`);
      if (pl.length) {
        preGenBlock = `\nL'UTILISATRICE A PARTAGÉ CES ÉLÉMENTS PERSONNELS :\n${pl.join("\n")}\n\nINTÈGRE CES ÉLÉMENTS dans le contenu généré :\n- L'anecdote doit apparaître naturellement (en accroche ou en illustration)\n- L'émotion visée guide le ton et la structure\n- La conviction doit être présente, formulée dans le style de l'utilisatrice\n- Ne change PAS le sens de ce qu'elle a dit, juste la structure\n`;
      }
    }
    if (!effectivePreGen && step === "generate") {
      // Le conseil d'incarnation vit dans un CHAMP dédié (personal_tip), jamais
      // dans le contenu : dans content il partait tel quel dans un copier-coller
      // ou une publication (vu à l'audit rédactionnel du 10/07).
      preGenBlock = `\nL'utilisatrice n'a pas fourni d'éléments personnels.\nGénère le contenu normalement. INTERDIT d'écrire un conseil, une note de coaching ou une mention de l'IA DANS le contenu lui-même.\nRenvoie À LA PLACE, dans le champ JSON "personal_tip" prévu par le format de réponse, exactement : "💡 Ajoute une anecdote perso pour que ça sonne vraiment toi. L'IA structure, toi tu incarnes."\n`;
    }

    const fullContext = profileBlock + (brandingContext ? `\n${brandingContext}` : "") + voiceBlock;

    // Build incarnation block from user context
    const activity = ctx?.profile?.activite || profile?.activite || "";
    const target = ctx?.profile?.cible || profile?.cible || "";
    const tone = ctx?.tone?.tone_description || ctx?.tone?.voice_description || "";
    const incarnationBlock = `
Tu n'écris PAS comme une IA qui a reçu un brief.
Tu écris comme cette personne parlerait si elle avait trouvé les mots justes.

Son activité : ${activity || "(non renseignée)"}. Sa cible : ${target || "(non renseignée)"}. Son ton naturel : ${tone || "(non renseigné)"}.

Si un profil de voix est disponible, c'est TA voix pour ce contenu. Utilise SES tics de langage, SES tournures, SES expressions favorites. Le contenu doit sonner comme elle, pas comme "un post bien écrit par une IA".
`;

    // COMMON_PREFIX: identical for ALL steps → maximizes Anthropic prompt caching
    const COMMON_PREFIX = BASE_SYSTEM_RULES + "\n\n" + incarnationBlock + "\n\n" + `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :\n- Reproduis fidèlement le style décrit\n- Réutilise les expressions signature naturellement dans le texte\n- RESPECTE les expressions interdites : ne les utilise JAMAIS\n- Imite les patterns de ton et de structure\n- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA\n\n` + CORE_PRINCIPLES + "\n\n" + EMBEDDED_EDUCATION + "\n\n" + ANTI_SLOP + "\n\n" + fullContext;

    // QUESTIONS_PREFIX : version allégée pour les steps `questions` et `follow-up`.
    // On retire CORE_PRINCIPLES / EMBEDDED_EDUCATION / ANTI_SLOP / bloc voix :
    // ces règles concernent la RÉDACTION du contenu final, pas la formulation de questions.
    // On garde : règles de base, incarnation (qui elle est), branding/profil (pour personnaliser).
    // Objectif : passer de ~10 500 tokens à ~3 000-4 000 tokens d'input.
    const QUESTIONS_PREFIX = BASE_SYSTEM_RULES + "\n\n" + incarnationBlock + "\n\n" + fullContext;

    // Build calendar context block
    let calendarBlock = "";
    if (calendarContext) {
      const cl: string[] = [];
      if (calendarContext.postDate) cl.push(`- Date de publication prévue : ${calendarContext.postDate}`);
      if (calendarContext.theme) cl.push(`- Thème/sujet : "${calendarContext.theme}"`);
      if (calendarContext.notes) cl.push(`- Notes de l'utilisatrice : "${calendarContext.notes}"`);
      if (calendarContext.angleSuggestion) cl.push(`- Angle suggéré : "${calendarContext.angleSuggestion}"`);
      if (calendarContext.launchId) {
        cl.push(`\nCONTEXTE LANCEMENT :`);
        if (calendarContext.contentType) cl.push(`- Type de contenu : ${calendarContext.contentTypeEmoji || ""} ${calendarContext.contentType}`);
        if (calendarContext.category) cl.push(`- Catégorie : ${calendarContext.category}`);
        if (calendarContext.chapter) cl.push(`- Chapitre narratif : ${calendarContext.chapter}. ${calendarContext.chapterLabel || ""}`);
        if (calendarContext.audiencePhase) cl.push(`- Phase mentale de l'audience : ${calendarContext.audiencePhase}`);
        if (calendarContext.objective) cl.push(`- Objectif de ce contenu : "${calendarContext.objective}"`);
      }
      if (cl.length) calendarBlock = `\nCONTEXTE DU POST (depuis le calendrier) :\n${cl.join("\n")}\n`;
    }

    // Build objective block (from direct param or calendar context)
    const effectiveObjective = objective || calendarContext?.objective || null;
    let objectiveBlock = "";
    if (effectiveObjective) {
      const objectiveGuidance: Record<string, string> = {
        "visibilite": "OBJECTIF : VISIBILITÉ (reach, découverte)\n- Le contenu doit être PARTAGEABLE : l'audience doit vouloir l'envoyer à quelqu'un\n- Privilégie les prises de position, les accroches polarisantes, les constats qui font réagir\n- L'appel à l'action doit encourager le partage, le save, ou le tag\n- Pas de CTA commercial. Pas de mention d'offre.",
        "engagement": "OBJECTIF : ENGAGEMENT (lien, communauté)\n- Le contenu doit créer de la CONNEXION : l'audience doit se reconnaître et vouloir répondre\n- Privilégie les questions ouvertes, le storytelling personnel, les moments de vulnérabilité\n- L'appel à l'action doit inviter au commentaire, au partage d'expérience, au dialogue\n- La mention d'offre est possible en toute fin, mais secondaire.",
        "vente": "OBJECTIF : VENTE (conversion)\n- Le contenu doit créer le DÉCLIC : l'audience doit comprendre pourquoi elle a besoin d'aide maintenant\n- Privilégie les avant/après, les études de cas, les transformations concrètes, les témoignages\n- Montre le coût de l'inaction (rester seule, continuer à galérer)\n- L'appel à l'action doit mener vers l'offre : appel découverte, lien en bio, inscription\n- Le CTA est direct mais pas agressif : invitation, pas injonction.",
        "credibilite": "OBJECTIF : CRÉDIBILITÉ (autorité, expertise)\n- Le contenu doit démontrer la MAÎTRISE : l'audience doit se dire \"elle sait de quoi elle parle\"\n- Privilégie les décryptages, les analyses, les données chiffrées, les références\n- Mentionne l'expérience, les clients, les résultats concrets\n- L'appel à l'action peut inviter à approfondir (newsletter, article, échange).",
      };
      const key = Object.keys(objectiveGuidance).find(k =>
        k === effectiveObjective || k === effectiveObjective.toLowerCase()
      );
      objectiveBlock = `\n${key ? objectiveGuidance[key] : `OBJECTIF DU CONTENU : ${effectiveObjective}\nAdapte le ton, la structure et le CTA pour atteindre cet objectif.`}\n`;
    }

    let systemPrompt = "";
    let userPrompt: string | null = "";

    // ── Format detection (outer scope — used by generate + streaming) ──
    const angleFormat = angle?.format_livraison?.toLowerCase() || "";
    const formatHint = angleFormat || contentType?.toLowerCase() || "";
    const isCarousel = formatHint.includes("carrousel") || formatHint.includes("carousel");
    const isReel = formatHint.includes("reel") || formatHint.includes("script");
    const isStories = formatHint.includes("stories") || formatHint.includes("story");
    const isLinkedIn = formatHint.includes("linkedin") || contentType === "post_linkedin";
    const isPinterest = formatHint.includes("pinterest") || contentType === "post_pinterest";
    const isNewsletter = formatHint.includes("newsletter") || formatHint.includes("email") || contentType === "post_newsletter";
    const isCaption = !isCarousel && !isReel && !isStories && !isLinkedIn && !isPinterest && !isNewsletter;
    const isPhotoMode = body.photo_mode === true;

    // Catalogue de photos de la bibliothèque (stories, lot B) : rempli au moment
    // du brief, relu après le parse pour résoudre photo_index → photo_id.
    // `preferred` (lot D) = photo explicitement choisie à l'étape format.
    let storiesPhotoCatalog: { index: number; id: string; description: string; preferred?: boolean }[] = [];

    // Format labels (used by recycle, declared here for broader scope)
    const formatLabels: Record<string, string> = {
      carrousel: "Carrousel Instagram (8 slides)",
      reel: "Script Reel (30-60 sec)",
      stories: "Séquence Stories (5 stories)",
      linkedin: "Post LinkedIn",
      newsletter: "Email / Newsletter",
    };

    if (step === "angles") {
      const editorialCtx = editorialFormatLabel
        ? `\nFORMAT ÉDITORIAL CHOISI : "${editorialFormatLabel}"\nL'utilisatrice a choisi ce format parmi les 13 angles éditoriaux. Les 3 angles proposés doivent être des VARIATIONS de "${editorialFormatLabel}", pas des formats complètement différents.\nChaque angle prend un POINT D'ENTRÉE différent dans le sujet, mais tous suivent la logique de "${editorialFormatLabel}".\nExemple : si elle a choisi "Mythe à déconstruire", les 3 angles déconstruisent le même sujet mais avec 3 approches différentes (données vs vécu vs comparaison).\n`
        : "";

      systemPrompt = `${COMMON_PREFIX}

${FRAMEWORK_SELECTION}

${EDITORIAL_ANGLES_REFERENCE}
${editorialCtx}
CANAL : ${contentType}
SUJET : ${context}
${effectiveObjective ? `OBJECTIF : ${effectiveObjective}` : ""}
${calendarBlock}

Propose exactement 3 angles éditoriaux DIFFÉRENTS.

Pour chaque angle :
1. TITRE : 2-5 mots, évocateur (pas "Option 1")
2. PITCH : 2-3 phrases qui expliquent l'approche et pourquoi ça fonctionne
3. STRUCTURE : le squelette du contenu en 4-5 étapes${editorialFormatLabel ? ` (basé sur la structure de "${editorialFormatLabel}" dans les angles éditoriaux de référence)` : " (utilise les structures par format si le format est connu)"}
4. TON : l'énergie et le registre émotionnel de cet angle
5. FORMAT_LIVRAISON : le format de sortie recommandé pour cet angle (carrousel, reel, stories, caption longue, LinkedIn, newsletter)

RÈGLES :
${editorialFormatLabel ? `- Les 3 angles sont des VARIATIONS de "${editorialFormatLabel}", PAS des formats différents` : "- Les 3 angles doivent être VRAIMENT différents (pas 3 variations du même)"}
- Chaque angle est basé sur un framework narratif DIFFÉRENT, traduit en angle créatif lisible
- Un angle peut être surprenant ou inattendu
- Pense à des angles que l'utilisatrice n'aurait pas trouvés seule
${effectiveObjective ? `- Les 3 angles doivent servir l'objectif "${effectiveObjective}". Un angle "visibilité" privilégie les accroches polarisantes, un angle "vente" les preuves et témoignages.` : ""}
- Reste cohérent avec son ton & style
- Ne rédige RIEN. Pas d'exemple de phrases. Juste la direction.

Réponds UNIQUEMENT en JSON :
{
  "angles": [
    {
      "title": "...",
      "pitch": "...",
      "structure": ["étape 1", "étape 2", "étape 3", "étape 4"],
      "tone": "...",
      "format_livraison": "carrousel | reel | stories | caption | linkedin | newsletter"
    }
  ]
}`;
      userPrompt = `Propose-moi 3 angles éditoriaux pour : ${context}`;

    } else if (step === "questions") {
      const channelLabel = contentType === "linkedin" ? "LinkedIn" : contentType === "newsletter" ? "Newsletter" : "Instagram";
      const channelGuidance = contentType === "linkedin"
        ? "Questions orientées PRO : demande des situations professionnelles, des apprentissages business, des résultats concrets, des prises de position assumées."
        : contentType === "newsletter"
        ? "Questions orientées PROFONDEUR : demande des réflexions de fond, des convictions, des retours d'expérience détaillés."
        : "Questions orientées ÉMOTION : demande des moments vécus, des ressentis, des transformations personnelles, des coulisses.";

      systemPrompt = `${QUESTIONS_PREFIX}
${brandingContext ? `\nCONTEXTE BRANDING DE L'UTILISATRICE :\n${brandingContext}\n` : ""}${brandVocabBlock}

══════════════════════════════════════
SUJET COURANT — PRIORITÉ ABSOLUE
══════════════════════════════════════
"${context}"

Tout ce qui suit (angle, branding, historique) est SECONDAIRE par rapport à ce sujet.
Les 3 questions doivent toutes porter sur CE sujet précis.
Si une question pourrait concerner un autre sujet, elle est invalide.

══════════════════════════════════════
ANGLE & CANAL
══════════════════════════════════════
- Canal : ${channelLabel}
${editorialFormatLabel ? `- Format éditorial : ${editorialFormatLabel}` : ""}
- Angle : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}
${angle.format_livraison ? `- Format de livraison recommandé : ${angle.format_livraison}` : ""}
${calendarBlock}${objectiveBlock}${newsContextBlock}
${recentBriefsContext}
${newsContextBlock ? "\n⚠️ NEWSJACKING ACTIF : au moins 1 question sur 3 doit aider à faire le pont entre cette actualité et le vécu / l'opinion / l'expertise de l'utilisatrice (pas une question générique sur le sujet).\n" : ""}

══ AVANT DE POSER LES QUESTIONS — RAISONNEMENT INTERNE (ne PAS afficher) ══

Réfléchis silencieusement à :
1. Quel est le SUJET COURANT ? (ré-extraire 1 mot-clé du bloc ci-dessus)
2. Quel vocabulaire métier de l'utilisatrice puis-je intégrer naturellement ?
3. Y a-t-il un sujet identique dans l'historique récent ? Si oui, quelle question NE PAS reposer ?

Puis pose les 3 questions qui maximisent la matière personnelle apportée sur CE sujet.

Pose exactement 3 questions pour récupérer SA matière première sur le sujet courant. Ces questions doivent extraire des éléments PERSONNELS (anecdotes, opinions, observations, process, convictions) qui rendront le contenu unique.

RÈGLES :
1. ANCRAGE SUJET (règle n°1, non négociable) : chaque question DOIT contenir un mot du sujet courant ou un aspect concret directement déductible du sujet courant. Une question qui ne référence pas le sujet courant est invalide — réécris-la.
2. AU MOINS 1 question sur 3 doit creuser le POURQUOI PROFOND : pourquoi elle pense ça, pourquoi c'est important pour elle, quelle conviction personnelle se cache derrière ce sujet.
3. ${channelGuidance}
4. Questions OUVERTES (pas oui/non).
5. VARIÉTÉ DE TYPES DE QUESTIONS OBLIGATOIRE — les 3 questions doivent utiliser des TYPES DIFFÉRENTS parmi :
   - ANECDOTE : "Raconte un moment précis où…" (une scène concrète vécue)
   - OPINION TRANCHÉE : "C'est quoi ta position sur… ?" / "Tu penses quoi de… ?"
   - PROCESS / MÉTHODE : "Comment tu fais concrètement quand… ?" / "C'est quoi ta méthode pour… ?"
   - OBSERVATION : "Qu'est-ce que tu observes chez… ?" / "Qu'est-ce qui te frappe quand… ?"
   - CONVICTION : "C'est quoi le truc que tu répètes toujours à ce sujet ?" / "Pourquoi t'es convaincue que… ?"
   ⚠️ INTERDIT de faire 3 questions "Raconte-moi une fois où…". Maximum 1 question anecdote sur les 3.
6. Le ton des questions est chaleureux et curieux (comme une amie qui s'intéresse vraiment).
7. Chaque question a un placeholder qui donne un mini-exemple de réponse SPÉCIFIQUE au sujet courant.
8. ORIENTÉES vers l'objectif : si "vente" → demande des résultats, process, transformations. Si "engagement" → demande des anecdotes, émotions. Si "visibilité" → demande des opinions clivantes, observations décalées. Si "crédibilité" → demande des méthodes, des preuves, des observations terrain.
9. ${recentBriefsContext ? "MÉMOIRE ANTI-RÉPÉTITION : l'historique ci-dessus liste des sujets DIFFÉRENTS déjà traités. Tu ne dois JAMAIS importer leur contenu, leur vocabulaire spécifique ou leurs scènes dans tes questions sur le sujet courant. Ils servent uniquement à éviter de re-poser une question identique." : ""}

INTERDIT — NE FAIS JAMAIS ÇA :
- Questions génériques type "Qu'est-ce qui te passionne dans ton métier ?", "Quel est ton parcours ?", "Qu'est-ce qui te différencie ?"
- Questions de coaching de vie déconnectées du sujet
- Questions trop larges qui pourraient s'appliquer à N'IMPORTE QUEL sujet
- 3 questions qui commencent toutes par "Raconte-moi" ou "Il y a eu un moment où"
- Questions interchangeables d'un user à l'autre (= sans vocabulaire métier)
- ⚠️ Questions qui mentionnent des éléments venus de l'historique des briefs précédents (scènes, lieux, personnages, anecdotes d'anciens briefs) — l'historique ne sert PAS de matière narrative pour le sujet courant
- Chaque question DOIT mentionner le sujet courant ou un aspect concret du sujet courant

EXEMPLES (pour le sujet "Pourquoi je ne fais plus de remises") :
❌ MAUVAIS MIX :
1. "Raconte-moi un moment où tu as dû défendre ta valeur."
2. "Raconte-moi une fois où une cliente t'a demandé une remise."
3. "Raconte-moi comment tu as changé ta relation à l'argent."
(= 3x le même type "raconte-moi" → monotone)

✅ BON MIX :
1. (anecdote) "La dernière fois qu'on t'a demandé une remise, tu as répondu quoi exactement ?"
2. (opinion) "C'est quoi le truc qui t'agace le plus dans la culture du 'prix cassé' ?"
3. (process) "Concrètement, comment tu présentes tes tarifs maintenant pour éviter la négociation ?"

Réponds UNIQUEMENT en JSON :
{
  "questions": [
    {
      "question": "...",
      "placeholder": "..."
    }
  ]
}`;
      userPrompt = `Pose-moi 3 questions pour créer mon contenu sur ce sujet précis : "${context}"${angle ? ` (angle "${angle.title}")` : ""}.`;

    } else if (step === "follow-up") {
      const answersBlock = answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n");
      systemPrompt = `${QUESTIONS_PREFIX}
${brandingContext ? `\nCONTEXTE BRANDING DE L'UTILISATRICE :\n${brandingContext}\n` : ""}${brandVocabBlock}
SUJET du contenu : "${context}"

L'utilisatrice a répondu à ces 3 questions initiales :
${answersBlock}

══ TON RÔLE : creuser UN détail singulier ══

Lis ses réponses comme une amie experte qui veut sortir le contenu unique.
Identifie LE détail le plus intéressant, le plus singulier, ou le plus émotionnel — celui qui mérite d'être creusé pour passer du "post correct" au "post mémorable".

Pose 1 à 2 questions de suivi MAXIMUM pour creuser CE détail spécifique.

RÈGLES :
- Cite EXPLICITEMENT le détail que tu creuses (ex : "Tu dis que ta cliente a pleuré quand tu as livré : qu'est-ce qu'elle a dit exactement ?")
- Sois PRÉCISE, pas générique. Pas "Peux-tu détailler ?" mais "Cette phrase '[citation]' — c'est arrivé dans quel contexte ?"
- Si une réponse contient un chiffre, une scène, une citation, ou une émotion forte → c'est CETTE matière qu'il faut creuser
- Si toutes les réponses sont déjà très complètes, pose 1 SEULE question (pas 2) — ne creuse pas pour creuser
- Le ${"\""}why${"\""} explique en 1 phrase pourquoi cette question rendra le contenu plus singulier

Réponds UNIQUEMENT en JSON :
{
  "follow_up_questions": [
    {
      "question": "...",
      "placeholder": "...",
      "why": "..."
    }
  ]
}`;
      userPrompt = "Pose-moi 1 ou 2 questions d'approfondissement basées sur mes réponses.";

    } else if (step === "hooks") {
      // Lot 7 reels : proposer 3 angles d'attaque AVANT la génération complète.
      // Étape gratuite (hors BILLED_STEPS) ; le hook choisi repart en selected_hook.
      const answersBlock = answers?.length
        ? "\n\nMATIÈRE DU BRIEF (réponses de l'utilisatrice, sa vraie voix) :\n" +
          answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
        : "";
      const excludeRaw = (body as Record<string, unknown>).exclude_hooks;
      const excludeHooks: string[] = Array.isArray(excludeRaw)
        ? excludeRaw.filter((x: unknown): x is string => typeof x === "string").slice(0, 12)
        : [];
      const excludeBlock = excludeHooks.length
        ? `\n\nHOOKS DÉJÀ PROPOSÉS, REFUSÉS PAR L'UTILISATRICE :\n${excludeHooks.map((h) => `- "${h}"`).join("\n")}\nINTERDIT de les reproposer, même reformulés. Change d'angle, pas juste de mots.`
        : "";
      const noFaceCam = body.face_cam === "non";

      systemPrompt = `${COMMON_PREFIX}

TA MISSION : proposer 3 HOOKS d'ouverture pour un REEL Instagram sur le sujet donné.
Le hook = les 3 premières secondes. 50 % des viewers scrollent avant la 3e seconde :
c'est LE levier de rétention. L'utilisatrice choisit UN hook, le script complet sera
écrit dessus.

RÈGLES ABSOLUES :
1. Les 3 hooks sont de TYPES DIFFÉRENTS, choisis parmi :
   - vecu_perso (« Vécu perso ») : un moment vécu, raconté en Je. UNIQUEMENT si la
     matière du brief contient un vrai vécu — n'invente JAMAIS une anecdote.
   - contre_intuition (« Contre-intuition ») : affirmation qui renverse une croyance.
   - objection_retournee (« Objection retournée ») : la phrase qu'on lui oppose, puis le retournement.
   - question_choc (« Question choc ») : question qui pique, jamais rhétorique molle.
   - fait_brut (« Fait brut ») : fait concret/chiffre FOURNI (brief ou branding), sec, sans emballage.
   - scene_coupee (« Scène coupée ») : on entre au milieu d'une scène, in medias res.
2. text = ce qu'elle DIT (8-20 mots, 1-2 phrases, oral naturel, tension immédiate).
   ❌ "Aujourd'hui je vais te parler de..." ❌ hook descriptif ❌ slogan LinkedIn.
3. text_overlay = ce qu'on LIT à l'écran en MUET (3-8 mots, MAJUSCULES). Il doit
   fonctionner SEUL, sans le son, et COMPLÉTER le parlé, pas le répéter mot pour mot.
4. AUCUN chiffre qui ne vient pas du brief, des réponses ou du branding.
5. SINGULARITÉ : pas le hook consensuel de la niche. Ancre dans SON métier, SES mots,
   SA matière (contexte de marque ci-dessus).
6. format_recommande = la structure que ce hook appelle naturellement
   (face_cam_confession / voix_off_broll / hook_loop) et duree_cible = durée estimée
   cohérente avec l'objectif (visibilité → court ~20-30 s ; confiance/vente → ~40-60 s).${noFaceCam ? `
7. L'UTILISATRICE NE VEUT PAS SE MONTRER : format_recommande ≠ face_cam_confession
   pour les 3 hooks (voix off + b-roll ou hook loop uniquement).` : ""}${excludeBlock}`;
      userPrompt = `SUJET DU REEL : "${context || "?"}"
Objectif : ${effectiveObjective || objective || "non précisé"}${answersBlock}

Propose-moi 3 hooks de types différents pour ce reel.`;

    } else if (step === "generate") {
      const answersBlock = answers?.length
        ? answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
        : "";
      const followUpBlock = followUpAnswers?.length
        ? "\n\nQUESTIONS D'APPROFONDISSEMENT :\n" + followUpAnswers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
        : "";

      // Format variables (isLinkedIn, isCarousel, etc.) are defined in outer scope

      // Build format-specific depth instructions
      let depthMandate = "";
      let storiesGardeFouAlerte: string | null = null;
      if (isCarousel) {
        depthMandate = carouselBrief();
      } else if (isReel) {
        depthMandate = reelBrief({
          effectiveObjective,
          face_cam: body.face_cam,
          time_available: body.time_available,
          is_launch: body.is_launch,
          selected_hook: body.selected_hook,
          pre_gen_answers: body.pre_gen_answers,
          subject: context,
          editorial_angle: body.editorial_angle,
          content_structure: body.content_structure,
          inspiration_context: body.inspiration_context,
        });
      } else if (isStories) {
        // Garde-fou : 3 séquences vente sur 7 jours (migré depuis stories-ai)
        if (effectiveObjective === "vente") {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const gardeFouCol = workspace_id ? "workspace_id" : "user_id";
          const gardeFouVal = workspace_id || userId;
          const { count } = await supabase
            .from("stories_sequences")
            .select("id", { count: "exact", head: true })
            .eq(gardeFouCol, gardeFouVal)
            .eq("objective", "vente")
            .gte("created_at", sevenDaysAgo);
          if ((count ?? 0) >= 3) {
            storiesGardeFouAlerte = "⚠️ Tes stories récentes sont très orientées vente. Reviens à de la connexion ou de l'éducation pour maintenir la confiance. Ratio sain : 80% connexion/éducation, 20% vente.";
          }
        }
        // Catalogue bibliothèque (lot B) : l'IA écrit la séquence en SACHANT
        // quelles photos existent (descriptions écrites par photo-describe à
        // l'upload). Index courts dans le prompt (jamais d'UUID : trop long,
        // risque de recopie erronée) ; la résolution index → id se fait après
        // le parse, côté edge, de façon déterministe.
        // Lot D : les photos CHOISIES à l'étape format (preferred_photo_ids)
        // passent en tête du catalogue, marquées « chosen » — le brief les
        // traite en priorité absolue et le post-parse garantit leur placement.
        {
          const catCol = workspace_id ? "workspace_id" : "user_id";
          const catVal = workspace_id || userId;
          const rawPreferred = (body as Record<string, unknown>).preferred_photo_ids;
          const preferredIds: string[] = Array.isArray(rawPreferred)
            ? rawPreferred.filter((x: unknown): x is string => typeof x === "string").slice(0, 10)
            : [];
          const { data: catRows, error: catErr } = await supabase
            .from("user_photos")
            .select("id, description")
            .eq(catCol, catVal)
            .eq("status", "ready")
            .order("created_at", { ascending: false })
            .limit(60);
          if (catErr) {
            // Jamais bloquant : sans catalogue, la génération garde le
            // comportement historique (directives seules).
            console.warn("[creative-flow] catalogue photos illisible:", catErr.message);
          }
          type CatRow = { id: string; description: string | null };
          const rows = (catRows || []) as CatRow[];
          // Les préférées passent MÊME sans description (photo fraîchement
          // uploadée, describe encore en cours) ; le reste doit être décrit.
          const preferredRows = preferredIds
            .map((id) => rows.find((r) => r.id === id))
            .filter((r): r is CatRow => !!r);
          const otherRows = rows
            .filter(
              (r) =>
                !preferredIds.includes(r.id) &&
                typeof r.description === "string" &&
                r.description.trim().length > 0,
            )
            .slice(0, Math.max(0, 40 - preferredRows.length));
          storiesPhotoCatalog = [...preferredRows, ...otherRows].map((r, i) => ({
            index: i + 1,
            id: r.id,
            description:
              typeof r.description === "string" && r.description.trim().length > 0
                ? r.description.trim()
                : "photo choisie par l'utilisatrice (pas encore décrite)",
            preferred: preferredIds.includes(r.id),
          }));
        }
        depthMandate = storiesBrief({
          objective: effectiveObjective,
          price_range: body.price_range,
          time_available: body.time_available,
          face_cam: body.face_cam,
          is_launch: body.is_launch,
          gardeFouAlerte: storiesGardeFouAlerte,
          pre_gen_answers: body.pre_gen_answers,
          subject: context,
          photo_catalog: storiesPhotoCatalog.map(({ index, description, preferred }) => ({
            index,
            description,
            chosen: preferred || undefined,
          })),
        });
      } else if (isLinkedIn) {
        depthMandate = linkedinBrief(editorialFormat);
      } else if (isPinterest) {
        depthMandate = pinterestBrief(pinterest_link, pinterest_board);
      } else if (isNewsletter) {
        depthMandate = newsletterBrief();
      } else if (isPhotoMode) {
        depthMandate = photoCaptionBrief(body.photo_description);
      } else {
        depthMandate = captionBrief(effectiveObjective);
      }

      systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${isLinkedIn || isPinterest || isNewsletter ? "" : FORMAT_STRUCTURES}

${isLinkedIn || isPinterest ? "" : WRITING_RESOURCES}

${isLinkedIn || isPinterest || isNewsletter ? "" : VISUAL_ANALOGIES}

${angle ? `ANGLE CHOISI :
- Titre : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}` : "Pas d'angle spécifique choisi. Choisis le meilleur angle pour le sujet."}

SUJET DE L'UTILISATRICE :
"""
${context}
"""
Le contenu DOIT parler de ce sujet. Les réponses aux questions ci-dessous enrichissent le sujet mais ne le remplacent pas.

CANAL : ${contentType || "Post Instagram"}
${editorialFormatLabel ? `FORMAT ÉDITORIAL : ${editorialFormatLabel}` : ""}
${angle?.format_livraison ? `FORMAT DE LIVRAISON : ${angle.format_livraison}` : ""}

${depthMandate}

RÉPONSES DE L'UTILISATRICE :
${answersBlock}
${followUpBlock}
${calendarBlock}${objectiveBlock}${newsContextBlock}
${preGenBlock}

RÈGLE ANTI-FABRICATION :
N'invente JAMAIS une anecdote, un cas client ou un chiffre que l'utilisatrice n'a pas écrit.
Pas de vécu fourni → angle expert : décryptage, constat décalé, prise de position.

${PREGEN_INJECTION_RULES}

═══════════════════════════════════════════════════
PROFONDEUR (RÈGLE ABSOLUE)
═══════════════════════════════════════════════════

Tu ne fais JAMAIS de contenu de surface. Chaque contenu doit donner au lecteur quelque chose qu'il ne savait pas, qu'il n'avait pas vu comme ça, ou qu'il n'aurait pas formulé aussi bien.

Profondeur = au moins UN de ces éléments dans chaque contenu :
1. Un EXEMPLE CONCRET (pas "par exemple, imagine que..." mais une vraie situation, un vrai cas, un vrai chiffre)
2. Un MÉCANISME EXPLIQUÉ (le "pourquoi" derrière le "quoi" : pourquoi ça marche, pourquoi on se trompe, pourquoi c'est contre-intuitif)
3. Une NUANCE qui surprend (le "oui, mais" ou le "sauf que" qui empêche le contenu d'être un conseil générique)
4. Un LIEN INATTENDU (connecter le sujet à un domaine auquel personne n'avait pensé)

Si ton contenu pourrait être écrit par n'importe quel compte de la même niche, c'est pas assez profond. Ce qui le rend unique, c'est le point de vue, les exemples, et les nuances de l'utilisatrice.

Les gens scrollent les contenus qui DISENT des choses qu'ils savaient déjà.
Ils s'arrêtent sur les contenus qui leur font VOIR les choses autrement.

═══════════════════════════════════════════════════
SELF-CHECK (fais-le en interne avant de répondre)
═══════════════════════════════════════════════════

Avant de retourner le JSON, vérifie :
1. Est-ce que le contenu a au moins 1 exemple concret ? (pas une généralité)
2. Est-ce que l'accroche est assez forte pour stopper le scroll ?
3. Est-ce que j'ai utilisé les MOTS de l'utilisatrice (ses réponses, ses expressions) ?
4. Est-ce que le contenu dit quelque chose de SPÉCIFIQUE (qu'on ne pourrait pas copier-coller pour un autre sujet) ?
5. Est-ce que la longueur respecte le format demandé ?
6. Est-ce que le contenu passe le test du café (lisible à voix haute sans sonner robot) ?
Si une réponse est NON, RÉÉCRIS avant de retourner.

═══════════════════════════════════════════════════
DERNIÈRES VÉRIFICATIONS (À APPLIQUER APRÈS RÉDACTION)
═══════════════════════════════════════════════════

${CHAIN_OF_THOUGHT}

ANTI-SLOP FINAL — Relis ton output et vérifie :
1. Contient-il un marqueur IA banni (rafale de phrases courtes, "Et là tout a basculé", storytelling fabriqué) ? → Réécris la phrase.
2. Chaque phrase ajoute-t-elle une information NOUVELLE ? → Supprime toute redondance.
3. Pourrais-tu dire ce texte à voix haute à une amie sans que ça sonne bizarre ? → Simplifie ce qui coince.
4. Le texte fait-il la bonne longueur ? Si tu peux dire la même chose en moins de mots → Coupe.
Retourne UNIQUEMENT la version finale corrigée.

${variation && previousContent ? `
═══════════════════════════════════════════════════
MODE RÉÉCRITURE : VERSION ALTERNATIVE
═══════════════════════════════════════════════════

L'utilisatrice a déjà reçu cette version et veut AUTRE CHOSE :
"""
${previousContent.slice(0, 2000)}
"""

Tu DOIS proposer une version SIGNIFICATIVEMENT DIFFÉRENTE :
- Accroche DIFFÉRENTE : pas la même reformulée, une AUTRE approche (si la v1 commençait par une question, commence par une affirmation choc ; si la v1 était un constat, commence par une anecdote)
- Point d'entrée DIFFÉRENT dans le sujet (si la v1 partait du problème, pars de la solution ; si la v1 était éducative, sois émotionnelle)
- Le message central reste cohérent mais l'angle d'attaque change
- Ne fais PAS une variation cosmétique (mêmes idées avec d'autres mots). Fais une VRAIE alternative.
` : ""}
Rédige le contenu en suivant les INSTRUCTIONS DE RÉDACTION FINALE ci-dessus.
Le contenu doit être PRÊT À POSTER (pas un brouillon).

${isReel || isStories ? `` : isNewsletter ? `Un email part en TEXTE BRUT : aucune valeur ne doit contenir de markdown (**gras**, *italique*, ## titres) — les astérisques s'afficheraient tels quels chez le lecteur. Pour un aparté, utilise des parenthèses.

Réponds UNIQUEMENT en JSON :
{
  "subject": "objet de l'email (max 50 caractères, accrocheur, jamais 'Newsletter #N')",
  "preview_text": "texte de preview (40-90 caractères, complète l'objet sans le répéter)",
  "content": "corps complet de la newsletter (avec \\n\\n entre paragraphes)",
  "accroche": "première phrase du corps",
  "cta_suggestion": "suggestion de CTA doux si pertinent, sinon null",
  "format": "newsletter",
  "pillar": "...",
  "objectif": "...",
  "personal_tip": "conseil d'incarnation SEULEMENT si demandé plus haut, sinon null"
}` : `Réponds UNIQUEMENT en JSON :
{
  "content": "...",
  "accroche": "...",
  "format": "...",
  "pillar": "...",
  "objectif": "...",
  "personal_tip": "conseil d'incarnation SEULEMENT si demandé plus haut, sinon null"
}`}`;
      // Inject launch context for stories AND reels (preserved from stories-ai / reels-ai)
      if ((isStories || isReel) && body.launch_context) {
        const lc = body.launch_context;
        systemPrompt += `\n\nCONTEXTE LANCEMENT :\n- Phase : ${lc.phase || "?"}\n- Chapitre : ${lc.chapter_label || "?"}\n- Phase mentale audience : ${lc.audience_phase || "?"}\n- Objectif du slot : ${lc.objective || "?"}\n- Angle suggéré : ${lc.angle_suggestion || "?"}\nCONSIGNE : adapte le contenu à cette phase du lancement. Un contenu de phase "vente" n'a pas le même ton qu'un contenu de phase "teasing".`;
      }
      userPrompt = "Rédige mon contenu à partir de mes réponses et de l'angle choisi.";

    } else if (step === "adjust") {
      // Smart guidance based on adjustment type
      const adjustLower = (adjustment || "").toLowerCase();
      let adjustGuidance = "";
      if (adjustLower.includes("long")) {
        const isCarouselContent = currentContent?.includes("SLIDE") || currentContent?.includes("📌");
        adjustGuidance = isCarouselContent
          ? "AJOUTE une slide supplémentaire qui développe un point existant en profondeur. Ne rallonge pas les slides existantes."
          : "Développe l'idée principale avec un exemple concret ou une anecdote. Ne rallonge pas artificiellement avec des transitions vides.";
      } else if (adjustLower.includes("court")) {
        adjustGuidance = "Coupe les transitions faibles et les répétitions. Garde les punchlines et les exemples concrets. Ne sacrifie pas la profondeur.";
      } else if (adjustLower.includes("punchy")) {
        adjustGuidance = "Raccourcis les phrases longues. Ajoute des bucket brigades. L'accroche doit claquer plus fort.";
      } else if (adjustLower.includes("exemples") || adjustLower.includes("concret")) {
        adjustGuidance = "Remplace les conseils abstraits par des situations concrètes. Chaque point doit avoir un exemple terrain, un cas réel, ou un chiffre.";
      } else if (adjustLower.includes("storytelling") || adjustLower.includes("histoire")) {
        adjustGuidance = "Restructure autour d'une narration. Commence par un moment précis (lieu, émotion), développe la tension, puis la résolution.";
      } else if (adjustLower.includes("chiffres") || adjustLower.includes("données") || adjustLower.includes("stats")) {
        adjustGuidance = "Ajoute 2-3 données chiffrées. Si pas de chiffres exacts disponibles, indique [STAT À VÉRIFIER] pour que l'utilisatrice insère les vrais chiffres.";
      }

      systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${FORMAT_STRUCTURES}

${WRITING_RESOURCES}

${editorialFormatLabel ? `FORMAT ÉDITORIAL : ${editorialFormatLabel}` : ""}
${effectiveObjective ? `OBJECTIF : ${effectiveObjective}` : ""}
${angle ? `ANGLE : ${angle.title} (${angle.tone})` : ""}

CONTENU ACTUEL :
"""
${currentContent}
"""

AJUSTEMENT DEMANDÉ : ${adjustment}
${adjustGuidance ? `\nGUIDE :\n${adjustGuidance}` : ""}

Réécris le contenu avec l'ajustement demandé. Garde la structure, les anecdotes et les mots de l'utilisatrice. Change UNIQUEMENT ce qui est lié à l'ajustement.
Ne raccourcis JAMAIS la profondeur sauf si l'ajustement demande explicitement de raccourcir.

Réponds UNIQUEMENT en JSON :
{
  "content": "..."
}`;
      userPrompt = `Ajuste le contenu : ${adjustment}`;

    } else if (step === "recycle") {
      // Les prompts du recyclage sont construits PAR FORMAT dans le pipeline
      // parallèle dédié (plus bas, avant la section « Call Anthropic ») via
      // buildRecycleSystemPrompt. Rien à préparer ici.
    } else if (step === "dictation") {
      systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${WRITING_RESOURCES}

L'utilisatrice a dicté ceci en mode vocal :
"""
${sourceText}
"""

Transforme en : ${targetFormat}

RÈGLES ABSOLUES :
- Garde SES mots. Si elle dit "le truc c'est que", utilise "le truc c'est que".
- Garde SON rythme. Si elle fait des phrases longues qui déroulent, garde ça.
- Garde SES expressions. Si elle dit "franchement" ou "genre", c'est sa voix.
- NE réécris PAS dans un style "professionnel". Structure, c'est tout.
- Tu peux couper les répétitions et les hésitations.
- Tu peux réorganiser l'ordre pour plus de clarté.
- Tu DOIS garder l'énergie et la personnalité de l'oral.

Le résultat doit sonner comme si ELLE l'avait écrit, pas comme si une IA avait reformulé.

Réponds UNIQUEMENT en JSON :
{
  "content": "..."
}`;
      userPrompt = `Structure ma dictée vocale en ${targetFormat}.`;

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
    if (deepResearch && step === "generate") {
      // Check deep_research quota
      const drQuota = await checkQuota(userId, "deep_research");
      if (!drQuota.allowed) {
        return quotaDeniedResponse(drQuota, corsHeaders);
      }

      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      const theme = calendarContext?.theme || context || contentType || "contenu";
      const activite = profile?.activite || "";

      // Build targeted research prompt based on objective and editorial format
      const researchObjective = effectiveObjective || objective || "";
      const researchAngle = editorialFormatLabel || angle?.title || "";
      let researchFocus = "";
      if (researchObjective.includes("vente") || researchObjective.includes("conversion")) {
        researchFocus = "Cherche en priorité : des témoignages, des études de cas, des chiffres de transformation (avant/après), des statistiques de conversion ou de résultats clients.";
      } else if (researchObjective.includes("credibilite") || researchObjective.includes("crédibilité")) {
        researchFocus = "Cherche en priorité : des études scientifiques, des rapports sectoriels, des données chiffrées officielles, des avis d'experts reconnus.";
      } else if (researchObjective.includes("visibilite") || researchObjective.includes("visibilité")) {
        researchFocus = "Cherche en priorité : des tendances émergentes, des chiffres surprenants ou contre-intuitifs, des faits viralisables, des comparaisons frappantes.";
      } else if (researchObjective.includes("confiance") || researchObjective.includes("engagement")) {
        researchFocus = "Cherche en priorité : des histoires humaines, des situations vécues universelles, des sondages d'opinion, des verbatims ou témoignages.";
      }
      
      let researchAngleHint = "";
      if (researchAngle.toLowerCase().includes("mythe") || researchAngle.toLowerCase().includes("déconstruire")) {
        researchAngleHint = "Le contenu va déconstruire un mythe. Cherche des données qui CONTREDISENT une croyance courante sur le sujet.";
      } else if (researchAngle.toLowerCase().includes("enquête") || researchAngle.toLowerCase().includes("décryptage")) {
        researchAngleHint = "Le contenu est une enquête/décryptage. Cherche des données récentes et des tendances que peu de gens connaissent.";
      } else if (researchAngle.toLowerCase().includes("test") || researchAngle.toLowerCase().includes("grandeur nature")) {
        researchAngleHint = "Le contenu est un retour d'expérience. Cherche des benchmarks, des moyennes sectorielles, des résultats comparatifs.";
      }

      const searchModel = getModelForAction("content");
      const searchResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: searchModel,
          // Fetch brut (hors helpers) : la garde thinking Sonnet 5 doit être posée
          // ici aussi, sinon le thinking adaptatif mange le budget de recherche.
          ...(forcesDisabledThinking(searchModel) ? { thinking: { type: "disabled" } } : {}),
          max_tokens: 2048,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
          messages: [{
            role: "user",
            content: `Recherche des données récentes sur le sujet suivant : ${theme}.
Contexte professionnel : ${activite}.
${researchFocus ? `\n${researchFocus}` : ""}
${researchAngleHint ? `\n${researchAngleHint}` : ""}

Résume les 3-5 points les plus pertinents. Pour chaque point, donne :
- Le fait ou la donnée
- La source (nom du média, de l'étude, ou de l'organisme)
- Pourquoi c'est intéressant pour du contenu social media

Privilégie les sources françaises et européennes quand elles existent.`,
          }],
        }),
      });

      let webSearchTokens = 0;
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        webSearchTokens = (searchData.usage?.input_tokens ?? 0) + (searchData.usage?.output_tokens ?? 0);
        // Extract all text blocks from the response
        const textParts: string[] = [];
        for (const block of (searchData.content || [])) {
          if (block.type === "text") {
            textParts.push(block.text);
          }
        }
        const researchResult = textParts.join("\n\n");

        if (researchResult.trim()) {
          systemPrompt += `\n\n--- RECHERCHE WEB ---\n${researchResult}\n--- FIN RECHERCHE ---\n\nUtilise ces données pour enrichir le contenu avec des faits concrets, des chiffres, des exemples récents. Ne cite pas les sources directement mais intègre les infos naturellement.`;
        }
      } else {
        console.error("Deep research web search failed:", searchResponse.status);
      }

      // Log deep research usage
      await logUsage(userId, "deep_research", "web_search", webSearchTokens || undefined, searchModel, workspace_id);
    }

    // ── Streaming SSE (generate step) ──
    // Activé pour : texte pur, ET pour LinkedIn photo (sinon la socket casse pendant la vision).
    const wantsStream = req.headers.get("Accept") === "text/event-stream";
    const isLinkedInPhotoStream = !!body.photo_mode && isLinkedIn && !!body.photos?.[0]?.base64;
    const canStreamPhoto = isLinkedInPhotoStream && !deepResearch;
    if (wantsStream && step === "generate" && !deepResearch && !isStories && !isReel && (!body.photo_mode || canStreamPhoto)) {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
      const model = getModelForAction("content");

      // ── LinkedIn + photos : streaming vision (évite la coupure de socket
      //    pendant la latence vision). On émet immédiatement les tokens dès
      //    qu'Anthropic les renvoie : la socket reste vivante.
      if (canStreamPhoto) {
        const validPhotos = body.photos!.filter((p: any) => p?.base64).slice(0, 10);
        const isBeforeAfter = validPhotos.length === 2;
        const isSeries = validPhotos.length >= 3;
        const { formatBrief, jsonShape } = buildVisionGenerateBrief(contentType);

        const photoContent: any[] = [];
        photoContent.push({
          type: "text",
          text: `══ RÈGLES CRITIQUES À LIRE AVANT DE REGARDER LES IMAGES ══

1. ANTI-PARAPHRASE VISUELLE : tu n'as PAS le droit d'écrire "Ce [adjectif] [objet], c'est…" pour désigner ce que tu vois.
2. ANTI-CASCADE : pas de rafale de phrases courtes pour faire "punchy". Une seule pensée qui se déroule.
3. ANTI-CTA FABRIQUÉ : pas de slogan-invitation en italique ou guillemets.
4. CHIFFRES / NUMÉROS / DATES / NOMS VISIBLES : recopie EXACTEMENT.
5. VOIX = JE (ton vécu) + NOUS/ON inclusif pour embarquer. Le "TU" reste rare, pour une interpellation ponctuelle : jamais comme adresse de tout le texte, jamais de "vous". Ton d'une amie au café, pas d'une audience. (Sauf si la voix de marque indique un autre registre.)

══ MAINTENANT, REGARDE LES IMAGES ══
`,
        });
        validPhotos.forEach((p: any, idx: number) => {
          const { media_type, data } = extractImagePayload(String(p.base64), p.mimeType);
          photoContent.push({
            type: "image",
            source: { type: "base64", media_type, data },
          });
          const ctx = p.context?.trim();
          if (isBeforeAfter) {
            const label = idx === 0 ? "↑ AVANT" : "↑ APRÈS";
            photoContent.push({ type: "text", text: ctx ? `${label} — contexte : "${ctx}"` : label });
          } else if (ctx) {
            photoContent.push({ type: "text", text: `↑ Contexte sur l'image ci-dessus : "${ctx}"` });
          }
        });
        const modeInstr = isBeforeAfter
          ? `\n\n🔄 MODE AVANT / APRÈS : raconte LA transformation comme un récit unique.`
          : isSeries
          ? `\n\n📸 MODE SÉRIE (${validPhotos.length} images) : trouve le fil thématique commun. NE liste/NE numérote PAS.`
          : "";
        const answersBlockPhoto = (answers && Array.isArray(answers) && answers.length > 0)
          ? answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}"\n→ "${a.answer}"`).join("\n\n")
          : "";
        const userSubjectBlock = (context && String(context).trim())
          ? `══ SUJET DÉCLARÉ PAR L'UTILISATRICE (PRIORITÉ ABSOLUE) ══\n"${String(context).trim()}"\n\nC'est CE sujet que le post doit traiter. Les photos ILLUSTRENT, elles ne dictent PAS l'angle.\n\n`
          : "";
        photoContent.push({
          type: "text",
          text: `${userSubjectBlock}${formatBrief}${body.photo_description ? `\nDescription complémentaire : "${body.photo_description}"` : ""}${answersBlockPhoto ? `\n\n══ RÉPONSES DE L'UTILISATRICE ══\n${answersBlockPhoto}` : ""}${modeInstr}\n\nRègle anti-fabrication : n'invente AUCUN détail non vérifiable. Si la matière manque, bascule sur registre RÉFLEXIF/MÉTA ancré sur LE SUJET DÉCLARÉ.\n\nRéponds UNIQUEMENT en JSON :\n${jsonShape}`,
        });

        return createClientSSEStream(
          () => streamAnthropicSSE(
            apiKey,
            model,
            systemPrompt,
            [{ role: "user", content: photoContent }],
            0.7,
            4096,
          ),
          corsHeaders,
          async (_full, usage) => {
            await logUsage(userId, "content", "creative_flow", usage?.total_tokens, usage?.model, workspace_id);
          },
        );
      }

      // LinkedIn (texte) : pas de streaming de texte (la correction doit relire
      // le post complet), mais un SSE heartbeat + étapes réelles (writing →
      // correcting) pour que le front affiche la vraie avancée au lieu d'une
      // barre simulée — même pattern que carousel-ai. Le client streaming
      // consomme déjà l'event final `done.full`.
      if (isLinkedIn) {
        const runLinkedInTwoStep = async (emitStatus: StatusEmitter = () => {}): Promise<Response> => {
        console.log("[CORRECTION DEBUG] LinkedIn correction pass STARTED");
        const genLkUsage: UsageSink = {};
        const corrLkUsage: UsageSink = {};
        emitStatus("writing");
        const rawContent = await callAnthropicSimple(model, systemPrompt, userPrompt!, 0.85, 4096, genLkUsage);
        console.log("[CORRECTION DEBUG] First call done, rawContent length:", rawContent?.length);

        // Parse the raw content to extract the post text
        let postText = "";
        try {
          const parsed = JSON.parse(rawContent);
          postText = parsed.content || parsed.full_text || rawContent;
        } catch {
          const match = rawContent.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              postText = parsed.content || parsed.full_text || rawContent;
            } catch { postText = rawContent; }
          } else {
            postText = rawContent;
          }
        }

        // Step 2: Correction pass — short, focused prompt
        const correctionPrompt = `Tu es un éditeur LinkedIn exigeant. Tu reçois un post et tu dois le CORRIGER systématiquement. Ton job n'est PAS de juger si c'est "déjà bien" — c'est de traquer et corriger TOUS les patterns IA, même subtils.

══ TEST FONDAMENTAL (à appliquer AVANT toute correction) ══

Lis le post à voix haute mentalement. Pose-toi cette question :

"Est-ce que ce post pourrait avoir été écrit par une assistante IA bien entraînée ?"

Si la réponse est "oui, possiblement" → tu DOIS réécrire les passages qui te font hésiter.

Si la réponse est "non, c'est clairement humain" → tu peux retourner la version corrigée.

Le critère n'est pas "est-ce que c'est joli" mais "est-ce que c'est INDISTINGUABLE d'un humain".

══ CORRECTIONS OBLIGATOIRES — APPLIQUE TOUTES CELLES QUI S'APPLIQUENT ══

1. PHRASES COURTES CONSÉCUTIVES (compte-les) :
   → COMPTE les phrases consécutives de moins de 10 mots.
   → Si tu trouves 2 phrases courtes (< 10 mots) qui se suivent : FUSIONNE-LES.
   → Si tu trouves 1 phrase isolée < 10 mots seule entre 2 sauts de ligne : INTÈGRE-LA dans le paragraphe précédent ou suivant.
   → Le rythme vient de l'ALTERNANCE longue/courte, pas de la répétition courte/courte.
   ❌ "C'était brillant. Trop brillant." → ✅ "C'était brillant. Tellement brillant que ça en devenait illisible."
   ❌ "C'était beau. Vraiment." → ✅ "C'était objectivement beau, et c'est exactement là le problème."
   ❌ "Et là, j'ai compris." → ✅ "Et là, j'ai compris ce qui clochait."

2. ÉNUMÉRATIONS RYTHMIQUES PARFAITES :
   → Une énumération de 3 éléments avec une structure parallèle ("Des X, des Y, des Z" ou "X qui A, Y qui B, Z qui C") est un marqueur IA.
   → Casse la symétrie : varie les longueurs, ajoute une parenthèse, supprime un élément.
   ❌ "Des couleurs pop, une typo qui claque, un univers visuel cohérent."
   → ✅ "Les couleurs étaient pop, la typo claquait, et tout collait visuellement."
   ❌ "Des métaphores partout, des jeux de mots subtils, une structure narrative en trois actes."
   → ✅ "Plein de métaphores, des jeux de mots, une structure en trois actes : bref, du travail."

3. FORMULES MANUFACTURÉES (mots-valises copywriting) :
   → Détecte les expressions qui sonnent comme un livre de marketing.
   → Liste non-exhaustive (cherche des variantes) : "noyé dans l'esthétique", "bruit joli", "vitrine sans produit", "fondations bancales", "habiller un message", "habillage du fond", "emballage sans contenu", "décorer la maison", "le squelette du contenu", "l'ADN de la marque", "le pilier de", "le socle de", "transformer notre manière de [verbe]".
   → Si tu vois UNE de ces expressions OU UNE expression du même registre → réécris en plus brut, plus parlé.
   ❌ "Le message était noyé dans l'esthétique." → ✅ "Le message était invisible derrière le visuel."
   ❌ "transformer notre manière de consommer, de créer et de vivre" → ✅ "changer comment on consomme, comment on crée : et même comment on vit"

4. RAFALES "PAS X. PAS Y. C'EST Z." :
   → Cette structure parallèle est un marqueur IA.
   → Réécris en prose continue.
   ❌ "C'est pas sexy. C'est pas instagrammable. Ça ressemble à du travail de fond."
   → ✅ "C'est pas sexy ni instagrammable, ça ressemble plus à du travail de fond ingrat."

5. ANAPHORES (3+ phrases qui démarrent pareil) :
   → Compte les débuts de phrase. Si 3+ commencent par le même mot/groupe : RÉÉCRIS.
   ❌ "Par dire les choses. Par ne pas forcer. Par être direct·e."
   → ✅ "En disant les choses sans forcer personne à deviner. En étant direct·e."
   ❌ "Je parle de visibilité. Je parle du droit. Je parle de réhabiliter."
   → ✅ "Je parle de visibilité, du droit de prendre sa place, de réhabiliter la communication."

6. EMPILEMENT INSPIRATIONNEL (2+ phrases-valeurs sans exemple concret) :
   → Si 2 phrases consécutives expriment des valeurs abstraites sans aucun fait : remplace par UN exemple concret.
   ❌ "Les projets éthiques méritent d'être vus. Les créatrices ont le droit de prendre leur place."
   → ✅ "Une céramiste qui fait un travail incroyable mais que personne ne connaît, c'est pas un choix de discrétion. C'est un problème de visibilité."

7. ACCROCHE PROMESSE/SLOGAN :
   → Si l'accroche promet quelque chose ("X n'aura plus de secrets", "Voici comment...", "5 erreurs à éviter") : remplace par un FAIT concret ou une scène vécue.

8. CTA GÉNÉRIQUE :
   → "Et toi/vous, qu'en penses-tu/pensez-vous ?" ou variante existentielle large : remplace par une question SPÉCIFIQUE au sujet du post, ou supprime.

9. CONCLUSION QUI RÉSUME :
   → Si la dernière phrase reformule ce qui a été dit : remplace par une ouverture (question, tension, invitation) ou supprime.
   ❌ "Mais pour ça, elle doit d'abord être comprise." (résume)
   → ✅ "Et c'est cette base, peut-être, qu'on a oubliée." (ouvre)

10. GENRÉ NON INCLUSIF :
    → Pas de point médian sur les noms communs : ajoute-le.

11. REDONDANCE :
    → Si 2+ paragraphes expriment la même idée sous angles différents : garde le plus CONCRET, fusionne ou supprime les autres.

12. LONGUEUR :
    → Cible : 1300-2000 caractères. Si > 2000 : supprime le paragraphe le plus abstrait. Ne raccourcis PAS un post déjà dans cette fourchette.

══ RÈGLES ABSOLUES ══

- Garde le SENS et la CONVICTION du post. Tu corriges la FORME, pas le FOND.
- N'invente pas de nouveaux faits. Garde les détails concrets de l'original.
- Le post corrigé fait entre 1300 et 1700 caractères.
- JAMAIS de tiret cadratin (—). Utilise : ou ; ou des virgules.
- Écriture inclusive avec point médian.

══ AUTO-VÉRIFICATION FINALE ══

Avant de retourner le JSON, RELIS ton output et vérifie :

□ Y a-t-il encore 2 phrases courtes consécutives ? → fusionne
□ Y a-t-il encore une formule manufacturée ? → réécris
□ La conclusion ouvre-t-elle vraiment ? → vérifie qu'elle ne résume pas
□ Le post sonne-t-il INDISTINGUABLE d'un humain ? → si non, recommence

Réponds UNIQUEMENT en JSON :
{
  "content": "le post complet corrigé",
  "accroche": "les 210 premiers caractères",
  "corrections_applied": ["liste courte des corrections faites"]
}`;
        // Correction = édition mécanique à règles fermées → Haiku (~2x plus
        // rapide que Sonnet), même arbitrage que le carrousel (#364).
        emitStatus("correcting");
        const correctedRaw = await callAnthropicSimple(
          "claude-haiku-4-5",
          correctionPrompt,
          `Voici le post LinkedIn à corriger :\n\n"""\n${postText}\n"""`,
          0.3,
          4096,
          corrLkUsage
        );
        console.log("[CORRECTION DEBUG] Correction call done, correctedRaw length:", correctedRaw?.length);

        // Parse corrected content, fallback to original if correction fails
        let finalResult: any = null;
        try {
          finalResult = JSON.parse(correctedRaw);
        } catch {
          const match = correctedRaw.match(/\{[\s\S]*\}/);
          if (match) {
            try { finalResult = JSON.parse(match[0]); } catch { finalResult = null; }
          }
        }

        // If correction succeeded, use it; otherwise fall back to original
        console.log("[CORRECTION DEBUG] finalResult.content present:", !!finalResult?.content);
        if (finalResult?.content) {
          let originalParsed: any = {};
          try { originalParsed = JSON.parse(rawContent); } catch {
            const m = rawContent.match(/\{[\s\S]*\}/);
            if (m) try { originalParsed = JSON.parse(m[0]); } catch {}
          }

          const merged = {
            ...originalParsed,
            content: finalResult.content,
            accroche: finalResult.accroche || originalParsed.accroche,
            format: originalParsed.format || "linkedin",
            pillar: originalParsed.pillar || "",
            objectif: originalParsed.objectif || "",
          };

          await logUsage(userId, "content", "creative_flow", ((genLkUsage.total_tokens ?? 0) + (corrLkUsage.total_tokens ?? 0)) || undefined, genLkUsage.model, workspace_id);
          return new Response(JSON.stringify(merged), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log("[CORRECTION DEBUG] FALLBACK triggered — returning uncorrected post");
        // Fallback: return original if correction failed
        let fallbackParsed: any;
        try { fallbackParsed = JSON.parse(rawContent); } catch {
          const m = rawContent.match(/\{[\s\S]*\}/);
          if (m) try { fallbackParsed = JSON.parse(m[0]); } catch { fallbackParsed = { content: rawContent }; }
          else fallbackParsed = { content: rawContent };
        }

        await logUsage(userId, "content", "creative_flow", ((genLkUsage.total_tokens ?? 0) + (corrLkUsage.total_tokens ?? 0)) || undefined, genLkUsage.model, workspace_id);
        return new Response(JSON.stringify(fallbackParsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        };
        return runWithHeartbeatSSE(corsHeaders, runLinkedInTwoStep);
      }

      // Newsletter : même pattern que LinkedIn — pas de streaming de texte,
      // mais heartbeat SSE + étapes réelles (writing → correcting).
      if (isNewsletter) {
        const runNewsletterTwoStep = async (emitStatus: StatusEmitter = () => {}): Promise<Response> => {
        const nlUsage: UsageSink = {};
        emitStatus("writing");
        const rawContent = await callAnthropicSimple(model, systemPrompt, userPrompt!, 0.7, 4096, nlUsage);

        let parsed: any;
        try {
          parsed = JSON.parse(rawContent);
        } catch {
          const match = rawContent.match(/\{[\s\S]*\}/);
          if (match) {
            try { parsed = JSON.parse(match[0]); } catch { parsed = { content: rawContent }; }
          } else {
            parsed = { content: rawContent };
          }
        }

        console.log(
          `[creative-flow newsletter] subject:`,
          parsed.subject?.length,
          "preview:",
          parsed.preview_text?.length,
        );

        if (parsed.content && typeof parsed.content === "string" && parsed.content.length >= 200) {
          try {
            emitStatus("correcting");
            const nlAllowed = numbersIn([
              typeof body.context === "string" ? body.context : "",
              body.answers ? JSON.stringify(body.answers) : "",
              typeof body.news_context === "string" ? body.news_context : "",
              fullContext || "",
            ].join("\n"));
            const nlRedac = analyzeTextRedac(parsed.content, nlAllowed);
            const corrected = await applyCorrectionPass(parsed.content, "newsletter", {
              logger: (m) => console.log(`[creative-flow newsletter] ${m}`),
              // Édition mécanique à règles fermées → Haiku (cf. #364)
              model: "claude-haiku-4-5",
              extraInstructions: buildTextFixInstructions(nlRedac) || undefined,
            });
            if (corrected && corrected.length >= 200) {
              parsed.content = corrected;
            }
          } catch (e) {
            console.error("[creative-flow newsletter] correction pass failed:", e);
          }
        }

        // Nettoyage déterministe : un email part en texte brut, le markdown
        // résiduel (**gras**, *italique*) s'afficherait tel quel (audit 09/07).
        parsed = stripMarkdownFromNewsletter(parsed);

        if (parsed.content && typeof parsed.content === "string") {
          parsed.word_count = parsed.content.split(/\s+/).filter(Boolean).length;
        }

        await logUsage(userId, "content", "creative_flow", nlUsage.total_tokens, nlUsage.model, workspace_id);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        };
        return runWithHeartbeatSSE(corsHeaders, runNewsletterTwoStep);
      }

      // Carousel: disable streaming, use 2-step generation + correction
      if (isCarousel) {
        const caUsage: UsageSink = {};
        const caCorrUsage: UsageSink = {};
        const rawContent = await callAnthropicSimple(model, systemPrompt, userPrompt!, 0.85, 4096, caUsage);

        // Parse the raw content
        let parsedContent: any = null;
        try {
          parsedContent = JSON.parse(rawContent);
        } catch {
          const match = rawContent.match(/\{[\s\S]*\}/);
          if (match) {
            try { parsedContent = JSON.parse(match[0]); } catch {}
          }
        }

        // Extract slides text for correction
        const slidesText = parsedContent?.content || rawContent;

        // Step 2: Correction pass for carousel
        const carouselCorrectionPrompt = `Tu es un éditeur de carrousels Instagram exigeant. Tu reçois un carrousel et tu dois le CORRIGER slide par slide.

CORRECTIONS OBLIGATOIRES — applique TOUTES celles qui s'appliquent :

1. SLIDE-TITRE (slide qui ne contient qu'1 phrase ou moins de 15 mots) :
   → Développer à 2-4 phrases. Ajouter un exemple, une nuance, un détail concret.
   → Exception : Slide 1 (hook) DOIT être courte (1-2 phrases max).

2. NUMÉROTATION DE CONSEILS ("Conseil 1", "Erreur n°2", "Étape 3", "Astuce") :
   → Supprimer la numérotation. Reformuler comme un moment dans un arc narratif.
   → "Conseil 1 : Soyez authentique" → "Ce que j'ai compris après 2 ans à copier les autres : l'authenticité n'est pas un style, c'est ce qui reste quand on arrête de performer."

3. SLIDES REDONDANTES (2 slides qui disent la même chose différemment) :
   → Fusionner en une seule slide plus dense, ou remplacer la plus faible par un nouvel angle.

4. MANQUE DE CONCRET (slide entièrement abstraite, sans exemple ni chiffre ni situation) :
   → Ajouter un détail concret : un cas, un chiffre, une phrase entendue, un avant/après.

5. SLIDE FINALE QUI RÉSUME :
   → Remplacer par une punchline qui OUVRE (question, tension non résolue, invitation) au lieu de fermer.

6. CAPTION FAIBLE (caption qui répète le contenu des slides) :
   → Le hook de la caption doit être DIFFÉRENT de la slide 1. La caption apporte un COMPLÉMENT, pas un résumé.

RÈGLES :
- Garde l'ARC NARRATIF du carrousel. Tu corriges les slides faibles, pas la structure globale.
- Chaque slide corrigée fait 2-4 phrases (sauf slide 1 : 1-2 phrases max).
- Le carrousel corrigé fait 1500-3000 caractères au total.
- Retourne le même format JSON que l'original avec les slides corrigées.

Réponds UNIQUEMENT en JSON :
{
  "content": "le carrousel complet corrigé avec les marqueurs 📌 SLIDE et 📝 CAPTION",
  "accroche": "le hook de la slide 1",
  "corrections_applied": ["liste courte des corrections faites"]
}`;

        const correctedRaw = await callAnthropicSimple(
          getModelForAction("content"),
          carouselCorrectionPrompt,
          `Voici le carrousel à corriger :\n\n"""\n${slidesText}\n"""`,
          0.3,
          4096,
          caCorrUsage
        );

        // Parse corrected content, fallback to original if correction fails
        let finalResult: any = null;
        try {
          finalResult = JSON.parse(correctedRaw);
        } catch {
          const match = correctedRaw.match(/\{[\s\S]*\}/);
          if (match) {
            try { finalResult = JSON.parse(match[0]); } catch { finalResult = null; }
          }
        }

        if (finalResult?.content) {
          const merged = {
            ...(parsedContent || {}),
            content: finalResult.content,
            accroche: finalResult.accroche || parsedContent?.accroche,
            format: parsedContent?.format || "carrousel",
            pillar: parsedContent?.pillar || "",
            objectif: parsedContent?.objectif || "",
          };

          await logUsage(userId, "content", "creative_flow", ((caUsage.total_tokens ?? 0) + (caCorrUsage.total_tokens ?? 0)) || undefined, caUsage.model, workspace_id);
          return new Response(JSON.stringify(merged), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fallback: return original
        await logUsage(userId, "content", "creative_flow", ((caUsage.total_tokens ?? 0) + (caCorrUsage.total_tokens ?? 0)) || undefined, caUsage.model, workspace_id);
        return new Response(JSON.stringify(parsedContent || { content: rawContent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Non-LinkedIn, non-Carousel (= POST Instagram + Pinterest) : streaming
      // par TOOL FORCÉ. Le prompt demande déjà un JSON `{content, accroche, …}` ;
      // en texte libre Sonnet le cassait par intermittence (fuite du blob ```json
      // au rendu). Le tool fait garantir le JSON par l'API — le stream recolle
      // les `input_json_delta`, donc le live « rédige en temps réel » est
      // préservé à l'identique (cf. streamAnthropicToolSSE). Relance serveur sur
      // overloaded / complétion vide conservée (bug post IG intermittent 10/07).
      return createClientSSEStream(
        () => streamAnthropicToolSSE(
          apiKey,
          model,
          systemPrompt,
          [{ role: "user", content: userPrompt! }],
          0.85,
          4096,
          POST_TOOL,
        ),
        corsHeaders,
        async (_full, usage) => {
          await logUsage(userId, "content", "creative_flow", usage?.total_tokens, usage?.model, workspace_id);
        },
        { failOnTruncation: true },
      );
    }

    // ── Call Anthropic ──
    let rawContent: string;
    // Une seule des branches ci-dessous s'exécute → un sink partagé suffit.
    const finalUsage: UsageSink = {};

    // Build files array (backward compatible)
    const filesArray: any[] = body.files || (body.fileBase64 ? [{ base64: body.fileBase64, mimeType: body.fileMimeType, name: "fichier" }] : []);

    // ═══ RECYCLAGE — PIPELINE PARALLÈLE PAR FORMAT ═══
    // Avant : UN appel Sonnet écrivait TOUS les formats demandés (max_tokens
    // 12288) → attente = somme des formats, et un échec/troncature emportait
    // tout (« coche moins de formats à la fois »). Même remède que les visuels
    // carrousel (#364) : un petit appel de PLAN (Haiku, sortie structurée)
    // analyse la source UNE fois et attribue à chaque format sa sous-idée —
    // la garantie anti-chevauchement est décidée là, pas ré-improvisée par
    // chaque appel — puis UN appel Sonnet PAR FORMAT en parallèle. L'attente
    // tombe au format le plus lent, et un format qui échoue est retenté seul
    // sans emporter les autres.
    if (step === "recycle") {
      const tRecycle = Date.now();
      const fmtIds: string[] = formats || [];
      if (fmtIds.length === 0) {
        return new Response(JSON.stringify({ error: "Aucun format demandé." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const recActivity = ctx?.profile?.activite || profile?.activite || "";
      const recTarget = ctx?.profile?.cible || profile?.cible || "";
      const recPiliers = ctx?.profile?.piliers || "";
      const requestedLabels = fmtIds.map((f) => formatLabels[f] || f);

      // ── Fichiers : mêmes validations que l'ancien chemin ──
      const filesContent: any[] = [];
      let pdfWarning = "";
      if (filesArray.length > 0) {
        let totalSize = 0;
        for (const f of filesArray) totalSize += (f.base64?.length || 0);
        if (totalSize > 27_000_000) { // ~20 Mo in base64
          return new Response(
            JSON.stringify({ error: "La taille totale des fichiers dépasse 20 Mo. Réduis le nombre ou la taille des fichiers." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Anthropic limit: max 5 PDFs
        let pdfCount = 0;
        for (const f of filesArray.slice(0, 10)) {
          if (f.mimeType === "application/pdf") {
            pdfCount++;
            if (pdfCount > 5) {
              pdfWarning = "\n⚠️ Note : seuls les 5 premiers PDFs ont été analysés (limite technique).";
              continue;
            }
            filesContent.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } });
          } else if (f.mimeType?.startsWith("image/")) {
            filesContent.push({ type: "image", source: { type: "base64", media_type: f.mimeType, data: f.base64 } });
          }
        }
      }

      // ── 1. PLAN (Haiku, tool forcé) : analyse, angle par format, synthèse ──
      // Les fichiers ne sont envoyés qu'ICI (une fois) : la synthèse fidèle
      // sert ensuite de source texte aux appels par format (pas de re-envoi
      // vision × N formats).
      const PLAN_TOOL = {
        name: "plan_recyclage",
        description: "Analyse du contenu source et attribution d'un angle DISTINCT à chaque format.",
        input_schema: {
          type: "object",
          properties: {
            message_central: { type: "string", description: "La thèse du contenu source en 1 phrase." },
            synthese_source: { type: "string", description: "Synthèse FIDÈLE du contenu source (10-20 phrases) : thèse, sous-idées, exemples et anecdotes, chiffres, et les expressions typiques de l'auteure recopiées VERBATIM. N'invente rien." },
            angles: {
              type: "array",
              description: "Un élément par format demandé.",
              items: {
                type: "object",
                properties: {
                  format: { type: "string", description: "Le nom du format tel que fourni." },
                  sous_idee: { type: "string", description: "La sous-idée de la source attribuée à ce format." },
                  angle: { type: "string", description: "L'angle d'attaque, clairement différent des autres formats." },
                },
                required: ["format", "sous_idee", "angle"],
              },
            },
          },
          required: ["message_central", "synthese_source", "angles"],
        },
      };

      const planUsage: UsageSink = {};
      let plan: any = null;
      try {
        const planText = `Analyse ce contenu source pour le recycler en ${fmtIds.length} format(s) : ${requestedLabels.join(", ")}.

Matrice d'affinités pour l'attribution :
- Carrousel : l'idée la plus PÉDAGOGIQUE.
- Reel : l'idée la plus PROVOCANTE ou CONTRE-INTUITIVE.
- Stories : l'angle le plus INTIME ou PERSONNEL.
- LinkedIn : l'angle le plus ENGAGÉ (prise de position).
- Newsletter : l'angle le plus PROFOND (réflexion complète).

Chaque format DOIT recevoir une sous-idée DIFFÉRENTE (dérivation, pas reformatage). Si deux formats risquent de se chevaucher, force un pivot : point d'entrée, question posée ou public visé différent.${pdfWarning}${sourceText ? `\n\nCONTENU SOURCE :\n"""\n${sourceText}\n"""` : ""}${filesContent.length > 0 ? `\n\n${sourceText ? "Le reste du" : "Le"} contenu source est dans les fichiers ci-dessus. Synthétise les informations clés de TOUS les fichiers, ne traite pas chaque fichier isolément.` : ""}`;
        const planRaw = await callAnthropic({
          model: getModelForAction("questions"),
          system: "Tu prépares le recyclage d'un contenu en plusieurs formats. Tu es FIDÈLE à la source : tu n'inventes aucun fait, aucun chiffre, aucune anecdote.",
          messages: [{ role: "user", content: [...filesContent, { type: "text", text: planText }] }],
          max_tokens: 2048,
          abortTimeoutMs: 60000,
          tool: PLAN_TOOL,
        }, planUsage);
        plan = tryParseAiJson<any>(planRaw, "creative-flow:recycle-plan");
      } catch (e: any) {
        console.warn("[creative-flow] recycle: plan échoué → angles libres par format", e?.message || e);
      }

      // Source des appels par format : le texte fourni, complété (ou remplacé,
      // cas fichiers-seuls) par la synthèse du plan.
      const sourceForFormats = [
        sourceText ? `"""\n${sourceText}\n"""` : "",
        filesArray.length > 0 && plan?.synthese_source ? `SYNTHÈSE FIDÈLE DES FICHIERS SOURCES :\n"""\n${plan.synthese_source}\n"""` : "",
      ].filter(Boolean).join("\n\n");
      if (!sourceForFormats) {
        return new Response(
          JSON.stringify({ error: "Impossible d'analyser les fichiers sources. Réessaie." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const angleFor = (f: string): { sous_idee?: string; angle?: string } => {
        const arr = Array.isArray(plan?.angles) ? plan.angles : [];
        const label = (formatLabels[f] || f).toLowerCase();
        const found = arr.find((a: any) => {
          const af = String(a?.format || "").toLowerCase();
          return af && (af.includes(label) || label.includes(af) || af.includes(f.toLowerCase()));
        });
        return found || arr[fmtIds.indexOf(f)] || {};
      };

      // ── 2. UN appel Sonnet PAR FORMAT, en parallèle ──
      const runFormat = async (f: string) => {
        const label = formatLabels[f] || f;
        const a = angleFor(f);
        const others = fmtIds
          .filter((x) => x !== f)
          .map((x) => {
            const ox = angleFor(x);
            return `- ${formatLabels[x] || x}${ox.angle ? ` : ${ox.angle}` : ""}`;
          })
          .join("\n");
        const angleBlock = a.angle
          ? `\n\nTON ANGLE (imposé par le plan éditorial, respecte-le) :\n- Sous-idée : ${a.sous_idee || ""}\n- Angle : ${a.angle}${others ? `\n\nLes AUTRES formats couvrent déjà ces angles — ne les reprends PAS :\n${others}` : ""}`
          : (others ? `\n\nD'autres formats recyclent aussi ce contenu (${fmtIds.filter((x) => x !== f).map((x) => formatLabels[x] || x).join(", ")}) : prends un angle qui leur laisse de la place.` : "");
        const fUsage: UsageSink = {};
        const raw = await callAnthropicSimple(
          getModelForAction("content"),
          buildRecycleSystemPrompt([f], formatLabels, COMMON_PREFIX, objectiveBlock, recActivity, recTarget, recPiliers),
          `Voici le contenu à recycler :\n\n${sourceForFormats}${angleBlock}\n\nRecycle-le en ${label}. Contenu complet et prêt à poster.`,
          f === "linkedin" ? 0.7 : 0.85,
          4096,
          fUsage,
        );
        const parsed = tryParseAiJson<any>(raw, `creative-flow:recycle:${f}`);
        const resultVal = parsed?.results?.[f]
          ?? (parsed?.results && typeof parsed.results === "object" ? Object.values(parsed.results)[0] : null);
        const topicVal = parsed?.topics?.[f]
          ?? (parsed?.topics && typeof parsed.topics === "object" ? Object.values(parsed.topics)[0] : null);
        if (!resultVal) throw new Error(`recycle ${f} : résultat vide`);
        return { f, resultVal, topicVal, usage: fUsage };
      };

      const settled: (Awaited<ReturnType<typeof runFormat>> | null)[] = await Promise.all(
        fmtIds.map((f) => runFormat(f).catch((e) => {
          console.error(`[creative-flow] recycle: format ${f} en échec (1er essai)`, e?.message || e);
          return null;
        })),
      );
      // 2e chance séquentielle pour les formats tombés (surcharge transitoire) —
      // un format qui échoue n'emporte plus les autres.
      for (let i = 0; i < fmtIds.length; i++) {
        if (!settled[i]) {
          settled[i] = await runFormat(fmtIds[i]).catch((e) => {
            console.error(`[creative-flow] recycle: format ${fmtIds[i]} abandonné après 2 essais`, e?.message || e);
            return null;
          });
        }
      }

      const ok = settled.filter(Boolean) as Awaited<ReturnType<typeof runFormat>>[];
      if (ok.length === 0) {
        // Aucun crédit consommé sur une génération entièrement ratée (pas de logUsage).
        return new Response(
          JSON.stringify({ error: "La génération a échoué en cours de route. Réessaie." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results: Record<string, unknown> = {};
      const topics: Record<string, unknown> = {};
      for (const r of ok) {
        results[r.f] = r.resultVal;
        if (r.topicVal) topics[r.f] = r.topicVal;
      }
      const failedFormats = fmtIds.filter((f) => !(f in results));

      const totalTokens = (planUsage.total_tokens || 0) + ok.reduce((s, r) => s + (r.usage.total_tokens || 0), 0);
      await logUsage(userId, "content", "creative_flow", totalTokens || undefined, ok[0]?.usage.model, workspace_id);
      console.log(JSON.stringify({
        type: "recycle_timing",
        formats: fmtIds.length,
        failed: failedFormats.length,
        with_files: filesArray.length,
        duration_ms: Date.now() - tRecycle,
      }));
      return new Response(
        JSON.stringify({ results, topics, ...(failedFormats.length > 0 ? { failed_formats: failedFormats } : {}) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (step === "questions" && body.photo_mode && body.photos?.[0]?.base64) {
      // Vision-anchored questions: let Claude SEE ALL photos (1..10) to ask grounded questions.
      const validPhotosQ = body.photos.filter((p: any) => p?.base64).slice(0, 10);
      const photoCountQ = validPhotosQ.length;
      const seriesModeQ: "single" | "before_after" | "series" =
        photoCountQ === 1 ? "single" : photoCountQ === 2 ? "before_after" : "series";

      const perPhotoContextsQ = validPhotosQ.map((p: any) => p?.context?.trim() || null);

      const visionQuestionsPrompt = buildVisionQuestionsPrompt({
        contentType,
        context,
        objective,
        photo_description: body.photo_description,
        per_photo_context: perPhotoContextsQ[0] || null,
        per_photo_contexts: perPhotoContextsQ,
        photo_count: photoCountQ,
        series_mode: seriesModeQ,
      });

      const questionsContent: any[] = [];
      validPhotosQ.forEach((p: any, i: number) => {
        const { media_type, data } = extractImagePayload(String(p.base64), p.mimeType);
        if (photoCountQ > 1) {
          questionsContent.push({ type: "text", text: `Photo ${i + 1}/${photoCountQ}${p?.context?.trim() ? ` — contexte : "${p.context.trim()}"` : ""} :` });
        }
        questionsContent.push({ type: "image", source: { type: "base64", media_type, data } });
      });
      questionsContent.push({ type: "text", text: visionQuestionsPrompt });

      // En mode photo, les RÈGLES de questions (sujet-boussole, variété, JSON…) sont
      // déjà portées par `visionQuestionsPrompt` (message user). On n'envoie donc PAS le
      // gros system prompt du step `questions` non-photo, qui les dupliquait et entrait en
      // léger conflit (ex. « chaque question DOIT contenir un mot du sujet » vs « 1 des 3
      // peut s'appuyer sur la photo »). On conserve uniquement ce que le vision prompt
      // n'a pas : la voix de marque, le vocabulaire métier et la mémoire anti-répétition.
      const visionSystemPrompt = `${QUESTIONS_PREFIX}
${brandingContext ? `\nCONTEXTE BRANDING DE L'UTILISATRICE :\n${brandingContext}\n` : ""}${brandVocabBlock}${recentBriefsContext ? `\n══ MÉMOIRE ANTI-RÉPÉTITION ══\nSujets DIFFÉRENTS déjà traités récemment :\n${recentBriefsContext}\nN'importe JAMAIS leur contenu, vocabulaire ou scènes dans tes questions sur le sujet courant — sert uniquement à ne pas reposer une question identique.\n` : ""}`;

      rawContent = await callAnthropic({
        model: getModelForAction("content"),
        system: visionSystemPrompt,
        messages: [{ role: "user", content: questionsContent }],
        temperature: 0.8,
        max_tokens: 1500,
        // Questions ancrées sur photos : plus lourd (upload images) mais reste
        // borné — 60s/tentative évite le blocage indéfini d'un fetch qui traîne.
        abortTimeoutMs: 60000,
        tool: QUESTIONS_TOOL,
      }, finalUsage);
    } else if (step === "generate" && body.photo_mode && body.photos?.[0]?.base64) {
      // Photo mode with vision: send 1 to 10 images to Claude — format-aware prompt.
      // 1 = scène unique. 2 = "avant / après" (transformation). 3+ = "série / reportage".
      const validPhotos = body.photos.filter((p: any) => p?.base64).slice(0, 10);
      const isBeforeAfter = validPhotos.length === 2;
      const isSeries = validPhotos.length >= 3;

      const { formatBrief, jsonShape } = buildVisionGenerateBrief(contentType);
      const isLinkedInPhoto = !!contentType?.includes("linkedin");

      const photoContent: any[] = [];

      // RÈGLES CRITIQUES placées AVANT les images (LinkedIn) : Claude lit les
      // interdits avant de "voir" les photos, ce qui réduit l'amorçage descriptif.
      if (isLinkedInPhoto) {
        photoContent.push({
          type: "text",
          text: `══ RÈGLES CRITIQUES À LIRE AVANT DE REGARDER LES IMAGES ══

1. ANTI-PARAPHRASE VISUELLE : tu n'as PAS le droit d'écrire "Ce [adjectif] [objet], c'est…" pour désigner ce que tu vois.
   ❌ "Ce flyer orange et jaune, c'est l'événement Aire You Ready."
   ❌ "Cette affiche colorée, c'est…"
   ✅ Tu peux NOMMER le sujet directement : "Aire You Ready, c'est…" / "Vendredi soir, on était…"

2. ANTI-CASCADE : pas de rafale de phrases courtes pour faire "punchy".
   ❌ "Pas un musée à cocher. Un verre au comptoir. Une conversation qui s'étire."
   ✅ Une seule pensée qui se déroule : "C'était pas un musée à cocher mais un verre au comptoir, une conversation qui s'étire."

3. ANTI-CTA FABRIQUÉ : pas de slogan-invitation en italique ou guillemets.
   ❌ « Ici, il se passe quelque chose. Venez. »
   ✅ Une phrase qui coupe net, ou une question concrète liée au sujet.

4. CHIFFRES / NUMÉROS / DATES / NOMS VISIBLES : recopie EXACTEMENT. Si tu vois "#3", écris "#3", jamais "#8".

5. VOIX = JE (ton vécu) + NOUS/ON inclusif. Le "TU" reste rare, pour une interpellation ponctuelle : jamais comme adresse de tout le texte, jamais de "vous". Une amie au café, pas une audience. (Sauf si la voix de marque indique un autre registre.)

══ MAINTENANT, REGARDE LES IMAGES ══
`,
        });
      }

      validPhotos.forEach((p: any, idx: number) => {
        const { media_type, data } = extractImagePayload(String(p.base64), p.mimeType);
        photoContent.push({
          type: "image",
          source: { type: "base64", media_type, data },
        });
        // IMPORTANT : ne JAMAIS injecter "Photo 1/N" en texte — le modèle l'imite
        // dans sa sortie. On garde un label uniquement pour le mode AVANT/APRÈS
        // (sémantique nécessaire) et pour le contexte par photo s'il existe.
        const ctx = p.context?.trim();
        if (isBeforeAfter) {
          const label = idx === 0 ? "↑ AVANT" : "↑ APRÈS";
          photoContent.push({ type: "text", text: ctx ? `${label} — contexte : "${ctx}"` : label });
        } else if (ctx) {
          // Série ou single : on attache le contexte directement à l'image
          // précédente, sans numéro, pour ne pas amorcer un phrasé "Photo X".
          photoContent.push({ type: "text", text: `↑ Contexte sur l'image ci-dessus : "${ctx}"` });
        }
      });

      const modeInstr = isBeforeAfter
        ? `\n\n🔄 MODE AVANT / APRÈS : la 1ère image = état AVANT, la 2nde = état APRÈS. Raconte LA transformation comme un récit unique (le déclic, le geste, le résultat). Ne décris pas chaque image séparément.`
        : isSeries
        ? `\n\n📸 MODE SÉRIE (${validPhotos.length} images) : ces images traitent d'UN MÊME sujet. Trouve le fil thématique commun et écris UN SEUL message qui s'appuie sur l'ensemble. NE liste PAS les images. NE numérote PAS ("photo 1, photo 2" est interdit). Pas de structure "étape 1, étape 2". \n\nINTERDIT d'enchaîner des transitions descriptives type "Ce X visible sur une image, c'est… Ce Y visible sur une autre, c'est…". Le post doit parler du SUJET, pas faire le tour des images.\n\nSi tu n'identifies pas de fil commun évident, reste sur l'observation la plus universelle qui les relie — n'invente pas une chronologie ou un récit qui ne tient pas.`
        : "";


      const answersBlockPhoto = (answers && Array.isArray(answers) && answers.length > 0)
        ? answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}"\n→ "${a.answer}"`).join("\n\n")
        : "";

      const userSubjectBlock = (context && String(context).trim())
        ? `══ SUJET DÉCLARÉ PAR L'UTILISATRICE (PRIORITÉ ABSOLUE) ══\n"${String(context).trim()}"\n\nC'est CE sujet que le post doit traiter. Les photos ILLUSTRENT / appuient, elles ne dictent PAS l'angle.\nSi une photo te suggère un angle différent de ce sujet, ignore-le et reste sur le sujet déclaré.\nLes réponses aux questions ci-dessous servent à ENRICHIR ce sujet, pas à le remplacer.\n\n`
        : "";

      photoContent.push({
        type: "text",
        text: `${userSubjectBlock}${formatBrief}${body.photo_description ? `\nDescription complémentaire des photos (contexte secondaire) : "${body.photo_description}"` : ""}${answersBlockPhoto ? `\n\n══ RÉPONSES DE L'UTILISATRICE (matière SOURCE pour enrichir le sujet ci-dessus) ══\n${answersBlockPhoto}` : ""}${modeInstr}\n\n══ RÈGLE ANTI-FABRICATION (CRITIQUE) ══\n- N'invente AUCUN détail non vérifiable : prénom, chiffre, citation, lieu, date, nom de client/projet, dialogue, sentiment précis, anecdote.\n- Si un chiffre, un numéro d'édition (ex. "#3"), une date, un nom propre, un slogan est VISIBLE sur une image, recopie-le EXACTEMENT. N'invente JAMAIS un numéro, une date ou un nom que tu n'as pas lu littéralement sur la photo (ex. ne transforme PAS "#3" en "#8").\n- Tu peux UNIQUEMENT t'appuyer sur : (1) le SUJET DÉCLARÉ ci-dessus, (2) ce que tu VOIS littéralement sur les photos, (3) la description complémentaire, (4) les réponses ci-dessus.\n- Si la matière manque pour étoffer, BASCULE sur un registre RÉFLEXIF / MÉTA lié AU SUJET DÉCLARÉ : observation sociologique, lecture culturelle, questionnement ouvert, constat sensoriel. C'est TOUJOURS préférable à une anecdote inventée.\n${answersBlockPhoto ? "" : "- Aucune réponse n'a été fournie : écris un post 100% RÉFLEXIF / MÉTA ancré sur LE SUJET DÉCLARÉ. INTERDICTION FORMELLE de récit fictif, de personnages, de scènes ou de dialogues inventés.\n"}- Évite absolument les formulations type "ce jour-là, X m'a dit…", "je me souviens quand…", "il y a 3 ans…", "j'ai croisé…" si ces éléments ne sont PAS explicitement dans les réponses.\n- En cas de doute entre raconter ou observer : OBSERVE. Mieux vaut un post un peu plus court et juste qu'un post étoffé d'éléments inventés.\n\n⚠️ INTERDICTION ABSOLUE de recopier un exemple textuel. Génère du contenu ORIGINAL ancré dans LE SUJET DÉCLARÉ + CES image(s) + les réponses fournies.\n\nRéponds UNIQUEMENT en JSON :\n${jsonShape}`,
      });

      rawContent = await callAnthropic({
        model: getModelForAction("content"),
        system: systemPrompt,
        messages: [{ role: "user", content: photoContent }],
        temperature: isLinkedInPhoto ? 0.7 : 0.85,
        max_tokens: 4096,
      }, finalUsage);
    } else {
      // 8192 pour la génération de contenu : le JSON reel (script + duplicata `sections`
      // + `lecture_test` + shot list) dépasse le défaut de 4096 de callAnthropicSimple
      // → stop_reason "max_tokens" → échec systématique en ~40 s. Un plafond haut ne
      // coûte rien tant qu'il n'est pas consommé.
      const maxTokens = step === "questions" ? 800 : step === "hooks" ? 1400 : step === "recycle" ? 12288 : 8192;
      const isLinkedInText = !!contentType?.includes("linkedin") && step !== "questions";
      const tempText = isLinkedInText ? 0.7 : 0.85;
      // L1 : Haiku pour les steps `questions` et `follow-up` (3-5× plus rapide que Sonnet,
      // suffisant pour des questions structurées en JSON). Sonnet reste pour la génération de contenu.
      const modelForCall = (step === "questions" || step === "follow-up")
        ? getModelForAction("questions")
        : getModelForAction("content");
      // Questions/follow-up = appels Haiku courts et bornés : on plafonne chaque
      // tentative à 30s pour qu'un fetch qui traîne bascule vite en retry plutôt
      // que de faire patienter l'utilisatrice >1 min sur le chemin d'activation.
      const abortMs = (step === "questions" || step === "follow-up") ? 30000 : step === "hooks" ? 45000 : undefined;
      // `hooks` reste sur le modèle content (Sonnet) : le hook est LE levier de
      // rétention du reel, la qualité prime sur les ~5 s gagnées avec Haiku.
      const structuredTool = step === "questions" ? QUESTIONS_TOOL : step === "follow-up" ? FOLLOW_UP_TOOL : step === "hooks" ? HOOKS_TOOL : undefined;
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

    // (step === "recycle" ne passe plus par ici : pipeline parallèle dédié plus haut.)

    // ═══ PASSE DE CORRECTION LinkedIn ═══
    // Pour TOUT post LinkedIn généré (photo ou texte), on rejoue une 2ᵉ passe
    // spécialisée qui chasse cascades, anaphores, formules manufacturées, CTA génériques.
    // En photo_mode, on SKIP la 2ᵉ passe pour éviter le double appel Anthropic
    // (vision déjà coûteuse en wall-time). Les règles anti-broetry sont déjà
    // injectées AVANT les images dans le prompt photo LinkedIn (lignes 1272+).
    if (
      step === "generate" &&
      contentType?.includes("linkedin") &&
      !body.photo_mode &&
      parsed && typeof parsed === "object" &&
      typeof parsed.content === "string" &&
      parsed.content.length >= 200
    ) {
      try {
        // Gate rédactionnel (lots 3+4) : mesures en code injectées dans la
        // passe de correction existante — retournements (1 max), formules
        // moulées, chiffres sans source (liste blanche = brief + réponses + actu).
        const liAllowed = numbersIn([
          typeof body.context === "string" ? body.context : "",
          body.answers ? JSON.stringify(body.answers) : "",
          typeof body.news_context === "string" ? body.news_context : "",
          fullContext || "",
        ].join("\n"));
        const liRedac = analyzeTextRedac(parsed.content, liAllowed);
        const corrected = await applyCorrectionPass(parsed.content, "linkedin", {
          logger: (msg) => console.log(msg),
          // Édition mécanique à règles fermées → Haiku (cf. #364)
          model: "claude-haiku-4-5",
          extraInstructions: buildTextFixInstructions(liRedac) || undefined,
        });
        if (corrected && corrected.length >= 100) {
          parsed.content = corrected;
        }
      } catch (corrErr) {
        console.error("[creative-flow] correction-pass linkedin failed:", corrErr);
      }
    }

    // ═══ PASSE QUALITÉ REEL (audit reels 12/07) ═══
    // Le reel était le seul format riche sans filet post-génération. Trois étages :
    // 1. face_cam=non : enforcement déterministe de la structure (format_type,
    //    format_visuel, plan_tournage) — la passe texte ne touche pas ces champs.
    // 2. Correction JSON-aware (textes seuls, via bloc balisé) avec instructions
    //    ciblées mesurées en code : chiffres sans source (redac-gate) + fuites de
    //    gabarit ("SAUVEGARDE", "Nouveau Reel" : 8/8 au corpus d'audit).
    // 3. Recalibrage déterministe des durées : la durée affichée découle du texte
    //    réel (2,5 mots/s). Mesuré à l'audit : durées déclarées sous-estimées de
    //    40-80 % (90 s réelles annoncées "50 sec" = pénalité de distribution).
    if (isReel && step === "generate" && parsed && typeof parsed === "object" && Array.isArray(parsed.script)) {
      if (body.face_cam === "non" && enforceReelNoFaceCam(parsed)) {
        console.log("[creative-flow] reel face_cam=non : structure convertie en voix off");
      }
      // Hook CHOISI à l'étape hook_selection : verrouillé sur la section 1 AVANT
      // la correction (la génération peut paraphraser, la correction peut « améliorer » —
      // ni l'une ni l'autre ne décide à la place de l'utilisatrice).
      const hasChosenHook = enforceSelectedReelHook(parsed, body.selected_hook);
      try {
        const reelAllowed = numbersIn([
          typeof body.context === "string" ? body.context : "",
          body.pre_gen_answers ? JSON.stringify(body.pre_gen_answers) : "",
          body.selected_hook ? JSON.stringify(body.selected_hook) : "",
          typeof body.news_context === "string" ? body.news_context : "",
          fullContext || "",
        ].join("\n"));
        const reelRedac = analyzeTextRedac(reelAuditableText(parsed), reelAllowed);
        const extras: string[] = [];
        const redacFix = buildTextFixInstructions(reelRedac);
        if (redacFix) extras.push(redacFix);
        const leaks = reelTemplateLeaks(parsed);
        if (leaks.length) {
          extras.push(`FUITES DE GABARIT DÉTECTÉES (réécris chacune) :\n${leaks.map((l) => `- ${l}`).join("\n")}`);
        }
        if (body.face_cam === "non") {
          extras.push(`CE REEL EST EN VOIX OFF (l'utilisatrice ne se montre pas) : aucun texte parlé ne doit dire "regarde la caméra" ni supposer qu'on la voit parler.`);
        }
        if (hasChosenHook || (typeof body.selected_hook?.text === "string" && body.selected_hook.text.trim() && !body.selected_hook.text.trim().startsWith("("))) {
          extras.push(`LE HOOK ([SECTION 1 - PARLE] et [SECTION 1 - OVERLAY]) A ÉTÉ CHOISI PAR L'UTILISATRICE : recopie-le STRICTEMENT à l'identique, ne le réécris sous aucun prétexte (la règle "hook faible" ne s'applique pas à lui).`);
        }
        // Plafond de mots par objectif (calibrage du brief), mesuré en code :
        // au re-test post-#527, la visibilité sortait encore à ~95 mots (cible
        // 40-80). La durée affichée est honnête (recalibrage), mais un reel
        // reach doit rester court → coupe pilotée par la passe de correction.
        const reelWordCap = effectiveObjective === "visibilite" ? 80
          : (effectiveObjective === "confiance" || effectiveObjective === "vente" || effectiveObjective === "credibilite") ? 190
          : 150;
        const reelWords = countReelSpokenWords(parsed);
        if (reelWords > reelWordCap) {
          extras.push(`TROP LONG POUR L'OBJECTIF "${effectiveObjective || "standard"}" : ${reelWords} mots parlés, plafond ${reelWordCap}. COUPE le texte parlé à ${reelWordCap} mots maximum : supprime les redites, la mise en contexte longue et les exemples secondaires. Ne touche PAS à la couche mécanisme (le POURQUOI) ni au hook. C'est une exception explicite à la règle "±10 %".`);
        }
        // Édition mécanique à règles fermées → Haiku (même choix que LinkedIn/carrousel).
        const corrected = await applyCorrectionPassReel(parsed, {
          logger: (msg) => console.log(msg),
          model: "claude-haiku-4-5",
          extraInstructions: extras.length ? extras.join("\n\n") : undefined,
        });
        if (corrected && typeof corrected === "object") {
          Object.assign(parsed, corrected);
        }
      } catch (corrErr) {
        console.error("[creative-flow] correction-pass reel failed:", corrErr);
      }
      // Filets déterministes TOUJOURS appliqués, même si la correction a échoué :
      // - le hook choisi reste verrouillé (l'instruction de la passe est probabiliste) ;
      // - lecture_test = concat des texte_parle FINAUX (sinon le monologue affiché
      //   diverge du script corrigé — faille trouvée à la revue du 12/07) ;
      // - timings recomptés sur la version FINALE du texte.
      enforceSelectedReelHook(parsed, body.selected_hook);
      rebuildReelLectureTest(parsed);
      recalibrateReelTimings(parsed);
    }

    // ═══ RÉSOLUTION PHOTOS BIBLIOTHÈQUE (stories, lot B) ═══
    // photo_index (petit entier émis par l'IA) → photo_id (UUID user_photos),
    // de façon déterministe : correspondance stricte, jamais deux stories sur
    // la même photo, et uniquement quand la story attend un fond photo.
    if (isStories && step === "generate" && storiesPhotoCatalog.length > 0 && Array.isArray(parsed?.stories)) {
      const byIndex = new Map(storiesPhotoCatalog.map((c) => [c.index, c]));
      const usedPhotoIds = new Set<string>();
      for (const s of parsed.stories) {
        const v = s?.visual;
        if (!v || typeof v !== "object") continue;
        const idx = typeof v.photo_index === "number" ? v.photo_index : null;
        delete v.photo_index;
        if (idx === null) continue;
        const cat = byIndex.get(idx);
        if (!cat || v.background !== "photo" || usedPhotoIds.has(cat.id)) continue;
        v.photo_id = cat.id;
        v.photo_library_description = cat.description;
        usedPhotoIds.add(cat.id);
      }
      // Garantie lot D : toute photo CHOISIE par l'utilisatrice que l'IA n'a
      // pas placée est distribuée aux stories à fond photo restées sans photo,
      // dans l'ordre de la séquence. Ses photos finissent TOUJOURS dans le
      // résultat (c'était la demande de base du parcours).
      const leftoverPreferred = storiesPhotoCatalog.filter(
        (c) => c.preferred && !usedPhotoIds.has(c.id),
      );
      if (leftoverPreferred.length > 0) {
        for (const s of parsed.stories) {
          if (leftoverPreferred.length === 0) break;
          const v = s?.visual;
          if (!v || typeof v !== "object") continue;
          if (v.background !== "photo" || v.photo_id) continue;
          const next = leftoverPreferred.shift()!;
          v.photo_id = next.id;
          v.photo_library_description = next.description;
          usedPhotoIds.add(next.id);
        }
      }
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
