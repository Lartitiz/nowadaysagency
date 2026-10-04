import { matchFinalPhotos, PHOTO_MATCH_RESERVE_MS } from "./final-photo-match.ts";
import { buildConfirmedStructureBlock } from "./confirmed-structure.ts";
import { createContinuousNarrative, NarrativePhotoMismatch } from "./continuous-narrative.ts";
import { COMMON, PLAN, REPAIR } from "../_shared/carousel-editorial-contract.ts";
import { reviewCarouselProgression, progressionReceipt, progressionWarnings, type ProgressionSource, type ProgressionResult } from "../_shared/carousel-progression.ts";
import { carouselEditorialFields } from "../_shared/carousel-editorial-review.ts";
import { PHOTO_NARRATIVE_CONTRACT, PHOTO_QUESTIONS_CONTRACT } from "./photo-narrative.ts";
import { autoMaxSlides, carouselLength, carouselLengthPrompt, carouselStructureIssues, longTextSlides, structureRepairInstruction } from "../_shared/carousel-length.ts";
import { preservesCarouselScenario } from "../_shared/carousel-thread.ts";
import { coverKind, coverRewritePrompt, enforceCover } from "../_shared/carousel-cover.ts";
import { photoWritingPrompt, mixWritingPrompt, textWritingPrompt, NEWS_WRITING } from "./variant-writing.ts";
import { callCarouselWriter, pickCarouselWriter, CAROUSEL_WRITER_VERSION } from "./writer.ts";
import { authoredContentSource, currentContentContract, testimonySourceText } from "../_shared/editorial-voice.ts";
import { CONTENT_CLARITY_RULES } from "../_shared/content-clarity.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildIdentityBlock, buildBrandGuardText } from "../_shared/user-context.ts";
import { checkQuota, isQaTestAccount, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { callAnthropic, getModelForAction, SONNET_MODEL, AnthropicError, type UsageSink, type AnthropicModel, type AnthropicOptions } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { EDITORIAL_ANGLES_REFERENCE } from "../_shared/copywriting-prompts.ts";
import { photoReadingContract, buildCarouselWritingSystem, carouselSubstance, CAROUSEL_CONTINUITY, CAROUSEL_TITLES as SLIDE_TITLE_RULES, CAROUSEL_WRITING_VERSION } from "./writing-contract.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError, clampAiField } from "../_shared/input-validators.ts";
import { carouselNeedsPolish, extractCarouselTexts, reinjectCarouselTexts } from "../_shared/correction-pass.ts";
import { audienceAddressRule, enforceAudienceAddress, parseAudienceAddress, type AudienceAddress, type AudienceAddressPass } from "../_shared/audience-address.ts";
import { applyAudienceAddressPass } from "../_shared/audience-address-pass.ts";
import { runRedacGate, applyGuardedCarouselCorrection, analyzeCarouselRedac, numbersIn, type CaptionEndingRule } from "../_shared/redac-gate.ts";
import { logContentQuality } from "../_shared/content-quality.ts";
import { fetchPreviousHooks } from "../_shared/previous-hooks.ts";
import { limitVisualSchemas } from "../_shared/schema-limit.ts";
import { addSchemasToContent } from "../_shared/schema-formatting.ts";
import { keepDraftLayoutFields, stripMixWriterLayoutFields } from "../_shared/mix-layout-formatting.ts";
import { runWithHeartbeatSSE, type StatusEmitter } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { fetchDepthMaterial, buildDepthBlock } from "../_shared/depth-research.ts";
import { livedCaseFromCarouselBody } from "../_shared/lived-case.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { buildSeriesContext } from "../_shared/series-context.ts";
import { extractImagePayload } from "../_shared/image-utils.ts";
import { mergeConfirmedStructure, normalizePhotoIndexes, countCarouselSlides, maxStructurePhotoIndex, normalizeOverlayStyles, analyzeMixComposition, assignDistinctStructurePhotos } from "../_shared/photo-slide-structure.ts";
import { assignPhotoTemplates, assignTemplatesToProvidedSlides, revalidatePhotoLayoutContent, stripWriterLayoutFields } from "../_shared/photo-template-assign.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";

// ── Seam d'injection de dépendances (tests) ──
// Indirection pure : en prod, ces champs pointent vers les imports ci-dessus
// et le comportement est identique en tout point. Les tests (index_test.ts)
// remplacent un ou plusieurs de ces champs pour observer/court-circuiter les
// appels réseau (Supabase, Anthropic) sans toucher à la logique métier.
export const _deps = {
  runPipeline,
  checkQuota,
  logUsage,
  callAnthropic,
  callCarouselWriter,
  reviewThread: reviewCarouselProgression,
  prepareNarrative: createContinuousNarrative,
  matchPhotos: matchFinalPhotos,
  fetchDepthMaterial,
  audienceAddressPass: applyAudienceAddressPass,
};

// ── Sortie structurée pour les deepening_questions ──
// Même pattern que creative-flow (#359) : le tool forcé (tool_choice) fait
// garantir le JSON par l'API elle-même — fini les 502 « réponse IA illisible »
// quand Haiku glisse un guillemet non échappé ou un saut de ligne brut dans du
// JSON texte. Prompts inchangés : seule la couche de transport devient déterministe.
const QUESTIONS_TOOL = {
  name: "poser_questions",
  description: "Retourne les 3 questions d'approfondissement à poser à l'utilisatrice.",
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

const PHOTO_QUESTIONS_TOOL = {
  ...QUESTIONS_TOOL,
  description: "Zéro à deux précisions essentielles, sans questionnaire obligatoire.",
  input_schema: {
    ...QUESTIONS_TOOL.input_schema,
    properties: { questions: { ...QUESTIONS_TOOL.input_schema.properties.questions, maxItems: 2 } },
  },
};

// Rédaction uniquement : Opus 5.5 normal / Astra medium en Qualité Max.
// Les suggestions, questions, corrections et visuels gardent leurs modèles.
const pickCarouselModel = pickCarouselWriter;

// Modèle de la PASSE DE CORRECTION anti-patterns IA. La correction est une
// édition mécanique à règles fermées : en qualité normale, Haiku la tient et
// réduit la latence perçue de la phase texte (les 2 appels étant séquentiels).
// En Mode qualité Max on garde Sonnet, cohérent avec la promesse du toggle.
function pickCorrectionModel(body: any): AnthropicModel {
  return body?.quality_max ? SONNET_MODEL : "claude-haiku-4-5";
}

// ── Helpers contexte par photo ──
// L'ordre des photos correspond à l'ordre d'envoi côté front (post-reorder UX).
// `context` (max 200 chars, validé Zod) provient du champ optionnel par photo dans PhotoUploadZone.
function buildPhotoContextRecap(photos: Array<{ context?: string; libraryContext?: string }> | undefined): string {
  if (!photos?.length) return "";
  const lines = photos.map((p, i) => [
    p.context?.trim() ? `Photo ${i + 1} — contexte fourni par la personne : ${p.context.trim()}` : "",
    p.libraryContext?.trim() ? `Photo ${i + 1} — indications de bibliothèque, potentiellement déduites : ${p.libraryContext.trim()}` : "",
  ].filter(Boolean).join("\n")).filter(Boolean);
  return lines.length ? `\nCONTEXTE PAR PHOTO :\n${lines.join("\n")}\nLes indications de bibliothèque aident à reconnaître l'image ; elles ne prouvent ni origine, fabrication, identité, chronologie, résultat ni vécu. Le contexte explicite de la personne prime.\n` : "";
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

// ── Régime « texte d'abord » (lot 1 casting) ──
// Le carrousel mixte est rédigé SANS photos : chaque slide photo sort avec une
// photo_directive (l'image idéale, en français) + photo_query_en (mots-clés banque
// d'images) + éventuellement library_photo_index (match STRICT dans le catalogue
// bibliothèque envoyé par le front). Le casting des images se fait ensuite, slide
// par slide, dans l'écran résultat.
function buildTextFirstBlock(body: any): string {
  if (!body?.text_first) return "";
  const catalog = Array.isArray(body.photo_catalog) ? body.photo_catalog : [];
  const catalogBlock = catalog.length > 0
    ? `\n═══ CATALOGUE BIBLIOTHÈQUE (photos existantes de l'utilisatrice) ═══\n${catalog.map((p: any) => `- Photo ${p.index}${p.kind ? ` [${p.kind}]` : ""} : ${p.description}`).join("\n")}\n\nRÈGLE DE MATCHING (STRICTE) : pour une slide photo, si UNE photo du catalogue correspond VRAIMENT à sa directive (même sujet ET même ambiance — pas juste le même thème), renseigne "library_photo_index" avec son numéro. AU MOINDRE DOUTE → null. Un carrousel avec des slides « image à choisir » vaut mieux qu'un faux match. N'assigne jamais deux fois la même photo du catalogue.\n`
    : "";
  return `\n═══ RÉGIME « TEXTE D'ABORD » — AUCUNE PHOTO FOURNIE ═══

Ce carrousel est rédigé AVANT que les images existent : l'utilisatrice choisira ou créera chaque image ENSUITE, slide par slide. Le récit commande ; les images serviront le récit — jamais l'inverse.

RÈGLES SPÉCIFIQUES (remplacent les règles de composition liées aux photos fournies) :
- Slides photo (photo_full + photo_integrated) : entre 2 et 4 MAXIMUM. Chaque image devra être trouvée ou créée par l'utilisatrice — sois économe, ne mets une slide photo que là où une image PORTE le récit. La règle « au moins 50% de slides photo » ne s'applique PAS ici.
- Slide 1 = photo_full (hook visuel). Dernière slide = text_only.
- "photo_index" : TOUJOURS null sur toutes les slides (aucune photo n'est fournie).
- Pour CHAQUE slide photo, renseigne EN PLUS :
  · "photo_directive" : 1-2 phrases en FRANÇAIS décrivant l'image idéale — concrète et tournable (sujet précis, cadrage, lumière, ambiance), ancrée dans l'activité et l'univers de l'utilisatrice, cohérente avec l'overlay de la slide. Pas de « une jolie photo inspirante ».
  · "photo_query_en" : 2-4 mots-clés en ANGLAIS pour une banque d'images (ex : "hands pottery clay").
  · "library_photo_index" : numéro du catalogue si match STRICT, sinon null.${catalog.length === 0 ? ` (Aucun catalogue fourni : null partout.)` : ""}
  · "news_entity" : SI le contexte actualité porte sur une personnalité, une marque, une œuvre ou un événement PRÉCIS et nommé, ET que CETTE slide gagnerait à montrer une vraie photo de presse de cette entité, renseigne le nom exact tel qu'on le chercherait dans une banque d'images (ex : "Zendaya", "Patagonia", "Jeux Olympiques Paris"). Sinon null. Au plus 1-2 slides avec news_entity.
- INTERDIT dans photo_directive : demander l'image d'une personnalité réelle, d'une marque tierce ou d'un événement d'actualité précis (droit à l'image). L'image illustre TON propos et TON terrain — l'actu vit dans le TEXTE des slides. Une photo réelle de l'entité ne peut venir QUE d'une banque de presse libre de droits, via "news_entity" : la photo_directive reste l'alternative générique SANS l'entité.
${catalogBlock}`;
}

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

// ── Sortie structurée du carrousel mixte (tool forcé) ──
// Même patron que le fix #359 (questions creative-flow) : le tool_choice fait
// garantir le JSON par l'API elle-même. Sans lui, une photo sans rapport avec
// le brief faisait répondre le modèle en PROSE (refus poli) dans `content`
// (reproduit 3/3 les 09-10/07) : parse impossible côté front, message
// générique « réessaie » mensonger, et crédit déjà débité. Avec le tool forcé
// la prose est impossible : soit un carrousel, soit un refus STRUCTURÉ via
// `photo_mismatch` — traité en aval par une erreur actionnable SANS logUsage.
// Le schéma reste volontairement lâche (pas de `required` sur les slides,
// additionalProperties implicite) : les prompts mix/actu/texte-d'abord
// restent la source de vérité du contenu, le tool ne fige que le transport.
// Champ partagé par les trois tools (mix, photo, structure) : wording du seuil
// « dernier recours » validé par #488, précisé après observation live sur le
// chemin photo (refus 2/2 d'une photo de tour de potier pour un sujet « du
// tour à l'émaillage » : le modèle exigeait que la photo couvre TOUT le
// process). Couverture partielle ≠ contradiction : la photo se répète et les
// textes portent le reste. Le relâcher refait refuser des photos choisies
// délibérément par l'utilisatrice.
const PHOTO_MISMATCH_FIELD = {
  type: "object",
  description:
    "DERNIER RECOURS, presque jamais utilisé. À remplir UNIQUEMENT si des photos sont fournies ET que le SUJET TAPÉ par l'utilisatrice promet de MONTRER une chose concrète et nommable (un lieu précis, un objet précis, un processus précis) que les photos contredisent frontalement — au point qu'aucun carrousel honnête n'est possible même en assumant le décalage. PAR DÉFAUT tu génères : l'utilisatrice a choisi ses photos délibérément. Seul le sujet tapé peut faire une promesse visuelle — jamais le contexte branding. Un sujet identitaire ou abstrait (« qui je suis », « mon univers », « mes valeurs »…) ne promet rien de visuel : jamais de refus dans ce cas. Un décalage d'ambiance, de style, d'esthétique ou d'univers de marque n'est PAS un motif ; tu ne peux pas non plus juger si la personne sur une photo est l'utilisatrice elle-même. Une photo qui ne montre qu'UNE étape, UN moment ou UN aspect du sujet n'est PAS un motif non plus : couverture partielle ≠ contradiction — la photo peut se répéter d'une slide à l'autre et les textes racontent ce que l'image ne montre pas. Une photo inutilisable parmi plusieurs s'écarte individuellement, elle ne justifie jamais un refus global. Si tu hésites, génère le carrousel (et ne remplis pas ce champ).",
  properties: {
    reason: {
      type: "string",
      description:
        "1-2 phrases en français, adressées directement à l'utilisatrice (tutoiement), décrivant UNIQUEMENT le décalage constaté entre la ou les photos et le sujet. AUCUNE recommandation ni question (l'app ajoute la marche à suivre).",
    },
  },
  required: ["reason"],
};

// Rappel des motifs de refus interdits, injecté dans le message SYSTEM des trois
// chemins vision (mix, photo, structure_proposal). La description du tool ne
// suffit pas : observé 3× en live le 17/08 (fixtures e2e + branding savonnerie),
// le modèle refusait pour « univers de marque », « esthétique glamour » et « ne
// montrent ni toi » — trois motifs que PHOTO_MISMATCH_FIELD interdit déjà. Il
// décide de refuser en lisant brief + CONTEXTE BRANDING dans le system, et ne
// rencontre l'interdit du tool qu'au moment de remplir le champ : trop tard.
// V2 (retest live post-déploiement, même jour) : le refus persistait en se
// COULANT dans l'exception autorisée — sujet « …mon univers… » lu comme une
// promesse de montrer l'univers savonnerie du branding, puis photos jugées « à
// mille lieues de l'univers artisanal ». D'où les trois verrous ajoutés : seul
// le SUJET TAPÉ fait une promesse visuelle (jamais le branding), un sujet
// identitaire/abstrait ne promet rien de visuel (refus interdit), et une photo
// inutilisable parmi plusieurs s'écarte au lieu de tout refuser.
// Le seuil de refus lui-même ne bouge pas (#488) : un vrai hors-sujet (le sujet
// promet de MONTRER une chose concrète que les photos contredisent) doit
// toujours être refusé — avec description utilisateur la garde laissait déjà
// passer, le bug n'existait QUE sans description.
const PHOTO_MISMATCH_SYSTEM_REMINDER = `

══════════════════════════════════════
PHOTOS FOURNIES — TU GÉNÈRES, TU NE JUGES PAS
══════════════════════════════════════
L'utilisatrice a choisi ses photos délibérément : PAR DÉFAUT tu génères avec.
Le refus (photo_mismatch) est un DERNIER RECOURS, réservé au SEUL cas suivant : le SUJET TAPÉ par l'utilisatrice promet de montrer une chose CONCRÈTE et NOMMABLE (un lieu précis, un objet précis, un processus précis) que les photos contredisent frontalement — ex. sujet « visite de mon nouvel atelier » avec pour seule photo une plage déserte.
RÈGLES ABSOLUES :
- Seul le sujet tapé peut faire une promesse visuelle. Le CONTEXTE BRANDING n'en fait JAMAIS : il sert à écrire les textes, PAS à juger les photos. Le raisonnement « son activité/son univers est X, donc les photos devraient montrer X » est INTERDIT.
- Un sujet identitaire ou abstrait (« qui je suis », « mon univers », « mes valeurs », « ce que je veux transmettre », « les coulisses », « mon parcours »…) ne promet AUCUN contenu visuel précis : avec un tel sujet, le refus est INTERDIT quelles que soient les photos — n'importe quelle photo choisie par l'utilisatrice peut incarner qui elle est.
- NE SONT JAMAIS des motifs de refus : un décalage d'ambiance, de style ou d'esthétique (« trop glamour », « trop générique »…) ; un décalage avec l'univers, l'activité ou le positionnement de la marque ; l'identité des personnes photographiées (tu ne peux pas savoir si c'est l'utilisatrice ou non) ; une couverture partielle du sujet (la photo se répète et les textes portent le reste).
- Si UNE photo parmi plusieurs te semble vraiment inutilisable, écarte-la ou répète les autres (l'écart individuel est prévu) : une photo problématique ne justifie JAMAIS un refus global.
Si l'utilisatrice a décrit ses photos, sa description fait foi sur ce qu'elles montrent et pourquoi elle les a choisies. Si tu hésites, génère.`;

const FIL_FIELD = {
  type: "object",
  description: "Plan du fil, écrit AVANT les slides : arrivee = proposition précise que le texte développe, pas le thème ni un parcours de photos ; etapes = étapes du raisonnement/récit qui y mènent, pas liste des objets montrés.",
  properties: { arrivee: { type: "string" }, etapes: { type: "array", items: { type: "string" } } },
};

const MIX_CAROUSEL_TOOL = {
  name: "livrer_carrousel_mixte",
  description:
    "Livre le carrousel mixte final (slides + caption), OU signale via photo_mismatch que les photos fournies ne permettent pas de traiter le brief.",
  input_schema: {
    type: "object",
    properties: {
      photo_mismatch: PHOTO_MISMATCH_FIELD,
      fil: FIL_FIELD,
      carousel_type: { type: "string" },
      chosen_angle: {
        type: "object",
        properties: { title: { type: "string" }, description: { type: "string" } },
      },
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slide_number: { type: "number" },
            slide_type: { type: "string" },
            photo_index: { type: ["number", "null"] },
            role: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            overlay_text: { type: "string" },
            visual_anchor: { type: "string" },
            photo_directive: { type: "string" },
            photo_query_en: { type: "string" },
            library_photo_index: { type: ["number", "null"] },
            note: { type: "string" },
          },
        },
      },
      caption: {
        type: "object",
        properties: {
          hook: { type: "string" },
          body: { type: "string" },
          cta: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
        },
      },
      quality_check: { type: "object" },
    },
  },
};

// Même patron pour le carrousel PHOTO : mêmes symptômes reproduits que sur le
// mix (refus en prose → parse KO front, « réessaie » mensonger, crédit débité).
// Champs alignés sur les specs JSON de buildPhotoCarouselPrompt /
// buildPhotoCarouselNewsReactionPrompt ; schéma volontairement lâche, les
// prompts restent la source de vérité du contenu.
const PHOTO_CAROUSEL_TOOL = {
  name: "livrer_carrousel_photo",
  description:
    "Livre le carrousel photo final (slides + caption), OU signale via photo_mismatch que les photos fournies ne permettent pas de traiter le brief. Un carrousel photo compte PLUSIEURS slides (typiquement 4 à 8) même avec une seule photo — voir le nombre visé dans les instructions. Ne livre JAMAIS un carrousel d'une ou deux slides.",
  input_schema: {
    type: "object",
    properties: {
      photo_mismatch: PHOTO_MISMATCH_FIELD,
      fil: FIL_FIELD,
      carousel_type: { type: "string" },
      chosen_angle: {
        type: "object",
        properties: { title: { type: "string" }, description: { type: "string" } },
      },
      slides: {
        // Le tool forcé devient le contrat de sortie : sans ce rappel, le modèle
        // ignorait la règle de comptage du prompt (« 1 photo unique → 4-6 slides,
        // pas 8 ») isolée dans CAS PARTICULIERS, et livrait 1 slide (observé 2/2).
        description:
          "Toutes les slides du carrousel, dans l'ordre. Respecte le nombre de slides des instructions : typiquement 4 à 8. Une photo unique se RÉPÈTE sur plusieurs slides, chaque slide portant une étape du propos adapté au sujet — elle ne se résume JAMAIS à une seule slide.",
        type: "array",
        items: {
          type: "object",
          properties: {
            slide_number: { type: "number" },
            role: { type: "string" },
            photo_index: { type: ["number", "null"] },
            slide_type: { type: "string" },
            photo_description: { type: "string" },
            overlay_text: { type: "string" },
            overlay_style: { type: "string" },
            visual_anchor: { type: "string" },
            overlay_position: { type: "string", enum: ["top_left", "top_center", "bottom_left", "bottom_center", "center"] },
            note: { type: "string" },
            kicker: { type: ["string", "null"], description: "Titre court de la slide (≤6 mots), facultatif ; toujours null sur la couverture." },
            detail: { type: ["string", "null"], description: "Ligne de détail (≤12 mots), facultative ; sur la couverture : sous-titre seulement s'il apporte quelque chose." },
            cta_label: { type: ["string", "null"], description: "Dernière slide : texte de la pastille d'invitation (≤6 mots), null si aucune." },
          },
        },
      },
      caption: {
        type: "object",
        properties: {
          hook: { type: "string" },
          body: { type: "string" },
          cta: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
        },
      },
      quality_check: { type: "object" },
    },
  },
};

// Même patron pour le step structure_proposal : l'IA voit les photos en vision
// et peut refuser en prose de la même façon. L'appel est GRATUIT (pas de
// logUsage) mais un refus en prose casse le parse → « Erreur lors de la
// proposition de structure » + repli sur une génération directe qui re-refuse,
// en payant un appel de plus. Champs alignés sur le JSON demandé par
// structureSystemPrompt.
const EDITORIAL_INTENT_FIELD = {type:"object",required:["mode","idea","reader_takeaway","basis_source_ids","inferred"],properties:{mode:{type:"string",enum:["recit","explication","argumentation","reflexion","comparaison","liste","serie_visuelle"]},idea:{type:"string"},reader_takeaway:{type:"string"},basis_source_ids:{type:"array",items:{type:"string"}},inferred:{type:"boolean"}}};

const STRUCTURE_PROPOSAL_TOOL = {
  name: "livrer_structure_carrousel",
  description:
    "Livre la structure narrative proposée pour le carrousel, OU signale via photo_mismatch que les photos fournies ne permettent pas de traiter le brief.",
  input_schema: {
    type: "object",
    properties: {
      photo_mismatch: PHOTO_MISMATCH_FIELD,
      editorial_intent: EDITORIAL_INTENT_FIELD,
      strategic_rationale: { type: "string" },
      narrative_thread: { type: "string" },
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slide_number: { type: "number" },
            role: { type: "string" },
            title_suggestion: { type: "string" },
            strategic_note: { type: "string" },
            contribution: {type:"string"}, inherits:{type:"string"}, develops:{type:"string"}, image_role:{type:"string"}, source_ids:{type:"array",items:{type:"string"}},
            story_beat: { type: "string" },
            photo_observation: { type: "string", description: "Observation visuelle littérale, sans fabrication, intention ni usage supposé ; ambiguïtés comprises." },
            image_relation: { type: "string", description: "Rôle de la photo : preuve visible, illustration, ambiance ou écho. Le texte peut raconter des faits de marque non visibles." },
            factual_basis: { type: "string", description: "Faits utilisables et leur source (brief/réponses/marque), observations ou interprétation explicitement présentée comme telle. Aucun fait déduit du scénario lui-même." },
            photo_index: { type: ["number", "null"] },
            slide_type: { type: "string" },
            visual_anchor: { type: "string" },
            overlay_position: { type: "string", enum: ["top_left", "top_center", "bottom_left", "bottom_center", "center"] },
          },
        },
      },
      total_slides: { type: "number" },
      carousel_type: { type: "string" },
    },
  },
};

// ── Budget temps des passes de correction/gate (audit timeouts 17/08) ──
// applyCorrectionPassCarousel tournait SANS limite, y compris via runRedacGate
// (2e passe conditionnelle) : un fetch qui traîne sur CETTE étape légère
// (Haiku, 4096 tokens) pendait indéfiniment. 60s aligné "génération standard"
// (CLAUDE.md), même convention que audit-instagram-ai (#861).
const CORRECTION_ABORT_MS = 60_000;

// ── Budget temps GLOBAL de la requête (mesure live 30/09) ──
// Un carrousel texte prenait ~190 s (rédaction + juge ~95 s, puis deux relectures
// ~40 s chacune) et chaque étape facultative a son propre plafond (réparation
// 120 s, juge 30 s par tentative, relecture 60 s). Empilés un jour d'API lente,
// ils dépassent la coupure de la plateforme (~400 s), qui perd TOUT le
// carrousel. Passé ces seuils l'étape facultative n'est plus lancée : on livre
// ce qui est écrit (défauts de fil signalés en avertissement, comme en vision).
// Jamais atteints en conditions normales (réparation décidée vers 100-115 s).
const REPAIR_START_LIMIT_MS = 150_000;
const REVIEW_START_LIMIT_MS = 270_000;
// Étage SCHÉMAS (03/10/2026) : lancé seulement s'il reste du temps avant la
// coupure de la plateforme (~400 s) ; il s'arrête de lui-même à 25 s.
/** Schémas sur le carrousel mixte : dessinés par mix-slide-layouts (slide « pause »). */
export const MIX_SCHEMAS_ENABLED = true;
const SCHEMA_START_LIMIT_MS = 330_000;
const schemasAllowed = (startedAt: number): boolean => {
  const ok = Date.now() - startedAt <= SCHEMA_START_LIMIT_MS;
  if (!ok) console.log(JSON.stringify({ type: "carousel_time_budget", skipped: "schemas", elapsed_ms: Date.now() - startedAt }));
  return ok;
};
// Délai de la RÉDACTION texte (04/10/2026) : 3 générations sur 8 coupées à
// 120 s fixes (« La rédaction a dépassé le délai prévu »), alors qu'Opus 5.5 en
// réflexion adaptative écrit un carrousel long en 100-150 s et que la recherche
// « creuser le sujet » (≤ 25 s) passe avant. La rédaction a donc jusqu'à 240 s
// après le début de la requête (jamais moins de 120 s) : au-delà, les relectures
// (≤ 270 s), le juge (270 s) et les schémas (330 s) se coupent d'eux-mêmes et la
// réponse part avant la coupure de la plateforme (~400 s) et du client (400 s).
// Plus de temps pour écrire, jamais de texte raccourci.
const WRITE_DEADLINE_MS = 240_000;
const WRITE_MIN_TIMEOUT_MS = 120_000;
export const writerTimeoutMs = (startedAt: number, now = Date.now()): number =>
  Math.max(WRITE_MIN_TIMEOUT_MS, WRITE_DEADLINE_MS - (now - startedAt));
const reviewAllowed = (startedAt: number): boolean => {
  const ok = Date.now() - startedAt <= REVIEW_START_LIMIT_MS;
  if (!ok) console.log(JSON.stringify({ type: "carousel_time_budget", skipped: "review", elapsed_ms: Date.now() - startedAt }));
  return ok;
};

// ── Plancher déterministe de slides (audit carrousel photo 12/07) ──
// Structure confirmée → on attend EXACTEMENT sa longueur ; sinon min(4, cible).
function carouselSlideFloor(body: any, defaultTarget: number): number {
  if (Array.isArray(body.confirmed_structure) && body.confirmed_structure.length > 0) {
    return body.confirmed_structure.length;
  }
  return Math.min(4, carouselLength(body).exact || defaultTarget);
}

// UN retry quand le modèle livre un carrousel écrasé (entre 1 slide et le plancher).
// 0 slide n'est PAS retryé : c'est le territoire de carouselMismatchResponse (refus
// photo_mismatch légitime — re-générer re-refuserait en payant un appel de plus).
// Les tokens du retry s'AJOUTENT au sink principal (Object.assign écraserait).
async function retryIfTooShort(
  content: string,
  doGenerate: (sink: UsageSink) => Promise<string>,
  usage: UsageSink,
  floor: number,
  label: string,
): Promise<string> {
  const got = countCarouselSlides(content);
  if (got === 0 || got >= floor) return content;
  console.warn(`[carousel-ai] ${label}: ${got} slide(s) < plancher ${floor} → retry unique`);
  const retrySink: UsageSink = {};
  try {
    const retried = await doGenerate(retrySink);
    usage.input_tokens = (usage.input_tokens || 0) + (retrySink.input_tokens || 0);
    usage.output_tokens = (usage.output_tokens || 0) + (retrySink.output_tokens || 0);
    usage.total_tokens = (usage.total_tokens || 0) + (retrySink.total_tokens || 0);
    const retriedCount = countCarouselSlides(retried);
    console.log(`[carousel-ai] ${label}: retry → ${retriedCount} slide(s)`);
    // On garde le meilleur des deux runs — jamais pire qu'avant.
    return retriedCount > got ? retried : content;
  } catch (e) {
    console.error(`[carousel-ai] ${label}: retry plancher échoué, contenu court conservé`, e);
    return content;
  }
}

// Refus structuré commun aux chemins mix et photo : à appeler AVANT correction,
// post-traitements et logUsage. Si le tool forcé a renvoyé photo_mismatch (ou un
// carrousel vide), rien n'est livré → on ne débite RIEN et on remonte une erreur
// actionnable (changer de photo ou passer en texte design) à la place du
// générique « réessaie » — qui, ici, redonnerait le même refus.
// Retourne null si un carrousel a bien été livré.
function carouselMismatchResponse(
  content: string,
  body: any,
  usage: UsageSink,
  label: string,
  corsHeaders: Record<string, string>,
): Response | null {
  const parsed: any = tryParseAiJson(content, "carousel-ai:mismatch-check"); // théoriquement impossible d'échouer : tool forcé
  const hasSlides = Array.isArray(parsed?.slides) && parsed.slides.length > 0;
  if (hasSlides) return null;
  const mismatchReason = typeof parsed?.photo_mismatch?.reason === "string"
    ? parsed.photo_mismatch.reason.trim()
    : "";
  const plural = (body.photos?.length || 0) > 1;
  const message = mismatchReason
    ? `${plural ? "Tes photos ne semblent pas correspondre" : "Ta photo ne semble pas correspondre"} à ton idée : ${mismatchReason}${/[.!?…]$/.test(mismatchReason) ? "" : "."} Change de photo${plural ? "s" : ""} ou passe en carrousel « Texte design » pour garder ton idée telle quelle. Aucun crédit n'a été décompté.`
    : "L'IA a renvoyé un carrousel vide. Réessaie — aucun crédit n'a été décompté.";
  console.warn(`[carousel-ai] ${label}: ${mismatchReason ? "photo_mismatch" : "carrousel vide"} — ${usage.total_tokens ?? "?"} tokens (${usage.model ?? "?"}) NON débités${mismatchReason ? ` — ${mismatchReason}` : ""}`);
  return new Response(JSON.stringify({
    error: mismatchReason ? "photo_mismatch" : "empty_carousel",
    message,
  }), {
    // 200 volontaire : l'erreur structurée doit passer par l'event SSE
    // `done` (runWithHeartbeatSSE) pour que le front lise error+message.
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Le plan peut proposer ces deux positions malgré l'enum du tool. Les
// gabarits actuels les rendent déjà centrées, en conservant haut/bas.
// Normaliser à la sortie ET à la reprise d'un ancien plan évite un rejet
// avant écriture, sans modifier ses textes, son ordre ou ses photos.
/** Type de slide écrit par le modèle de structure : il répond parfois « text »
 * ou « photo » au lieu des valeurs attendues (vu en live le 04/10/2026 : la
 * génération photo échouait sur « Données invalides : slide_type … 'text' »).
 * Variante reconnue → valeur attendue ; inconnue → undefined (champ facultatif). */
export function normalizeSlideType(v: unknown): "photo_full" | "photo_integrated" | "text_only" | undefined {
  const t = String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["photo_full", "photo_integrated", "text_only"].includes(t)) return t as any;
  if (["text", "texte", "textonly", "text_slide", "texte_seul"].includes(t)) return "text_only";
  if (["photo", "full_photo", "photo_plein_ecran", "fullphoto"].includes(t)) return "photo_full";
  if (["integrated", "photo_integree", "integrated_photo"].includes(t)) return "photo_integrated";
  return undefined;
}

function normalizeGeneratedPlanFields(slide: any): void {
  if (!slide || typeof slide !== "object") return;
  // Les champs optionnels non renseignés reviennent parfois à null depuis
  // le modèle, notamment photo_index pour une slide sans photo. Le front
  // renvoie le plan tel quel : null et absence ont ici le même sens.
  // Ne jamais toucher aux champs obligatoires ou à une valeur renseignée.
  for (const key of ["photo_index", "slide_type", "story_beat", "visual_anchor", "photo_observation", "image_relation", "factual_basis", "overlay_position"]) {
    if (slide[key] === null) delete slide[key];
  }
  if ("slide_type" in slide) {
    const t = normalizeSlideType(slide.slide_type);
    if (t) slide.slide_type = t; else delete slide.slide_type;
  }
  if (slide.overlay_position === "top_right") slide.overlay_position = "top_center";
  if (slide.overlay_position === "bottom_right") slide.overlay_position = "bottom_center";
}

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
    const livedCase = livedCaseFromCarouselBody(body);
    const tellsOwnCase = livedCase.provided && ["express_full", "slides", "hooks"].includes(type);
    const brandingContext = formatContextForAI(ctx, tellsOwnCase ? { ...CONTEXT_PRESETS.posts, includeStory: false } : CONTEXT_PRESETS.posts);
    if (livedCase.provided) console.log(`[carousel-ai] cas personnel fourni (${livedCase.reasons.join(", ")}) — ton cas d'abord, recherche en appui`);
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
    let systemPrompt = buildSystemPrompt(brandingContext, isLinkedIn, ctx.profile, livedCase.provided, audienceAddress) + "\n" + photoReadingContract(body);
    if (body.editorial_intent) systemPrompt += "\nINTENTION DU PLAN AUTOMATIQUE (proposition à confronter aux sources) :\n" + JSON.stringify(body.editorial_intent);

    // Recherche « creuser le sujet » (lot D-bis, audit qualité 11-12/07) : on va
    // chercher ce qu'il y a sous le sujet (mécanisme réel, lecture sociale, faits
    // sourcés) pour éviter le traitement de surface. Depuis le 04/10/2026 elle tourne
    // aussi avec une actu ou des réponses : l'actu ne donne que le déclencheur et les
    // réponses le vécu, aucun des deux n'apporte les faits qui étayent une position.
    // Condiment : échec 100 % silencieux, borné à 25 s.
    // « Ton cas d'abord » (04/10/2026) : avec un cas personnel fourni, la recherche
    // ne fait que vérifier ou appuyer un point de ce cas (mode « support »).
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
      ? `\n\nACTUALITÉ FOURNIE (faits de référence) :\n${newsContext.trim()}\n${NEWS_WRITING}`
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
      researchNumbersCap: livedCase.provided ? 1 : undefined,
      testimonySource,
      brandGuardText,
      audienceAddress,
      captionEndingRule,
      recentBriefsContext,
      previousHooks,
      brandVocabBlock,
      newsContext,
      corsHeaders,
      emitStatus,
      startedAt,
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

// ── Handlers par type de requête ──
// Le handler serve() ci-dessus ne fait que le setup partagé (quota, contexte
// utilisatrice, systemPrompt, gates) puis aiguille vers une de ces fonctions
// selon `body.type`. Chaque fonction correspond exactement à une ancienne
// branche du if/else — extraction mécanique, aucun changement de comportement.

interface CarouselRequestContext {
  body: any;
  currentAuthoredText: string;
  currentBrief: string;
  semanticReviewEnabled: boolean;
  userId: string;
  workspaceId: any;
  category: string;
  isLinkedIn: boolean;
  systemPrompt: string;
  brandingContext: string;
  gateInputText: string;
  /** Matière de recherche (incluse dans gateInputText) : ses chiffres seuls exigent leur source. */
  researchText?: string;
  /** Cas personnel fourni : au plus N chiffres venus de la seule recherche (redac-gate, « Ton cas d'abord »). */
  researchNumbersCap?: number;
  /** Brief + réponses + photos + actu : seule source d'un témoignage ou d'un vécu au passé (redac-gate). */
  testimonySource?: string;
  /** Champs de marque bruts (buildBrandGuardText) : passages à ne jamais recopier tels quels. */
  brandGuardText: string;
  /** Tu ou vous de la fiche de marque ; null = aucun réglage, aucun contrôle. */
  audienceAddress: AudienceAddress | null;
  captionEndingRule: CaptionEndingRule | undefined;
  recentBriefsContext: string;
  /** Accroches déjà écrites sur CE sujet : garde déterministe anti-redite (24/08). */
  previousHooks: string[];
  brandVocabBlock: string;
  newsContext: any;
  corsHeaders: Record<string, string>;
  emitStatus: StatusEmitter;
  /** Début de la requête (Date.now()) : budget temps global des étapes facultatives. */
  startedAt: number;
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

// ── Queue commune de génération ──
// ── Fil du carrousel (16/09/2026) ──
// Relecture du carrousel ENTIER par un juge court (_shared/carousel-thread.ts),
// puis réparation par le rédacteur quand des défauts sont nommés : slides qui
// se répètent, permutables, rubriques posées à part, sortie du cas de départ.
// `inspect` = checks structurels déterministes (texte). Sans `regenerate`
// (chemins vision : renvoyer les photos coûterait un 2e appel plein tarif), on
// mesure et on avertit seulement — les défauts restent visibles dans
// structure_warnings. Une réparation n'est gardée que si elle fait mieux.
async function repairCarouselStructure(content: string, opts: {
  body: any;
  label: string;
  emitStatus: StatusEmitter;
  usage: UsageSink;
  startedAt: number;
  inspect?: (content: string) => string[];
  regenerate?: (
    draft: string,
    defects: string,
    sink: UsageSink,
  ) => Promise<string>;
}): Promise<{ content: string; repaired: boolean }> {
  const inspect = opts.inspect ||
    ((value: string) =>
      carouselStructureIssues(tryParseAiJson(value), opts.body));
  const issues = inspect(content);
  if (
    !issues.length || !opts.regenerate ||
    Date.now() - opts.startedAt > REPAIR_START_LIMIT_MS
  ) return { content, repaired: false };
  const sink: UsageSink = {};
  try {
    opts.emitStatus("correcting");
    const candidate = await opts.regenerate(
      content,
      "DÉFAUTS STRUCTURELS :\n" + issues.join("\n") + "\n" +
        structureRepairInstruction(issues),
      sink,
    );
    const parsed = tryParseAiJson<any>(candidate);
    const plan = opts.body.confirmed_structure || opts.body.slide_structure;
    const matchesPlan = !plan?.length ||
      (parsed?.slides?.length === plan.length &&
        plan.every((ref: any, i: number) =>
          [
            "photo_index",
            "slide_type",
            ...(opts.body.scenario_origin === "automatic" ? [] : ["role"]),
          ].every((key) =>
            ref[key] == null || parsed.slides[i]?.[key] === ref[key]
          )
        ));
    if (
      countCarouselSlides(candidate) > 0 && matchesPlan &&
      !inspect(candidate).length
    ) return { content: candidate, repaired: true };
  } catch {
    /* The original recoverable draft remains available. */
  } finally {
    for (
      const key of ["input_tokens", "output_tokens", "total_tokens"] as const
    ) opts.usage[key] = (opts.usage[key] || 0) + (sink[key] || 0);
  }
  // Réparation refusée ou en échec : le brouillon d'origine reste, et la
  // réparation du fil (finalizeCarousel) garde sa chance de passer.
  return { content, repaired: false };
}

async function finalizeCarousel(
  content: string,
  ctx: CarouselRequestContext,
  opts: {
    usage: UsageSink;
    repaired?: boolean;
    reserveMs?: number;
    regenerate?: (
      draft: string,
      defects: string,
      sink: UsageSink,
      abortTimeoutMs?: number,
    ) => Promise<string>;
  },
): Promise<string> {
  let doc: any = tryParseAiJson(content, "carousel-ai:final-progression");
  if (!doc?.slides?.length) return content;
  const { body, startedAt } = ctx;
  const sources: ProgressionSource[] = [
    {
      id: "request",
      provenance: "user",
      text: [
        body.subject,
        body.subject_details,
        body.photo_description,
        ctx.currentAuthoredText,
        body.deepening_answers ? JSON.stringify(body.deepening_answers) : "",
        body.editorial_angle,
        body.objective,
      ].filter(Boolean).join("\n"),
    },
    { id: "brand", provenance: "brand_context", text: ctx.brandingContext },
    {
      id: "photo_context",
      provenance: "user_context_and_separate_library_inferences",
      text: buildPhotoContextRecap(body.photo_contexts || body.photos),
    },
    {
      id: "photo_observations",
      provenance:
        "visual_observation_inferred_by_planner_not_verified_identity_or_history",
      text: JSON.stringify(
        (body.confirmed_structure || []).map((s: any) => ({
          photo: s.photo_index,
          observation: s.photo_observation,
        })),
      ),
    },
    {
      id: "news",
      provenance: "provided_reference",
      text: typeof ctx.newsContext === "string" ? ctx.newsContext : "",
    },
  ].filter((s) => s.text.trim());
  const remaining = () => 270_000 - (opts.reserveMs || 0) - (Date.now() - startedAt);
  const judge = async (value: any): Promise<ProgressionResult> =>
    remaining() < 8_000
      ? progressionReceipt(value, "skipped", "time-budget")
      : _deps.reviewThread(value, {
        sources,
        sourceContext: JSON.stringify(sources),
        preserveStructure: true,
        abortTimeoutMs: Math.min(45_000, remaining()),
      });
  const ownsText = body.type === "slides" || body.user_slides?.length;
  let receipt = ownsText
    ? await progressionReceipt(doc, "skipped", "user-authored")
    : await judge(doc);
  const recordUsage = (r: ProgressionResult) => {
    for (
      const k of ["input_tokens", "output_tokens", "total_tokens"] as const
    ) opts.usage[k] = (opts.usage[k] || 0) + (r.usage?.[k] || 0);
  };
  recordUsage(receipt);
  const baseline = doc;
  const minorContinuity = receipt.verdict === "acceptable" &&
    receipt.report?.defects?.some((d: any) => d.severity === "minor" &&
      ["unclear_idea", "promise", "juxtaposition", "repetition", "rupture", "ending"].includes(d.type));
  const initialDefectCount = receipt.report?.defects?.length ?? 0;
  // A single shared repair budget. No retry if a prior structural repair was attempted.
  if (
    !ownsText && !opts.repaired && opts.regenerate &&
    receipt.execution_status === "completed" &&
    (receipt.verdict === "needs_repair" || minorContinuity) && remaining() >= 85_000
  ) {
    const sink: UsageSink = {};
    let repairReason = "candidate-failed-invariants";
    let candidateStatus: string | undefined;
    let candidateVerdict: string | null | undefined;
    try {
      ctx.emitStatus("correcting");
      const draft = JSON.stringify(doc);
      const candidate: any = tryParseAiJson(
        await opts.regenerate(
          draft,
          REPAIR + "\nDÉFAUTS DE FIL :\n" + receipt.issues.join("\n") +
            "\nMême nombre, ordre et associations photo. Sources :\n" +
            JSON.stringify(sources),
          sink,
          Math.min(120_000, remaining() - 55_000),
        ),
      );
      // Exact photo/type/order protection; only a genuinely automatic plan may change roles/intents.
      const scenario = (v: any) =>
        (body.scenario_origin === "automatic" || (!body.scenario_origin && !body.confirmed_structure?.length))
          ? {
            ...v,
            slides: v?.slides?.map((slide: any) => ({
              ...slide,
              role: undefined,
              story_beat: undefined,
              visual_anchor: undefined,
              photo_observation: undefined,
              image_relation: undefined,
              factual_basis: undefined,
            })),
          }
          : v;
      const facts = (v: any) =>
        analyzeCarouselRedac(v, numbersIn(ctx.gateInputText), undefined, undefined, undefined, ctx.testimonySource);
      const prev = facts(doc), next = facts(candidate);
      // Une réécriture du juge final n'ajoute ni témoignage ni vécu au passé inventés.
      const invented = (a: ReturnType<typeof facts>) => (a.inventedTestimonials?.length ?? 0) + (a.inventedExperiences?.length ?? 0);
      const priorNumbers = new Set(
        prev.fabricatedNumbers.map((x) => x.split(" ")[0]),
      );
      const rawChanged = doc.slides.some((slide: any, i: number) =>
        (doc.no_overlay || slide.no_overlay) &&
        carouselEditorialFields({ slides: [candidate?.slides?.[i]] }).length > 0
      );
      const idChanged = doc.slides.some((slide: any, i: number) =>
        slide.id !== candidate?.slides?.[i]?.id
      );
      const originalText = carouselEditorialFields(doc).map((f) => f.text).join(
        "\n",
      );
      const candidateText = carouselEditorialFields(candidate).map((f) =>
        f.text
      ).join("\n");
      const allowed = numbersIn(ctx.gateInputText);
      const lostNumber = [...numbersIn(originalText)].some((n) =>
        allowed.has(n) && !numbersIn(candidateText).has(n)
      );
      const quotes = [
        ...originalText.matchAll(/«\s*([^»]+?)\s*»|“([^”]+)”|"([^"\n]{6,})"/g),
      ].map((m) => (m[1] || m[2] || m[3]).trim());
      const lostQuote = quotes.some((q) =>
        ctx.gateInputText.includes(q) && !candidateText.includes(q)
      );
      if (
        !rawChanged && !idChanged &&
        preservesCarouselScenario(scenario(doc), scenario(candidate)) &&
        !carouselStructureIssues(candidate, body).length && !lostNumber &&
        !lostQuote && !next.fabricatedNumbers.some((x) =>
          !priorNumbers.has(x.split(" ")[0])
        ) && next.durationConflicts.length <= prev.durationConflicts.length &&
        invented(next) <= invented(prev)
      ) {
        // Recompute deterministic fields only. Never mutate text after the final judge.
        const measured = await runRedacGate(JSON.stringify(candidate), {
          isLinkedIn: ctx.isLinkedIn,
          inputText: ctx.gateInputText,
          researchText: ctx.researchText,
          researchNumbersCap: ctx.researchNumbersCap,
          testimonySource: ctx.testimonySource,
          correction: { enabled: false },
        });
        const finalCandidate: any = tryParseAiJson(measured.content);
        const checked = await judge(finalCandidate);
        recordUsage(checked);
        candidateStatus = checked.execution_status;
        candidateVerdict = checked.verdict;
        repairReason = checked.execution_status !== "completed" ? `review-${checked.execution_status}` : "candidate-not-acceptable-or-not-improved";
        if (
          checked.execution_status === "completed" &&
          checked.verdict === "acceptable" &&
          // For an already acceptable draft, retain a rewrite only when the
          // final reviewer finds strictly fewer defects overall.
          (!minorContinuity || (Array.isArray(checked.report?.defects) &&
            checked.report.defects.length < initialDefectCount))
        ) {
          doc = finalCandidate;
          receipt = checked;
          repairReason = "accepted";
          doc.editorial_review = {
            ...baseline.editorial_review,
            status: "superseded_by_global_repair",
          };
        }
      }
    } catch {
      repairReason = "repair-failed";
      /* Preserve the original reviewed draft and its defects. */
    } finally {
      receipt.repair = { attempted: true, accepted: doc !== baseline,
        trigger: minorContinuity ? "minor_continuity" : "needs_repair",
        reason:repairReason,candidate_status:candidateStatus,candidate_verdict:candidateVerdict };
      for (
        const k of ["input_tokens", "output_tokens", "total_tokens"] as const
      ) opts.usage[k] = (opts.usage[k] || 0) + (sink[k] || 0);
    }
  }
  doc.editorial_intent = doc.editorial_intent ?? body.editorial_intent;
  if (doc.narrative_draft?.repair?.reason === "final-review-pending") {
    doc.narrative_draft.review = receipt;
    doc.narrative_draft.repair = { attempted: true, accepted: true, reason: "accepted-by-final-review" };
  }
  doc.progression_review = receipt;
  doc.generation_receipt = {
    writing_version: CAROUSEL_WRITING_VERSION,
    writer_version: CAROUSEL_WRITER_VERSION,
    model: opts.usage.model ?? null,
    scenario_origin: body.scenario_origin ||
      (body.confirmed_structure?.length ? "user_validated" : "automatic"),
    source_manifest: sources.map(({ id, provenance, text }) => ({
      id,
      provenance,
      characters: text.length,
    })),
    duration_ms: Date.now() - startedAt,
  };
  doc.structure_warnings = [
    ...carouselStructureIssues(doc, body),
    ...(ownsText ? [] : progressionWarnings(receipt)),
  ];
  // COUVERTURE (04/10/2026) : accroche de 10 mots max + sous-titre facultatif,
  // rien d'autre ; seule la slide 1 est touchée (cf. _shared/carousel-cover.ts).
  const coverSink: UsageSink = {};
  const cover = await enforceCover(doc, {
    kind: coverKind(body.carousel_type),
    userAuthored: !!ownsText,
    selectedHook: typeof body.selected_hook === "string" ? body.selected_hook : body.selected_hook?.text ?? null,
    sources: ctx.gateInputText,
    rewrite: remaining() < 25_000 ? undefined : async (input) => {
      const raw = await _deps.callAnthropic({
        model: SONNET_MODEL,
        system: ctx.systemPrompt,
        messages: [{ role: "user", content: coverRewritePrompt(input, ctx.audienceAddress) }],
        max_tokens: 400,
        temperature: 0.7,
        abortTimeoutMs: Math.min(20_000, remaining() - 5_000),
      }, coverSink);
      return tryParseAiJson(raw, "carousel-ai:cover");
    },
  });
  for (const k of ["input_tokens", "output_tokens", "total_tokens"] as const) opts.usage[k] = (opts.usage[k] || 0) + (coverSink[k] || 0);
  if (cover.receipt) console.log(JSON.stringify({ event: "carousel_cover", ...cover.receipt }));
  // TU OU VOUS (04/10/2026) : contrôle par le code après rédaction ET
  // couverture ; passe courte ciblée si le texte contredit la fiche de marque.
  // Jamais sur le texte écrit par la personne.
  const finalDoc = !ownsText && ctx.audienceAddress
    ? await enforceCarouselAudienceAddress(cover.doc, ctx.audienceAddress, remaining() < 15_000 ? 0 : Math.min(20_000, remaining() - 5_000))
    : cover.doc;
  return JSON.stringify(finalDoc);
}

/** Contrôle tu/vous du carrousel final (textes balisés, légende comprise). `budgetMs` 0 = mesure seule. */
export async function enforceCarouselAudienceAddress(doc: any, address: AudienceAddress, budgetMs: number, pass: AudienceAddressPass = _deps.audienceAddressPass): Promise<any> {
  try {
    const block = extractCarouselTexts(doc);
    const result = await enforceAudienceAddress(block, address, {
      pass: budgetMs > 0 ? pass : async (t) => t,
      abortTimeoutMs: budgetMs || undefined,
      logger: (m) => console.log(m),
    });
    if (result.receipt) console.log(JSON.stringify({ event: "carousel_audience_address", ...result.receipt }));
    return result.receipt?.applied ? reinjectCarouselTexts(doc, result.content) : doc;
  } catch (e) {
    console.error("[carousel-ai] contrôle tu/vous ignoré (carrousel intact) :", e);
    return doc;
  }
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
  let content = await timed("write_ms", isWriting
    ? _deps.callCarouselWriter({ ...writingOptions, model: pickCarouselModel(body) }, usage)
    : _deps.callAnthropic({ ...writingOptions, model: getModelForAction(type === "deepening_questions" ? "questions" : "carousel") }, usage));

  // Contextual review for every generated carousel, legacy scan only on rollback.
  // Ne rejette jamais : une relecture en échec rend le texte reçu.
  const review = async (value: string): Promise<string> => {
    try {
      if (semanticReviewEnabled || carouselNeedsPolish(value) || currentAuthoredText.trim()) {
        emitStatus("correcting");
        const corrected = await applyGuardedCarouselCorrection(value, {
          inputText: gateInputText, researchText, testimonySource, brandGuardText, echo: { previousHooks, subject: body.subject },
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

  // Garde DÉTERMINISTE : le prompt limite les schémas (max 2, jamais consécutifs)
  // mais le modèle déborde (3 consécutifs observés en prod le 04/07). On applique
  // la règle par code — le narratif prime, cf PR #112/#113.
  if (type === "express_full" || type === "slides") {
    const capped = limitVisualSchemas(content);
    if (capped.stripped > 0) console.warn(`carousel-ai: ${capped.stripped} visual_schema retiré(s) (max 2, jamais consécutifs)`);
    content = capped.content;
    // Quality-gate rédactionnel : mesures en code + re-passe ciblée si violations
    const gateExpress = await timed("gate_ms", runRedacGate(content, {
      isLinkedIn,
      onStatus: emitStatus,
      inputText: gateInputText,
      researchText,
      researchNumbersCap: reqCtx.researchNumbersCap,
      testimonySource,
      echo: { previousHooks, subject: body.subject },
      brandGuardText,
      captionEnding: captionEndingRule,
      correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: reviewAllowed(startedAt), skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
    }));
    content = gateExpress.content;
    await logContentQuality(userId, `carousel_${type}`, gateExpress, usage.model, workspaceId, body.subject);
  }

  if (type === "express_full" || type === "slides") {
    content=await timed("thread_ms",finalizeCarousel(content,reqCtx,{usage,repaired:structuralRepair,regenerate}));
    // SCHÉMAS décidés après l'écriture et ses relectures, sur le texte final
    // (la rédaction ne les connaît plus : un changement d'écriture ne peut plus
    // les faire disparaître). Échec ou manque de temps → aucun schéma, texte livré.
    const withSchemas = await timed("schemas_ms", addSchemasToContent(content, { isMix: false, usage, allowed: schemasAllowed(startedAt), maxSlides: carouselLength(body).exact ? 0 : autoMaxSlides(body) }));
    content = withSchemas.content;
    const finalParsed = tryParseAiJson<any>(content);
    console.log(JSON.stringify({ event: "carousel_rhythm", label: type, slides: Array.isArray(finalParsed?.slides) ? finalParsed.slides.length : 0, long_slides: longTextSlides(finalParsed, body) }));
    if (withSchemas.plan) console.log(JSON.stringify({ event: "carousel_schema_formatting", label: type, status: withSchemas.plan.status, proposed: withSchemas.plan.proposed ?? 0, rejected: withSchemas.plan.rejected ?? [], spotted: withSchemas.plan.spotted ?? [], schemas: withSchemas.plan.schemas.map(x => x.visual_schema.type) }));
  }

  // deepening_questions (variante texte) est gratuit — arbitrage 10/07/2026 :
  // un carrousel débite 2 crédits (rédaction express_full + carousel_visual),
  // les questions pré-chargées ne comptent pas (aligné sur creative-flow).
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
  const userPrompt = buildHooksPrompt(reqCtx.body);
  return runGenerationAndRespond("hooks", userPrompt, reqCtx);
}

async function handleSlidesRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildSlidesPrompt(reqCtx.body, reqCtx.isLinkedIn);
  return runGenerationAndRespond("slides", userPrompt, reqCtx);
}

async function handleSuggestTopicsRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildSuggestTopicsPrompt(reqCtx.body);
  return runGenerationAndRespond("suggest_topics", userPrompt, reqCtx);
}

async function handleSuggestAnglesRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const userPrompt = buildSuggestAnglesPrompt(reqCtx.body);
  return runGenerationAndRespond("suggest_angles", userPrompt, reqCtx);
}

// ── Mix carousel mode ──
async function continuousCarouselResponse(ctx: CarouselRequestContext): Promise<Response | null> {
  const usage: UsageSink = {};
  let output;
  try { output = await _deps.prepareNarrative({
    body:ctx.body, brandingContext:ctx.brandingContext,
    photoContext:buildPhotoContextRecap(ctx.body.photo_contexts || ctx.body.photos),
    newsContext:typeof ctx.newsContext === "string" ? ctx.newsContext : "",
    authoredText:ctx.currentAuthoredText, startedAt:ctx.startedAt, usage,
    emitStatus:ctx.emitStatus, write:_deps.callCarouselWriter, review:_deps.reviewThread, reserveMs:PHOTO_MATCH_RESERVE_MS,
  }); } catch(error) {
    if(error instanceof NarrativePhotoMismatch) return carouselMismatchResponse(JSON.stringify({photo_mismatch:{reason:error.message}}),ctx.body,usage,ctx.body.carousel_type,ctx.corsHeaders);
    throw error;
  }
  if (!output) return null;
  const measured = await runRedacGate(JSON.stringify(output.doc), {
    isLinkedIn:ctx.isLinkedIn,inputText:ctx.gateInputText,researchText:ctx.researchText,researchNumbersCap:ctx.researchNumbersCap,testimonySource:ctx.testimonySource,correction:{enabled:false},
  });
  const written = await finalizeCarousel(measured.content,ctx,{usage,repaired:output.repaired,regenerate:output.regenerate,reserveMs:PHOTO_MATCH_RESERVE_MS});
  const matched = await _deps.matchPhotos(JSON.parse(written), {body:ctx.body,startedAt:ctx.startedAt,usage,emitStatus:ctx.emitStatus,call:_deps.callAnthropic});
  const content = JSON.stringify(matched);
  await _deps.logUsage(ctx.userId,ctx.category,`carousel_${ctx.body.carousel_type}`,usage.total_tokens,usage.model,ctx.workspaceId);
  await logContentQuality(ctx.userId,`carousel_${ctx.body.carousel_type}`,measured,usage.model,ctx.workspaceId,ctx.body.subject);
  return new Response(JSON.stringify({content,writing_version:CAROUSEL_WRITING_VERSION,
    writer:{version:CAROUSEL_WRITER_VERSION,model:usage.model,effort:"medium"}}),
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

  // DISPOSITION hors de la rédaction (04/10/2026) : la rédaction du mixte
  // n'écrit que le texte et la structure (slide_type, photo_index). Ce qu'elle
  // écrirait quand même en photo_layout / overlay_position / overlay_style est
  // ignoré ; une réparation garde ceux du brouillon (structure confirmée). La
  // disposition est choisie au rendu par mix-layout-formatting.ts.
  {
    const write = doGenerate, repair = doRepair;
    doGenerate = (sink: UsageSink) => write(sink).then(stripMixWriterLayoutFields);
    if (repair) doRepair = (draft, defects, sink, abortTimeoutMs) => repair(draft, defects, sink, abortTimeoutMs).then(out => keepDraftLayoutFields(draft, out));
  }
  content = await doGenerate(mixUsage);
  // Plancher déterministe de slides (audit carrousel photo 12/07) : le modèle
  // peut renvoyer un carrousel écrasé (1 slide vue en live ~1 run/2 en photo).
  // 0 slide = refus légitime (photo_mismatch), laissé au check ci-dessous ;
  // entre 1 et le plancher → UN retry, puis on livre ce qu'on a (gates ensuite).
  content = await retryIfTooShort(content, doGenerate, mixUsage, carouselSlideFloor(body, 8), "mix");

  {
    const mismatch = carouselMismatchResponse(content, body, mixUsage, "mix", corsHeaders);
    if (mismatch) return mismatch;
  }
  const threadMix = await repairCarouselStructure(content, { body, label: "mix", emitStatus, usage: mixUsage, regenerate: doRepair, startedAt });
  content = threadMix.content;

  const editorialBaseline = content;
  // Contextual review includes photo overlays and every visible text field.
  try {
    if (semanticReviewEnabled || carouselNeedsPolish(content) || currentAuthoredText.trim()) {
      emitStatus("correcting");
      const corrected = await applyGuardedCarouselCorrection(content, {
        inputText: gateInputText, researchText, testimonySource, brandGuardText, echo: { previousHooks, subject: body.subject },
        correction: { currentBrief, semanticReview: semanticReviewEnabled,
          enabled: reviewAllowed(startedAt),
          skipIfShorterThan: 300,
          logger: (msg) => console.log(msg),
          model: pickCorrectionModel(body),
            authoredText: currentAuthoredText,
          abortTimeoutMs: CORRECTION_ABORT_MS,
        },
      });
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
  {
    const capped = limitVisualSchemas(content);
    if (capped.stripped > 0) console.warn(`carousel-ai(mix): ${capped.stripped} visual_schema retiré(s) (max 2, jamais consécutifs)`);
    content = capped.content;
  }
  // Quality-gate rédactionnel : mesures en code + re-passe ciblée si violations
  const gateMix = await runRedacGate(content, {
    isLinkedIn,
    onStatus: emitStatus,
    inputText: gateInputText,
    researchText,
    researchNumbersCap: reqCtx.researchNumbersCap,
    testimonySource,
    echo: { previousHooks, subject: body.subject },
    brandGuardText,
    captionEnding: captionEndingRule,
    correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: reviewAllowed(startedAt), skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
  });
  content = gateMix.content;
  content = await finalizeCarousel(content,reqCtx,{usage:mixUsage,repaired:threadMix.repaired,regenerate:doRepair});
  {
    // SCHÉMAS du mixte : dessinés par le code en slide « pause » (piste B
    // validée par Laetitia le 03/10/2026, mix-schema-render.ts), seulement les
    // types que la mise en page sait dessiner (MIX_SCHEMA_TYPES).
    const withSchemas = await addSchemasToContent(content, { isMix: true, usage: mixUsage, allowed: MIX_SCHEMAS_ENABLED && schemasAllowed(startedAt) });
    content = withSchemas.content;
    if (withSchemas.plan) console.log(JSON.stringify({ event: "carousel_schema_formatting", label: "mix", status: withSchemas.plan.status, proposed: withSchemas.plan.proposed ?? 0, rejected: withSchemas.plan.rejected ?? [], spotted: withSchemas.plan.spotted ?? [], schemas: withSchemas.plan.schemas.map(x => x.visual_schema.type) }));
  }
  await _deps.logUsage(userId, category, "carousel_mix", mixUsage.total_tokens, mixUsage.model, workspaceId);
  await logContentQuality(userId, "carousel_mix", gateMix, mixUsage.model, workspaceId, body.subject);
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION,
    writer: { version: CAROUSEL_WRITER_VERSION, model: mixUsage.model, effort: "medium" },
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Photo carousel mode ──
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

  content = await doGenerate(photoUsage);
  // Plancher déterministe de slides (audit carrousel photo 12/07) : 1 slide
  // livrée sur 6 demandées vue en live ~1 run/2. 0 slide = refus légitime
  // (photo_mismatch), laissé au check ci-dessous.
  content = await retryIfTooShort(content, doGenerate, photoUsage, carouselSlideFloor(body, 6), "photo");

  {
    const mismatch = carouselMismatchResponse(content, body, photoUsage, "photo", corsHeaders);
    if (mismatch) return mismatch;
  }
  const threadPhoto = await repairCarouselStructure(content, { body, label: "photo", emitStatus, usage: photoUsage, regenerate: doRepair, startedAt });
  // Mise en page hors de l'écriture : gabarit, chiffre, liste, étape et
  // attribution sont posés ensuite, à partir du texte FINAL (assignPhotoTemplates,
  // après la relecture et le redac-gate, plus bas).
  content = stripWriterLayoutFields(threadPhoto.content);
  const editorialBaseline = content;
  // Short photo overlays need the same contextual review as text slides.
  try {
    if (semanticReviewEnabled || carouselNeedsPolish(content) || currentAuthoredText.trim()) {
      emitStatus("correcting");
      const corrected = await applyGuardedCarouselCorrection(content, {
        inputText: gateInputText, researchText, testimonySource, brandGuardText, echo: { previousHooks, subject: body.subject },
        correction: { currentBrief, semanticReview: semanticReviewEnabled,
          enabled: reviewAllowed(startedAt),
          skipIfShorterThan: 300,
          logger: (msg) => console.log(msg),
          model: pickCorrectionModel(body),
            authoredText: currentAuthoredText,
          abortTimeoutMs: CORRECTION_ABORT_MS,
        },
      });
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
  {
    const capped = limitVisualSchemas(content);
    if (capped.stripped > 0) console.warn(`carousel-ai(photo): ${capped.stripped} visual_schema retiré(s) (max 2, jamais consécutifs)`);
    content = capped.content;
  }
  const gatePhoto = await runRedacGate(content, {
    isLinkedIn,
    onStatus: emitStatus,
    inputText: gateInputText,
    researchText,
    researchNumbersCap: reqCtx.researchNumbersCap,
    testimonySource,
    echo: { previousHooks, subject: body.subject },
    brandGuardText,
    captionEnding: captionEndingRule,
    correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: reviewAllowed(startedAt), skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
  });
  content = gatePhoto.content;
  // Relecture-gabarits (13/07) : sur les textes DÉFINITIFS (post relecture
  // éditoriale et redac-gate), pose le gabarit visuel de chaque slide. Avant le
  // 04/10/2026 elle tournait AVANT la relecture sémantique quand celle-ci était
  // active (pour que la relecture « voie » liste/attribution) : la relecture
  // pouvait alors corriger l'overlay ou patcher big_number/points, et l'extrait
  // mis en valeur ne correspondait plus au texte final. Ces champs sont
  // désormais des extraits EXACTS du texte relu (aucune matière nouvelle à
  // relire) et la relecture ne les patche plus (carouselReviewFields).
  content = await assignPhotoTemplates(content, {
    model: pickCorrectionModel(body),
    logger: (m) => console.log(m),
  });
  content = await finalizeCarousel(content,reqCtx,{usage:photoUsage,repaired:threadPhoto.repaired,regenerate:doRepair});
  // Une réparation globale du fil (finalizeCarousel) peut réécrire les textes
  // après l'assignation : la mise en page est revérifiée contre le texte final,
  // un extrait qui n'y figure plus est retiré (reçus ré-empreints s'ils étaient
  // à jour).
  content = await revalidatePhotoLayoutContent(content, (m) => console.log(m));
  await _deps.logUsage(userId, category, "carousel_photo", photoUsage.total_tokens, photoUsage.model, workspaceId);
  await logContentQuality(userId, "carousel_photo", gatePhoto, photoUsage.model, workspaceId, body.subject);
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION,
    writer: { version: CAROUSEL_WRITER_VERSION, model: photoUsage.model, effort: "medium" },
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

async function handleStructureProposalRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const { body, brandingContext, newsContext, corsHeaders } = reqCtx;
  const { subject, carousel_type, objective, editorial_angle, deepening_answers, photos, photo_description } = body;
  const hasPhotos = photos && Array.isArray(photos) && photos.length > 0;
  const isPhotoMode = carousel_type === "photo";
  const isMixMode = carousel_type === "mix";

  const photoInstruction = hasPhotos && (isPhotoMode || isMixMode) ? `
MODE ${isPhotoMode ? "PHOTO" : "MIXTE"} — ${photos.length} photo(s) fournies.
${body.prefer_distinct_photos && isPhotoMode
  ? "Pour ce premier carrousel produit, crée une slide par photo disponible : chaque photo_index doit être unique. Adapte le récit à ces images sans en répéter une. Deux photos ne prouvent pas un avant/après ; ne suppose pas de lien chronologique."
  : "Le nombre de photos ne détermine ni la longueur ni le type d'histoire. Deux photos ne prouvent pas un avant/après. Préserve l'ordre choisi ; une photo peut porter plusieurs passages, sans zoom imposé. Écarte une photo seulement si elle ne sert pas le sujet."}
${isPhotoMode ? 'Chaque slide utilise slide_type:"photo_full" et un photo_index depuis 1.' : 'Répartis photo_full, photo_integrated et text_only selon les besoins du propos. Le texte approfondit ce que les photos accompagnent ; une répartition confirmée prime. photo_index depuis 1 pour les slides photo, absent pour text_only.'}
Chaque story_beat indique ce que la slide reprend et ce qu'elle ajoute. Les textes se lisent ensemble comme un récit ou une explication suivie, avec une entrée et un aboutissement. Les listes gardent un cadre commun sans causalité artificielle.
Choisis overlay_position (top_left, top_center, bottom_left, bottom_center, center) pour les slides photo_full dans une zone dégagée qui laisse visibles visage, mains, objet et détails importants. Évite center quand le sujet occupe le centre. Respecte le cadrage original.
${photo_description ? `Description complémentaire : ${photo_description}` : ""}
` : "";

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

  const structureSystemPrompt = `${COMMON}
${PLAN}
${CONTENT_CLARITY_RULES}
${carouselSubstance(livedCaseFromCarouselBody(body).provided)}
${CAROUSEL_CONTINUITY}
${PHOTO_NARRATIVE_CONTRACT}

Tu es une stratège éditoriale spécialisée en carrousels Instagram et LinkedIn.

Sources pour les références du plan : request = sujet/réponses explicites ; brand = contexte de marque (vérifier le degré de certitude) ; photo_observations = uniquement ce qui est visible, pas une identité ou une histoire prouvée.
MISSION : Propose une structure narrative optimale pour un carrousel. Tu ne génères PAS le contenu des slides — uniquement leur architecture.

RÈGLES :
- Chaque slide a une fonction précise adaptée au sujet (présentation, explication, étape, argument, exemple, nuance…). Aucun problème, transformation, bascule ou CTA obligatoire.
- Justifie chaque position par son lien avec ce qui précède et son apport à l'ensemble, en 1 phrase max.
- Propose des titres spécifiques en français (voir RÈGLES TITRES ci-dessous), sans scène inventée.
- Sois concise et actionnable, pas théorique
${carouselLengthPrompt(body)}
${photoInstruction}

${SLIDE_TITLE_RULES}

CONTEXTE BRANDING :
${brandingContext}
${structureNewsContextBlock}${structureNewsConsigne}


Retourne UNIQUEMENT un objet JSON valide (pas de texte avant ou après, pas de backticks), avec cette structure exacte :
{
  "editorial_intent": {"mode":"explication", "idea":"Proposition précise à développer, distincte du thème ou du parcours des photos", "reader_takeaway":"Ce que le développement permettra de comprendre", "basis_source_ids":["brand"], "inferred":true},
  "strategic_rationale": "2-3 phrases expliquant la logique narrative globale",
  "narrative_thread": "Intention et progression retenues ; promesse tenue de la couverture ; aboutissement. Cite les faits disponibles qui fondent ce choix. Le récit peut venir de l’histoire de marque et être accompagné indirectement par les photos.",
  "slides": [
    {
      "slide_number": 1,
      "role": "hook",
      "title_suggestion": "titre court proposé",
      "strategic_note": "pourquoi cette slide à cette position",
      "contribution": "Ce que cette page apporte au propos",
      "inherits": "Élément précis repris ou promesse de couverture",
      "develops": "Avancée du raisonnement, pas nouveau motif ou objet",
      "source_ids": ["brand"],
      "image_role": "Ce que la photo accompagne, sans dicter le texte",
      "story_beat": "Ce que cette slide fait comprendre ou raconte avec la matière fournie, et comment elle poursuit la précédente, en 1 phrase. Une étape du propos, sans émotion, événement ou bascule inventés ; une description de photo seule ne suffit pas."${hasPhotos ? `,
      "photo_index": 1,
      "slide_type": "photo_full",
      "overlay_position": "bottom_left",
      "visual_anchor": "Détail visible à préserver dans le cadrage ; ne dicte pas le texte.",
      "photo_observation": "Ce qui est visible et ce qui reste ambigu, sans histoire supposée.",
      "image_relation": "Ce que cette image accompagne dans le récit, même indirectement.",
      "factual_basis": "Faits et sources disponibles pour ce passage ; observation ou interprétation quand ce n’est pas un fait confirmé."` : ""}
    }
  ],
  "total_slides": 7,
  "carousel_type": "${carousel_type || "auto"}"
}

RAPPEL CRITIQUE sur les nouveaux champs :
- "narrative_thread" = LE récit que le pass d'écriture exécutera. C'est la colonne vertébrale.
- "story_beat" (par slide) = ce que la slide RACONTE dans ce récit, pas ce que la photo MONTRE. Une intention narrative.
- "photo_observation", "image_relation" et "factual_basis" conservent séparément ce qui est vu, ce que l’image accompagne et les sources utilisables. Le rédacteur ne reverra pas les pixels.
- story_beat sert le narrative_thread ; visual_anchor sert la composition. Une histoire de marque peut continuer sur une photo sans lien littéral avec sa phrase.`;

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
      text: "Choisis une proposition éditoriale étayée, construis sa progression, puis assigne les photos à ces étapes. Une visite des photos ne tient pas lieu de propos.",
    });
    content = await _deps.callAnthropic({
      model: getModelForAction("content"),
      system: structureSystemPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: messageContent }],
      // Evidence fields add material per slide; avoid truncating the scenario.
      max_tokens: 8192,
      tool: STRUCTURE_PROPOSAL_TOOL,
    });
  } else {
    content = await _deps.callAnthropic({
      model: getModelForAction("content"),
      system: structureSystemPrompt,
      messages: [{ role: "user", content: structureUserPrompt }],
      // Evidence fields add material per slide; avoid truncating the scenario.
      max_tokens: 8192,
      tool: STRUCTURE_PROPOSAL_TOOL,
    });
  }

  // PAS de logUsage — cet appel est gratuit
  const structureResult: any = tryParseAiJson(content, "carousel-ai:structure_proposal");

  // Refus structuré : mêmes symptômes possibles que sur la génération (l'IA
  // voit les photos en vision) — sans ce chemin, un photo_mismatch partait
  // en « Impossible de parser » + repli sur une génération directe qui
  // re-refusait. Appel gratuit : rien à dé-débiter, mais le message doit
  // être actionnable. Le front (CreerUnifie) affiche message et renvoie au
  // choix des photos.
  if (hasPhotos && !(Array.isArray(structureResult?.slides) && structureResult.slides.length > 0)) {
    const mismatchReason = typeof structureResult?.photo_mismatch?.reason === "string"
      ? structureResult.photo_mismatch.reason.trim()
      : "";
    if (mismatchReason) {
      const plural = photos.length > 1;
      console.warn(`[carousel-ai] structure_proposal: photo_mismatch — ${mismatchReason}`);
      return new Response(JSON.stringify({
        error: "photo_mismatch",
        message: `${plural ? "Tes photos ne semblent pas correspondre" : "Ta photo ne semble pas correspondre"} à ton idée : ${mismatchReason}${/[.!?…]$/.test(mismatchReason) ? "" : "."} Change de photo${plural ? "s" : ""} ou passe en carrousel « Texte design » pour garder ton idée telle quelle. Aucun crédit n'a été décompté.`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (!structureResult) {
    return new Response(JSON.stringify({ error: "Impossible de parser la structure proposée" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 0 slide SANS raison de mismatch : erreur explicite plutôt qu'une
  // structure vide renvoyée en « succès » (le front auto-valide en mode
  // photo et enchaînerait une génération sur du vide).
  if (!(Array.isArray(structureResult.slides) && structureResult.slides.length > 0)) {
    console.warn("[carousel-ai] structure_proposal: 0 slide sans photo_mismatch");
    return new Response(JSON.stringify({
      error: "structure_vide",
      message: "La proposition de structure est revenue vide. Réessaie — aucun crédit n'a été décompté.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  structureResult.slides.forEach(normalizeGeneratedPlanFields);
  // Carrousel photo : toutes les slides sont des slides photo (consigne du
  // prompt, que le modèle ne suit pas toujours).
  if (isPhotoMode) for (const sl of structureResult.slides) if (sl && typeof sl === "object") sl.slide_type = "photo_full";
  const result = body.prefer_distinct_photos && isPhotoMode && hasPhotos
    ? assignDistinctStructurePhotos(structureResult, photos.length)
    : structureResult;
  return new Response(JSON.stringify({ result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

function buildSystemPrompt(brandingContext: string, isLinkedIn = false, profile?: any, livedCase = false, audienceAddress: AudienceAddress | null = null): string {
  return buildCarouselWritingSystem(brandingContext, isLinkedIn, buildIdentityBlock(profile, "rédactrice éditoriale"), CONTENT_CLARITY_RULES, livedCase, audienceAddressRule(audienceAddress));
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
- 4 à 10 MOTS par hook (idéalement 5 à 8) : c'est le titre de la couverture
- Doit stopper le scroll : tension ou manque (prise de position, erreur courante, question qui pique, promesse concrète, liste chiffrée, « ce que personne ne dit sur… », actu détournée, histoire entamée)
- Spécifique au sujet, pas générique ; jamais un titre-étiquette qui nomme seulement le sujet
- 3 types DIFFÉRENTS de hooks
${deepeningCtx ? "- ANCRE les hooks dans le vécu et les mots de l'utilisatrice" : ""}

Retourne ce JSON exact :
{
  "hooks": [
    { "id": "A", "text": "[HOOK 4-10 MOTS]", "word_count": 8, "style": "curiosité" },
    { "id": "B", "text": "[HOOK 4-10 MOTS]", "word_count": 7, "style": "provocation" },
    { "id": "C", "text": "[HOOK 4-10 MOTS]", "word_count": 9, "style": "résultat" }
  ]
}`;
}

function buildSlidesPrompt(body: any, isLinkedIn = false): string {
  return textWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { scenarioOrigin: body.scenario_origin, narrativeThread: body.narrative_thread }));
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
    angleBlock = `\n\nANGLE ÉDITORIAL : ${editorial_angle}\nSTRUCTURE DU CARROUSEL :\n${content_structure}\n\nLes questions doivent aider la personne à compléter cette structure avec les faits, exemples ou expériences disponibles.`;
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
${objective ? `\nOriente les questions vers cet objectif. Cherche les informations utiles pour cet objectif, sans imposer témoignage, anecdote, résultat ni provocation.\n` : ""}${brandingBlock}${brandVocabBlock || ""}${recentBriefsContext || ""}${angleBlock}
${isLinkedIn ? `\nATTENTION : c'est un carrousel LINKEDIN. Les questions doivent orienter vers du contenu expert et professionnel :\n- Demander des données, des résultats concrets, des leçons métier\n- Chercher l'expertise spécifique (pas juste l'émotion)\n- Orienter vers du contenu qui positionne comme référence sur le sujet` : ""}

══ AVANT DE POSER LES QUESTIONS — RAISONNEMENT INTERNE (ne PAS afficher) ══
Réfléchis silencieusement à :
1. Quel est le SUJET COURANT ? (ré-extraire 1 mot-clé)
2. Quel vocabulaire métier puis-je intégrer ?
3. Y a-t-il un sujet identique dans l'historique récent ? Si oui, quelle question NE PAS reposer ?

TON RÔLE : aider à compléter la matière utile à ce sujet, en tenant compte de ce que la personne a déjà fourni.

RÈGLES :
- ANCRAGE SUJET (règle n°1, non négociable) : chaque question doit contenir un mot du sujet courant ou un aspect directement déductible. Une question qui ne référence pas le sujet courant est invalide — réécris-la.
- Demande les faits, choix, explications, exemples ou expériences qui manquent pour relier les slides. Une émotion ou une conviction est facultative.
- Ne redemande pas une réponse déjà présente dans le sujet, le contexte des photos ou les réponses fournies.
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

function buildExpressFullPrompt(body: any, isLinkedIn = false): string {
  return textWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { scenarioOrigin: body.scenario_origin, narrativeThread: body.narrative_thread }));
}

function buildPhotoCarouselPrompt(body: any, isLinkedIn = false): string {
  return photoWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { scenarioOrigin: body.scenario_origin, narrativeThread: body.narrative_thread, withStoryBeat: true }));
}

function buildPhotoCarouselNewsReactionPrompt(body: any, isLinkedIn = false): string {
  return buildPhotoCarouselPrompt(body, isLinkedIn) + NEWS_WRITING;
}

function buildMixCarouselPrompt(body: any, isLinkedIn = false): string {
  return mixWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { scenarioOrigin: body.scenario_origin, narrativeThread: body.narrative_thread, withStoryBeat: true }), buildTextFirstBlock(body));
}

function buildMixCarouselNewsReactionPrompt(body: any, isLinkedIn = false): string {
  return buildMixCarouselPrompt(body, isLinkedIn) + NEWS_WRITING;
}
