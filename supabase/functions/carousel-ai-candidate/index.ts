import { photoWritingPrompt, mixWritingPrompt, textWritingPrompt, NEWS_WRITING } from "./variant-writing.ts";
import { chooseCarouselCopy } from "../_shared/carousel-copy-choice.ts";
import { authoredContentSource, currentContentContract } from "../_shared/editorial-voice.ts";
import { CONTENT_CLARITY_RULES } from "../_shared/content-clarity.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildPreGenFallback, buildIdentityBlock, buildBrandGuardText } from "../_shared/user-context.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { callAnthropic, getModelForAction, SONNET_MODEL, AnthropicError, type UsageSink, type AnthropicModel } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { EDITORIAL_ANGLES_REFERENCE } from "../_shared/copywriting-prompts.ts";
import { buildCarouselWritingSystem, CAROUSEL_SUBSTANCE, CAROUSEL_CONTINUITY, CAROUSEL_TITLES as SLIDE_TITLE_RULES, CAROUSEL_WRITING_VERSION } from "./writing-contract.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError, clampAiField } from "../_shared/input-validators.ts";
import { carouselNeedsPolish } from "../_shared/correction-pass.ts";
import { runRedacGate, applyGuardedCarouselCorrection, type CaptionEndingRule } from "../_shared/redac-gate.ts";
import { logContentQuality } from "../_shared/content-quality.ts";
import { fetchPreviousHooks } from "../_shared/previous-hooks.ts";
import { limitVisualSchemas } from "../_shared/schema-limit.ts";
import { runWithHeartbeatSSE, type StatusEmitter } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { fetchDepthMaterial, buildDepthBlock } from "../_shared/depth-research.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { buildSeriesContext } from "../_shared/series-context.ts";
import { extractImagePayload } from "../_shared/image-utils.ts";
import { mergeConfirmedStructure, normalizePhotoIndexes, countCarouselSlides, maxStructurePhotoIndex, normalizeOverlayStyles, analyzeMixComposition } from "../_shared/photo-slide-structure.ts";
import { assignPhotoTemplates, assignTemplatesToProvidedSlides } from "../_shared/photo-template-assign.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";

// ── Seam d'injection de dépendances (tests) ──
// Indirection pure : en prod, ces champs pointent vers les imports ci-dessus
// et le comportement est identique en tout point. Les tests (index_test.ts)
// remplacent un ou plusieurs de ces champs pour observer/court-circuiter les
// appels réseau (Supabase, Anthropic) sans toucher à la logique métier.
export const _deps = {
  chooseCarouselCopy,
  runPipeline,
  checkQuota,
  logUsage,
  callAnthropic,
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

// Choix du modèle de RÉDACTION du carrousel.
// Par défaut Sonnet (rapide). Opus seulement si l'utilisatrice a coché
// explicitement "Mode qualité Max" (quality_max) — plus soigné mais ~2-3x plus
// lent. Fini l'escalade silencieuse vers Opus basée sur la longueur des réponses.
function pickCarouselModel(body: any) {
  return body?.quality_max ? "claude-opus-4-8" : getModelForAction("carousel");
}

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

const MIX_CAROUSEL_TOOL = {
  name: "livrer_carrousel_mixte",
  description:
    "Livre le carrousel mixte final (slides + caption), OU signale via photo_mismatch que les photos fournies ne permettent pas de traiter le brief.",
  input_schema: {
    type: "object",
    properties: {
      photo_mismatch: PHOTO_MISMATCH_FIELD,
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
            photo_layout: { type: "string" },
            role: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            overlay_text: { type: "string" },
            overlay_position: { type: "string" },
            overlay_style: { type: "string" },
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
            overlay_position: { type: "string" },
            overlay_style: { type: "string" },
            visual_anchor: { type: "string" },
            note: { type: "string" },
            // ── Gabarits composés par code (chantier 13/07) : le modèle choisit
            // le gabarit et fournit ses champs ; le rendu HTML est déterministe.
            template: {
              type: ["string", "null"],
              enum: ["couverture", "profonde", "etiquette", "chiffre", "liste", "etape", "citation", "finale", null],
              description:
                "Gabarit visuel. couverture=slide 1 uniquement (affiche). profonde=texte 15-25 mots sur dégradé bas (défaut). etiquette=texte ≤4 mots en pastille (AVANT/APRÈS, connecteur). chiffre=big_number requis. liste=points requis. etape=step_number requis (processus). citation=attribution recommandée. finale=dernière slide uniquement (fin du propos ou action pertinente, question facultative).",
            },
            kicker: { type: ["string", "null"], description: "Sur-titre court (≤6 mots) : couverture, liste, etape (titre de l'étape)." },
            detail: { type: ["string", "null"], description: "Ligne de détail (≤12 mots) : couverture, etiquette." },
            points: { type: ["array", "null"], items: { type: "string" }, description: "Gabarit liste : 2-3 points courts (≤8 mots chacun)." },
            big_number: { type: ["string", "null"], description: "Gabarit chiffre : le chiffre seul, court ('-40 %', '3×', '48 h')." },
            step_number: { type: ["number", "null"], description: "Gabarit etape : numéro de l'étape du PROCESSUS (1, 2, 3…), pas de la slide." },
            attribution: { type: ["string", "null"], description: "Gabarit citation : qui parle (≤5 mots)." },
            cta_label: { type: ["string", "null"], description: "Gabarit finale : texte de la pastille d'invitation (≤6 mots)." },
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
const STRUCTURE_PROPOSAL_TOOL = {
  name: "livrer_structure_carrousel",
  description:
    "Livre la structure narrative proposée pour le carrousel, OU signale via photo_mismatch que les photos fournies ne permettent pas de traiter le brief.",
  input_schema: {
    type: "object",
    properties: {
      photo_mismatch: PHOTO_MISMATCH_FIELD,
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
            story_beat: { type: "string" },
            photo_index: { type: ["number", "null"] },
            slide_type: { type: "string" },
            visual_anchor: { type: "string" },
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

// ── Plancher déterministe de slides (audit carrousel photo 12/07) ──
// Structure confirmée → on attend EXACTEMENT sa longueur ; sinon min(4, cible).
function carouselSlideFloor(body: any, defaultTarget: number): number {
  if (Array.isArray(body.confirmed_structure) && body.confirmed_structure.length > 0) {
    return body.confirmed_structure.length;
  }
  return Math.min(4, body.slide_count || defaultTarget);
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

  try {

    // Quota is handled below per-category, so we skip it here
    const r = await _deps.runPipeline(req, {
      skipQuota: true,
      workspaceId: body?.workspace_id ?? undefined,
    });
    if (!r.ok) return r.response;
    const { userId, supabase } = r;

    // Champs écrits par l'IA à une étape précédente (structure_proposal, choix
    // d'angle) puis renvoyés tels quels par le front pour la passe d'écriture :
    // on tronque au lieu de rejeter (narrative_thread > 1000 le 21/07).
    clampAiField(body, "editorial_angle", 100);
    clampAiField(body, "content_structure", 5000);
    clampAiField(body, "narrative_thread", 1000);
    if (Array.isArray(body?.confirmed_structure)) {
      for (const s of body.confirmed_structure) {
        clampAiField(s, "story_beat", 300);
        clampAiField(s, "visual_anchor", 120);
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

    let category = (type === "suggest_topics" || type === "suggest_angles" || type === "deepening_questions" || type === "structure_proposal") ? "suggestion" : "content";
    // Les carrousels « Qualité Max » tournent sur Opus (~50× le coût d'un post) →
    // on les compte sur un quota dédié `quality_max` (gratuit = 0, Premium = 20/mois).
    if (category === "content" && body?.quality_max) category = "quality_max";
    const quotaCheck = await _deps.checkQuota(userId, category, workspace_id);
    if (!quotaCheck.allowed) {
      return quotaDeniedResponse(quotaCheck, corsHeaders);
    }

    const ctx = await getUserContext(supabase, userId, workspace_id, isLinkedIn ? "linkedin" : "instagram");
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.posts);
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
    const hadUserDeepening = !!body.deepening_answers;
    const currentAuthoredText = authoredContentSource(body);
    const currentBrief = [body.subject, body.subject_details, body.photo_description, body.editorial_angle, body.objective,
      currentAuthoredText, typeof body.news_context === "string" ? body.news_context : ""].filter(Boolean).join("\n");
    const semanticReviewEnabled = Deno.env.get("CAROUSEL_SEMANTIC_REVIEW") !== "false";

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

    // Recherche « creuser le sujet » (lot D-bis, audit qualité 11-12/07) : quand la
    // génération part SANS matière utilisatrice ni actu, on va chercher ce qu'il y a
    // sous le sujet (mécanisme réel, contre-intuitif, limites) pour éviter le
    // traitement de surface. Condiment : échec 100 % silencieux, borné à 25 s.
    let depthBlock = "";
    if (
      type === "express_full" &&
      !hadUserDeepening &&
      // Audit 12/07 (lot F) : photo/mix n'étaient pas servis — un carrousel photo
      // d'expertise restait sans matière anti-surface. Même mécanique condiment,
      // échec silencieux, toujours coupé si deepening ou actu.
      !(typeof body.news_context === "string" && body.news_context.trim())
    ) {
      const material = await fetchDepthMaterial({
        subject: body.subject || "",
        activity: ctx?.profile?.activite,
        model: getModelForAction("content"),
        apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
        logger: (m) => console.log(m),
      });
      depthBlock = buildDepthBlock(material);
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
      Array.isArray(body.photos) ? body.photos.map((p: any) => p?.context || "").join("\n") : "",
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
      ? `\n\n══════════════════════════════════════\nCONTEXTE ACTUALITÉ (NEWSJACKING)\n══════════════════════════════════════\n${newsContext.trim()}\n\nCONSIGNE NEWSJACKING : ce contenu rebondit sur cette actualité. Le HOOK / ACCROCHE (slide 1, première phrase) DOIT partir de l'actualité elle-même — c'est elle qui capte l'attention car elle est dans l'air du temps. Ensuite seulement, fais le pont vers l'expertise, le vécu ou le positionnement de l'utilisatrice. L'actu n'est pas un prétexte en arrière-plan : c'est le point d'entrée visible du carrousel.\n\n══ EXPLOITATION DU CONTEXTE FACTUEL (FORTEMENT ENCOURAGÉE) ══\nLe contexte actu ci-dessus contient potentiellement des FAITS PRÉCIS : chiffres, noms d'acteurs, dates d'événements, mécanismes évoqués, citations publiques. Tu es FORTEMENT encouragée à t'appuyer sur AU MOINS UN fait précis du contexte dans la slide "fond du sujet" (cf. DEPTH_LAYER_DUAL). Ça ancre le carrousel dans le réel et empêche le glissement vers du commentaire psychologisant.\n\nINTERDIT ABSOLU : inventer un chiffre, une statistique, une citation, un nom d'entreprise/personne, ou un événement qui n'est PAS dans le contexte fourni. Si le contexte ne contient pas de fait exploitable précis, formule-le honnêtement avec une tournure prudente ("ce qui se dessine", "la tendance qu'on voit", "ce que ce mouvement révèle") plutôt que d'inventer un fait. Mieux vaut une généralisation honnête qu'un faux chiffre.\n\nEt rappel : ANTI_FABRICATED_STORYTELLING s'applique aussi ici. Tu n'inventes pas de scène vécue datée même si tu rebondis sur une actu. Tu peux dire "je vois passer cette histoire et ce qui me frappe c'est X" — pas "hier en lisant ça j'ai pensé à une cliente qui m'a dit Y".`
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
      brandGuardText,
      captionEndingRule,
      recentBriefsContext,
      previousHooks,
      brandVocabBlock,
      newsContext,
      corsHeaders,
      emitStatus,
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
  /** Champs de marque bruts (buildBrandGuardText) : passages à ne jamais recopier tels quels. */
  brandGuardText: string;
  captionEndingRule: CaptionEndingRule | undefined;
  recentBriefsContext: string;
  /** Accroches déjà écrites sur CE sujet : garde déterministe anti-redite (24/08). */
  previousHooks: string[];
  brandVocabBlock: string;
  newsContext: any;
  corsHeaders: Record<string, string>;
  emitStatus: StatusEmitter;
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
// Partagée par hooks / slides / express_full (texte standard) / suggest_topics /
// suggest_angles / deepening_questions (variante texte) : un seul appel IA,
// passe de correction JSON conditionnelle, quality-gate rédactionnel + cap des
// visual_schema (uniquement express_full/slides), puis logUsage.
async function runGenerationAndRespond(
  type: string,
  userPrompt: string,
  reqCtx: CarouselRequestContext,
): Promise<Response> {
  const { body, currentAuthoredText, currentBrief, semanticReviewEnabled, userId, workspaceId, category, systemPrompt, gateInputText, brandGuardText, captionEndingRule, isLinkedIn, previousHooks, corsHeaders, emitStatus } = reqCtx;

  // L1 : Haiku pour les deepening_questions (tâche structurée et bornée).
  const modelForCall = type === "deepening_questions"
    ? getModelForAction("questions")
    : type === "express_full"
      ? pickCarouselModel(body)
      : getModelForAction("carousel");
  const usage: UsageSink = {};
  if (type !== "deepening_questions") emitStatus("writing");
  let content = await _deps.callAnthropic({
    model: modelForCall,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: type === "deepening_questions" ? 1024 : 8192,
    // Le carrousel tournait au défaut API (1.0), plus chaud que les autres
    // canaux (0.8) → on cadre la créativité du format vitrine. Les questions
    // (Haiku, tâche bornée) gardent le comportement par défaut.
    ...(type === "deepening_questions" ? {} : { temperature: 0.85 }),
    // Questions = appel Haiku court et borné : 30s/tentative pour qu'un fetch
    // qui traîne bascule en retry plutôt que de bloquer le chemin d'activation.
    // Les autres types (express_full/slides/hooks) tournaient SANS limite avant
    // ce correctif (audit timeouts 17/08) — 120s aligné sur la convention
    // "génération standard" du reste des edges du repo.
    ...(type === "deepening_questions" ? { abortTimeoutMs: 30000, tool: QUESTIONS_TOOL } : { abortTimeoutMs: 120_000 }),
  }, usage);

  const editorialBaseline = content;
  // Contextual review for every generated carousel, legacy scan only on rollback.
  if (type === "express_full" || type === "slides" || type === "hooks") {
    try {
      if (semanticReviewEnabled || carouselNeedsPolish(content) || currentAuthoredText.trim()) {
        emitStatus("correcting");
        const corrected = await applyGuardedCarouselCorrection(content, {
          inputText: gateInputText, brandGuardText, echo: { previousHooks, subject: body.subject },
          correction: { currentBrief, semanticReview: semanticReviewEnabled,
            enabled: true,
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
        console.log("[correction-pass:carousel-json] SKIPPED (scan déterministe propre, texte)");
      }
    } catch (correctionError) {
      console.error("Correction pass failed in carousel-ai:", correctionError);
    }
  }

  // Garde DÉTERMINISTE : le prompt limite les schémas (max 2, jamais consécutifs)
  // mais le modèle déborde (3 consécutifs observés en prod le 04/07). On applique
  // la règle par code — le narratif prime, cf PR #112/#113.
  if (type === "express_full" || type === "slides") {
    const capped = limitVisualSchemas(content);
    if (capped.stripped > 0) console.warn(`carousel-ai: ${capped.stripped} visual_schema retiré(s) (max 2, jamais consécutifs)`);
    content = capped.content;
    // Quality-gate rédactionnel : mesures en code + re-passe ciblée si violations
    let gateExpress = await runRedacGate(content, {
      isLinkedIn,
      onStatus: emitStatus,
      inputText: gateInputText,
      echo: { previousHooks, subject: body.subject },
      brandGuardText,
      captionEnding: captionEndingRule,
      correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: true, skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
    });
    gateExpress = await selectFinalCarouselCopy(gateExpress, reqCtx);
    content = gateExpress.content;
    await logContentQuality(userId, `carousel_${type}`, gateExpress, usage.model, workspaceId, body.subject);
  }

  // deepening_questions (variante texte) est gratuit — arbitrage 10/07/2026 :
  // un carrousel débite 2 crédits (rédaction express_full + carousel_visual),
  // les questions pré-chargées ne comptent pas (aligné sur creative-flow).
  if (type !== "deepening_questions") {
    await _deps.logUsage(userId, category, `carousel_${type}`, usage.total_tokens, usage.model, workspaceId);
  }

  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION }), {
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
async function handleMixCarouselRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const { body, currentAuthoredText, currentBrief, semanticReviewEnabled, userId, workspaceId, category, isLinkedIn, systemPrompt, gateInputText, brandGuardText, captionEndingRule, newsContext, previousHooks, corsHeaders, emitStatus } = reqCtx;

  const hasNews = typeof newsContext === "string" && newsContext.trim().length > 0;
  const mixPrompt = hasNews
    ? buildMixCarouselNewsReactionPrompt(body, isLinkedIn)
    : buildMixCarouselPrompt(body, isLinkedIn);
  let content: string;
  let doGenerate: (sink: UsageSink) => Promise<string>;
  const mixUsage: UsageSink = {};
  emitStatus("writing");

  // Cible affichée à l'IA — même valeur que le plancher de retryIfTooShort plus
  // bas (carouselSlideFloor(body, 8)) : sans elle, un mix sans slide_count explicite
  // n'avait AUCUN chiffre de longueur nulle part dans le prompt.
  const mixSlideTarget = body.slide_count ? `${body.slide_count} à ${body.slide_count + 1}` : "8";

  if (body.photos && body.photos.length > 0 && !body.confirmed_structure) {
    const messageContent: any[] = [];

    // 1. Brief créatif EN PREMIER (avant les photos)
    const photoCtxRecap = buildPhotoContextRecap(body.photos);
    messageContent.push({
      type: "text",
      text: `BRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer TOUT le carrousel.\n\nObjectif : ${body.objective || "engagement"}\n${body.slide_count ? `Nombre de slides cible : ${body.slide_count} à ${body.slide_count + 1} — CHOIX EXPLICITE de l'utilisatrice : il PRIME sur toute autre fourchette, même avec ${body.photos.length} photo(s).\n` : ""}${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${body.slide_structure ? `\nStructure imposée : ${body.slide_structure.length} slides définies par l'utilisateur·ice.` : ""}${photoCtxRecap}\n\nVoici ${body.photos.length} photo(s) à intégrer dans le carrousel :`,
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
      text: `Analyse ces ${body.photos.length} photo(s) et crée un carrousel mixte qui respecte le brief créatif ci-dessus. Le concept "${body.subject || ""}" doit être la colonne vertébrale de chaque slide.\n\nRappel de longueur : livre bien ${mixSlideTarget} slides — compte-les avant de répondre, un carrousel écrasé à 1-2 slides est un échec même si le récit te semble complet.\n\nRappel : tu GÉNÈRES avec ces photos (en écarter une individuellement est permis). Le refus photo_mismatch est réservé à une contradiction frontale entre les photos et une chose concrète que le sujet tapé promet de montrer — jamais à un décalage d'esthétique ou d'univers de marque.`,
    });

    doGenerate = (sink: UsageSink) => _deps.callAnthropic({
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + mixPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: messageContent }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
  } else {
    const photoDescLine = body.text_first
      ? ""
      : `\nDescription des photos : "${body.photo_description || "non fournie"}"`;
    const textPrompt = mixPrompt + `\n\nBRIEF CRÉATIF : "${body.subject || "non précisé"}". Ce concept doit structurer tout le carrousel.\n${photoDescLine}\nNombre de slides estimé : ${body.slide_count || 8}${body.slide_count ? " — choix explicite de l'utilisatrice, il PRIME sur toute autre fourchette" : ""}\nObjectif : ${body.objective || "engagement"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${body.slide_structure ? `\nStructure imposée : ${body.slide_structure.length} slides définies par l'utilisateur·ice.` : ""}`;

    doGenerate = (sink: UsageSink) => _deps.callAnthropic({
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: MIX_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
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

  const editorialBaseline = content;
  // Contextual review includes photo overlays and every visible text field.
  try {
    if (semanticReviewEnabled || carouselNeedsPolish(content) || currentAuthoredText.trim()) {
      emitStatus("correcting");
      const corrected = await applyGuardedCarouselCorrection(content, {
        inputText: gateInputText, brandGuardText, echo: { previousHooks, subject: body.subject },
        correction: { currentBrief, semanticReview: semanticReviewEnabled,
          enabled: true,
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
    content = mergeConfirmedStructure(content, body.confirmed_structure);
    const photoCountForIndexes = body.photos?.length || maxStructurePhotoIndex(body.confirmed_structure);
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
  let gateMix = await runRedacGate(content, {
    isLinkedIn,
    onStatus: emitStatus,
    inputText: gateInputText,
    echo: { previousHooks, subject: body.subject },
    brandGuardText,
    captionEnding: captionEndingRule,
    correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: true, skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
  });
  gateMix = await selectFinalCarouselCopy(gateMix, reqCtx);
  content = gateMix.content;
  await _deps.logUsage(userId, category, "carousel_mix", mixUsage.total_tokens, mixUsage.model, workspaceId);
  await logContentQuality(userId, "carousel_mix", gateMix, mixUsage.model, workspaceId, body.subject);
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Photo carousel mode ──
async function handlePhotoCarouselRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const { body, currentAuthoredText, currentBrief, semanticReviewEnabled, userId, workspaceId, category, isLinkedIn, systemPrompt, gateInputText, brandGuardText, captionEndingRule, newsContext, previousHooks, corsHeaders, emitStatus } = reqCtx;

  const hasNews = typeof newsContext === "string" && newsContext.trim().length > 0;
  const photoPrompt = hasNews
    ? buildPhotoCarouselNewsReactionPrompt(body, isLinkedIn)
    : buildPhotoCarouselPrompt(body, isLinkedIn);
  let content: string;
  let doGenerate: (sink: UsageSink) => Promise<string>;
  const photoUsage: UsageSink = {};
  emitStatus("writing");

  // Cible affichée à l'IA, réutilisée dans le rappel de fin de message (recency,
  // audit timeouts 17/08) — même valeur que la clause "Nombre de slides cible"
  // du 1er bloc ci-dessous.
  const photoSlideTarget = body.slide_count
    ? `${body.slide_count} à ${body.slide_count + 1}`
    : `${Math.max(6, Math.min(body.photos?.length || 6, 10))}`;

  if (body.photos && body.photos.length > 0 && !body.confirmed_structure) {
    // Vision mode: send photos to Claude
    const messageContent: any[] = [];
    const photoCtxRecap = buildPhotoContextRecap(body.photos);

    // 1. Brief + recap contexte AVANT les photos
    messageContent.push({
      type: "text",
      text: `Voici ${body.photos.length} photo(s) pour un carrousel photo ${isLinkedIn ? "LinkedIn" : "Instagram"}.\n\nSujet : "${body.subject || "non précisé"}"\nObjectif : ${body.objective || "engagement"}\nNombre de slides cible : ${body.slide_count ? `${body.slide_count} à ${body.slide_count + 1} — CHOIX EXPLICITE de l'utilisatrice : il PRIME sur les fourchettes des CAS PARTICULIERS, même avec ${body.photos.length} photo(s) (une même photo peut porter plusieurs slides, ou certaines photos ne pas servir)` : `${Math.max(6, Math.min(body.photos.length, 10))} — le nombre de slides suit la RICHESSE DU RÉCIT, pas le nombre de photos (une même photo peut porter plusieurs slides, cf CAS PARTICULIERS)`}. Ne descends JAMAIS sous 4 slides.\n${body.photo_description ? `Description complémentaire : "${body.photo_description}"` : ""}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : "L'IA choisit le meilleur angle."}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}${photoCtxRecap}`,
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
      text: `Analyse chaque photo et génère le carrousel photo.\n\nRappel de longueur : livre bien ${photoSlideTarget} slides (jamais moins de 4) — compte-les avant de répondre, un carrousel écrasé à 1-2 slides est un échec même si le récit te semble complet.\n\nRappel : tu GÉNÈRES avec ces photos. Le refus photo_mismatch est réservé à une contradiction frontale entre les photos et une chose concrète que le sujet tapé promet de montrer — jamais à un décalage d'esthétique ou d'univers de marque.`,
    });

    doGenerate = (sink: UsageSink) => _deps.callAnthropic({
      model: pickCarouselModel(body),
      system: systemPrompt + "\n\n" + photoPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: messageContent }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
    }, sink);
  } else {
    // Text-only mode: description without actual photos
    const textPrompt = photoPrompt + `\n\nSujet : "${body.subject || "non précisé"}"\nDescription des photos : "${body.photo_description || "non fournie"}"\nNombre de slides cible : ${body.slide_count || 6} — ne descends JAMAIS sous ${Math.min(4, body.slide_count || 6)} slides, quel que soit le nombre de photos (les textes portent la progression).\nObjectif : ${body.objective || "engagement"}\n${body.editorial_angle ? `Angle éditorial : ${body.editorial_angle}` : ""}\n${body.deepening_answers ? `Réponses de l'utilisatrice : ${JSON.stringify(body.deepening_answers)}` : ""}`;

    doGenerate = (sink: UsageSink) => _deps.callAnthropic({
      model: pickCarouselModel(body),
      system: systemPrompt,
      messages: [{ role: "user", content: textPrompt }],
      max_tokens: 8192,
      temperature: 0.85,
      tool: PHOTO_CAROUSEL_TOOL,
      abortTimeoutMs: 120_000,
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

  // Template assignment can add points/attribution/CTA labels. In contextual
  // mode these must exist BEFORE review, never appear unchecked afterwards.
  if (semanticReviewEnabled) content = await assignPhotoTemplates(content, {
    model: pickCorrectionModel(body), logger: (m) => console.log(m),
  });
  const editorialBaseline = content;
  // Short photo overlays need the same contextual review as text slides.
  try {
    if (semanticReviewEnabled || carouselNeedsPolish(content) || currentAuthoredText.trim()) {
      emitStatus("correcting");
      const corrected = await applyGuardedCarouselCorrection(content, {
        inputText: gateInputText, brandGuardText, echo: { previousHooks, subject: body.subject },
        correction: { currentBrief, semanticReview: semanticReviewEnabled,
          enabled: true,
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
  content = mergeConfirmedStructure(content, body.confirmed_structure);
  {
    const photoCountForIndexes = body.photos?.length || maxStructurePhotoIndex(body.confirmed_structure);
    content = normalizePhotoIndexes(content, photoCountForIndexes, { assumePhotoWhenTypeMissing: true });
  }
  // Un overlay long en style « minimal »/« technique » rend un pavé (lot E).
  content = normalizeOverlayStyles(content);
  {
    const capped = limitVisualSchemas(content);
    if (capped.stripped > 0) console.warn(`carousel-ai(photo): ${capped.stripped} visual_schema retiré(s) (max 2, jamais consécutifs)`);
    content = capped.content;
  }
  let gatePhoto = await runRedacGate(content, {
    isLinkedIn,
    onStatus: emitStatus,
    inputText: gateInputText,
    echo: { previousHooks, subject: body.subject },
    brandGuardText,
    captionEnding: captionEndingRule,
    correction: { currentBrief, semanticReview: semanticReviewEnabled, reviewBaseline: editorialBaseline, authoredText: currentAuthoredText, enabled: true, skipIfShorterThan: 300, logger: (m) => console.log(m), model: pickCorrectionModel(body), abortTimeoutMs: CORRECTION_ABORT_MS },
  });
  gatePhoto = await selectFinalCarouselCopy(gatePhoto, reqCtx);
  content = gatePhoto.content;
  // Relecture-gabarits (13/07) : sur les textes DÉFINITIFS (post gate),
  // pose le gabarit visuel de chaque slide. Décision prise sur le texte
  // réel, aucun quota de variété, anti-invention par code, fail-open.
  if (!semanticReviewEnabled) content = await assignPhotoTemplates(content, {
    model: pickCorrectionModel(body),
    logger: (m) => console.log(m),
  });
  await _deps.logUsage(userId, category, "carousel_photo", photoUsage.total_tokens, photoUsage.model, workspaceId);
  await logContentQuality(userId, "carousel_photo", gatePhoto, photoUsage.model, workspaceId, body.subject);
  return new Response(JSON.stringify({ content, writing_version: CAROUSEL_WRITING_VERSION }), {
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
  const { subject, carousel_type, objective, slide_count, editorial_angle, deepening_answers, photos, photo_description } = body;
  const hasPhotos = photos && Array.isArray(photos) && photos.length > 0;
  const isPhotoMode = carousel_type === "photo";
  const isMixMode = carousel_type === "mix";

  let photoInstruction = "";
  if (hasPhotos && (isPhotoMode || isMixMode)) {
    if (isPhotoMode) {
      const n = photos.length;
      // slide_count explicite = choix de longueur de l'utilisatrice (puces
      // « Longueur » du front) — il prime sur la fourchette adaptative.
      const slideTarget = slide_count ? `${slide_count} à ${slide_count + 1}`
        : n === 1 ? "4 à 6"
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

NOMBRE DE SLIDES : cible ${slideTarget} slides. ${slide_count ? `C'est un CHOIX EXPLICITE de l'utilisatrice : respecte-le, même si le nombre de photos suggérerait autre chose (une même photo peut porter plusieurs slides, ou certaines photos ne pas servir).` : `Le nombre de slides s'ajuste à la richesse narrative du sujet ET au nombre de photos — il n'y a PAS de plancher rigide à 7-8 slides.`}

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

QUAND UNE SLIDE TEXTE EST UTILE :
Elle développe un usage, un détail, une explication, une étape, une nuance ou une position fournis qui gagnent à être lus. Aucun mécanisme caché, chiffre ou retournement obligatoire.

Pour les slides avec photo : "photo_index" (1-based, peut se répéter entre slides) + "slide_type" = "photo_full" ou "photo_integrated".
Pour les slides texte : "slide_type" = "text_only", pas de photo_index. Indique dans "strategic_note" pourquoi cette slide DOIT être texte (mécanisme, croyance, chiffre, transition, prise de position…) — et si elle gagnerait à porter un schéma visuel (comparaison, timeline, opposition, liste structurée).

Répartis les photos intelligemment : la plus impactante en hook (slide 1) ou conclusion, les autres selon leur contenu narratif. Si une photo est réutilisée, change son rôle/cadrage entre les deux occurrences.

CHAÎNAGE NARRATIF (CRITIQUE) :
Les title_suggestion lus dans l'ordre suivent une progression adaptée au sujet : usage, explication, récit, méthode ou analyse. Aucun arc dramatique imposé.
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

  const structureSystemPrompt = `${CONTENT_CLARITY_RULES}
${CAROUSEL_SUBSTANCE}
${CAROUSEL_CONTINUITY}

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
  "narrative_thread": "Le fil du propos complet en 2-3 phrases, adapté au sujet et aux informations disponibles. Aucune tension ou révélation à inventer. L'écriture suivra ce fil.",
  "slides": [
    {
      "slide_number": 1,
      "role": "hook",
      "title_suggestion": "titre court proposé",
      "strategic_note": "pourquoi cette slide à cette position",
      "story_beat": "Ce que CETTE slide FAIT VIVRE dans le récit, en 1 phrase. Une INTENTION NARRATIVE — pas une description de la photo. Exemples : « ici on installe le doute », « ici la bascule : le client rappelle », « ici on paie le prix de la décision ». JAMAIS « on voit un chantier », « la photo montre… »."${hasPhotos ? `,
      "photo_index": 1,
      "slide_type": "photo_full",
      "visual_anchor": "OBLIGATOIRE pour toute slide avec photo_index. 3-8 mots qui pointent UN détail concret VISIBLE dans CETTE photo, mobilisable par le pass d'écriture comme matière première (ex : « la poussière sur les bottes », « les deux tasses encore pleines »). C'est UN détail précis, JAMAIS un résumé de l'image. Ne l'omets que si la photo est vraiment sans aucun détail saisissable."` : ""}
    }
  ],
  "total_slides": 7,
  "carousel_type": "${carousel_type || "auto"}"
}

RAPPEL CRITIQUE sur les nouveaux champs :
- "narrative_thread" = LE récit que le pass d'écriture exécutera. C'est la colonne vertébrale.
- "story_beat" (par slide) = ce que la slide RACONTE dans ce récit, pas ce que la photo MONTRE. Une intention narrative.
- "visual_anchor" (slides photo uniquement) = UN détail concret mobilisable, ATTENDU sur chaque slide photo. Pas une description. Ne l'omets qu'en dernier recours, si la photo n'offre vraiment aucun détail saisissable.
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
    content = await _deps.callAnthropic({
      model: getModelForAction("content"),
      system: structureSystemPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: messageContent }],
      max_tokens: 3000,
      tool: STRUCTURE_PROPOSAL_TOOL,
    });
  } else {
    content = await _deps.callAnthropic({
      model: getModelForAction("content"),
      system: structureSystemPrompt,
      messages: [{ role: "user", content: structureUserPrompt }],
      max_tokens: 3000,
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

  return new Response(JSON.stringify({ result: structureResult }), {
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

  const deepeningUsage: UsageSink = {};
  const content = await _deps.callAnthropic({
    model: getModelForAction("questions"),
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
    max_tokens: 4096,
    // Questions ancrées sur photos : borne chaque tentative à 60s pour
    // éviter le blocage indéfini d'un fetch qui traîne.
    abortTimeoutMs: 60000,
    tool: QUESTIONS_TOOL,
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

  // ── Photo/mix carousel with description only (no actual photos) ──
  let userPrompt: string;
  if ((body.carousel_type === "photo" || body.carousel_type === "mix") && body.photo_description) {
    const photoDescBlock = `\n\nL'utilisatrice décrit ses photos : "${body.photo_description}". Pose des questions en lien avec ce qu'elle décrit : l'ambiance, le contexte invisible, l'émotion derrière ces images, l'histoire qu'elles racontent ensemble.`;
    userPrompt = buildDeepeningQuestionsPrompt(body, brandingContext, isLinkedIn, recentBriefsContext, brandVocabBlock) + photoDescBlock;
  } else {
    userPrompt = buildDeepeningQuestionsPrompt(body, brandingContext, isLinkedIn, recentBriefsContext, brandVocabBlock);
  }
  return runGenerationAndRespond("deepening_questions", userPrompt, reqCtx);
}

async function selectFinalCarouselCopy(gate: Awaited<ReturnType<typeof runRedacGate>>, ctx: CarouselRequestContext) {
  if (!ctx.semanticReviewEnabled) return gate;
  ctx.emitStatus("correcting");
  const { body } = ctx;
  const content = await _deps.chooseCarouselCopy(gate.content, {
    currentBrief: ctx.currentBrief, sourceContext: ctx.gateInputText, authoredText: ctx.currentAuthoredText, isLinkedIn: ctx.isLinkedIn,
    constraints: { selected_hook: body.selected_hook, selected_offer: body.selected_offer, chosen_angle: body.chosen_angle, editorial_angle: body.editorial_angle, content_structure: body.content_structure, confirmed_structure: body.confirmed_structure, narrative_thread: body.narrative_thread, photo_description: body.photo_description },
  });
  if (content === gate.content) return gate;
  // Recompute deterministic metrics after selection, without another rewrite.
  return await runRedacGate(content, { isLinkedIn: ctx.isLinkedIn, inputText: ctx.gateInputText, brandGuardText: ctx.brandGuardText,
    echo: { previousHooks: ctx.previousHooks, subject: body.subject }, correction: { enabled: false, authoredText: ctx.currentAuthoredText } });
}

function buildSystemPrompt(brandingContext: string, isLinkedIn = false, profile?: any): string {
  return buildCarouselWritingSystem(brandingContext, isLinkedIn, buildIdentityBlock(profile, "rédactrice éditoriale"), CONTENT_CLARITY_RULES);
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

function buildSlidesPrompt(body: any, isLinkedIn = false): string {
  return textWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { narrativeThread: body.narrative_thread }));
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

// Bloc "STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE" injecté en tête de prompt quand
// la structure de slides a été validée à l'étape précédente (proposition de
// plan avant génération). Partagé par les 5 builders de prompt carrousel
// (express, photo, photo+actu, mix, mix+actu) — avant cette extraction (18/08/2026,
// mesure jscpd) c'était le plus gros clone du fichier : chaque builder le
// recopiait avec de menues variantes (champs générés, présence du story_beat/
// visual_anchor/narrative_thread propres au mode photo, règles supplémentaires).
// Les 3 signatures observées sont couvertes par les options ci-dessous — ne
// PAS ajouter de 4e variante sans vérifier qu'elle ne peut pas se ramener à
// l'une des trois existantes.
function buildConfirmedStructureBlock(
  confirmed_structure: any,
  opts: {
    contentFields?: string;
    narrativeThread?: string;
    narrativeContext?: string;
    withStoryBeat?: boolean;
    extraRules?: string[];
  } = {}
): string {
  if (!confirmed_structure || !Array.isArray(confirmed_structure) || confirmed_structure.length === 0) return "";

  const {
    contentFields = "body, visual_schema, caption",
    narrativeThread,
    narrativeContext = "décidé en voyant les photos",
    withStoryBeat = false,
    extraRules = [],
  } = opts;

  const structureList = confirmed_structure
    .map((s: any) => {
      let line = `  Slide ${s.slide_number} — Rôle : ${s.role} — Titre : "${s.title_suggestion}"`;
      if (s.photo_index) line += ` — Photo n°${s.photo_index}${s.slide_type ? ` (${s.slide_type})` : ""}`;
      line += ` — ${s.strategic_note}`;
      if (withStoryBeat) {
        if (s.story_beat) line += `\n    → Raconte : ${s.story_beat}`;
        if (s.visual_anchor) line += `\n    → Détail mobilisable : ${s.visual_anchor}`;
      }
      return line;
    })
    .join("\n");

  const narrativeBlock = withStoryBeat && narrativeThread && typeof narrativeThread === "string" && narrativeThread.trim()
    ? `RÉCIT À EXÉCUTER (${narrativeContext}) : ${narrativeThread.trim()}
Chaque slide écrit UNE étape de ce récit. Tu n'inventes pas une autre histoire, tu exécutes celle-ci.

`
    : "";

  const rules = [
    "Ne change NI l'ordre NI les rôles NI le nombre de slides",
    "Utilise les titres proposés comme base (tu peux les affiner légèrement)",
    `Génère uniquement le contenu (${contentFields}) pour chaque slide`,
    `Le JSON retourné doit contenir exactement ${confirmed_structure.length} slides`,
    "Si une slide a un photo_index, le champ photo_index doit être présent dans le JSON de sortie",
    ...extraRules,
  ];

  return `══════════════════════════════════════
STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE — OBLIGATOIRE
══════════════════════════════════════
${narrativeBlock}Tu DOIS générer le contenu pour EXACTEMENT ces slides dans cet ordre :
${structureList}

RÈGLES ABSOLUES :
${rules.map((r) => `- ${r}`).join("\n")}

`;
}

function buildExpressFullPrompt(body: any, isLinkedIn = false): string {
  return textWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { narrativeThread: body.narrative_thread }));
}

function buildPhotoCarouselPrompt(body: any, isLinkedIn = false): string {
  return photoWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { narrativeThread: body.narrative_thread, withStoryBeat: true }));
}

function buildPhotoCarouselNewsReactionPrompt(body: any, isLinkedIn = false): string {
  return buildPhotoCarouselPrompt(body, isLinkedIn) + NEWS_WRITING;
}

function buildMixCarouselPrompt(body: any, isLinkedIn = false): string {
  return mixWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { narrativeThread: body.narrative_thread, withStoryBeat: true }), buildTextFirstBlock(body));
}

function buildMixCarouselNewsReactionPrompt(body: any, isLinkedIn = false): string {
  return buildMixCarouselPrompt(body, isLinkedIn) + NEWS_WRITING;
}
