import { alignLinkedInHookFields } from "../_shared/linkedin-hook.ts";
import { currentContentContract } from "../_shared/editorial-voice.ts";
import { CONTENT_CLARITY_RULES, claritySourceBlock } from "../_shared/content-clarity.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CORE_PRINCIPLES, FRAMEWORK_SELECTION, FORMAT_STRUCTURES, WRITING_RESOURCES, ANTI_SLOP, CHAIN_OF_THOUGHT, ANTI_BIAS, PREGEN_INJECTION_RULES, EDITORIAL_ANGLES_REFERENCE, VISUAL_ANALOGIES, LINKEDIN_TEMPLATES, EMBEDDED_EDUCATION } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildProfileBlock, buildPreGenFallback, buildBrandGuardText } from "../_shared/user-context.ts";
import { parseAudienceAddress, type AudienceAddress } from "../_shared/audience-address.ts";
import { enforceAudienceAddressInFields } from "../_shared/audience-address-fields.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError, clampAiField, adjustContentField } from "../_shared/input-validators.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";

import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction, AnthropicError, forcesDisabledThinking, type UsageSink } from "../_shared/anthropic.ts";
import { runWithHeartbeatSSE } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { buildDepthBlock } from "../_shared/depth-research.ts";
import { livedCaseFromCreativeBody, LIVED_CASE_FIRST, NEWS_FEELING_FIRST } from "../_shared/lived-case.ts";
import { carouselBrief, reelBrief, storiesBrief, linkedinBrief, pinterestBrief, newsletterBrief, photoCaptionBrief, captionBrief, positionDepthBlock } from "../_shared/format-briefs.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { buildSeriesContext } from "../_shared/series-context.ts";
import { applyCorrectionPass, storiesAuditableText } from "../_shared/correction-pass.ts";
import { analyzeTextRedac, textRedacViolations, hookEchoesBefore } from "../_shared/redac-gate.ts";
import { logContentQuality } from "../_shared/content-quality.ts";
import { fetchPreviousHooks, fetchPreviousHooksByFormat } from "../_shared/previous-hooks.ts";
import { reelAuditableText } from "../_shared/reel-postprocess.ts";
import { stripMarkdownFromNewsletter } from "../_shared/strip-markdown.ts";
import { recapHooksLine } from "../_shared/multi-subject.ts";
import { adoptStructuredStories, finalizeStoriesLayout, stripStoriesWriterLayout } from "../_shared/story-formatting.ts";
import { GENERATE_ABORT_MS, ADJUST_ABORT_MS, LIGHT_ABORT_MS, gateNumbers, _deps, addrOpts, POST_ADDRESS_FIELDS } from "./shared.ts";
import { applyNewsletterCorrectionPass, runNewsletterTwoStep } from "./formats/newsletter.ts";
import { photoVoiceRule } from "./shared.ts";
import { isExplicitlyFictionalBrief, isFactualFictionalLinkedInBrief, alignFactualLinkedInHook, buildFictionalLinkedInQuestions, applyLinkedInCorrectionPass, streamLinkedInPhotoVision, runLinkedInTwoStep } from "./formats/linkedin.ts";
import { STORIES_ADDRESS_FIELDS, type StoriesGateResult, applyStoriesCorrectionPass, finalizeRecycledStories } from "./formats/stories.ts";
import { HOOKS_ADDRESS_FIELDS, normalizeHooksResponse, applyReelQualityPass } from "./formats/reel.ts";
import { streamDefaultPostSSE } from "./formats/post.ts";
import { QUESTIONS_TOOL } from "./shared.ts";
import { runVisionQuestions, runVisionGenerate } from "./formats/photo.ts";
import { enforceCarouselObjectAudienceAddress, retiredCarouselStreamResponse } from "./formats/carousel.ts";
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

// buildBrandingContext replaced by shared getUserContext + formatContextForAI

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
        description: "TABLEAU de 3 objets hook — jamais une chaîne de caractères, jamais du JSON stringifié",
        items: {
          type: "object",
          properties: {
            type: { type: "string", description: "vecu_perso | contre_intuition | objection_retournee | question_choc | fait_brut | scene_coupee" },
            type_label: { type: "string", description: "label court lisible du type, ex. « Vécu perso »" },
            text: { type: "string", description: "le hook PARLÉ, 8-20 mots, 1-2 phrases, tension immédiate" },
            text_overlay: { type: "string", description: "texte à l'écran en muet : extrait de 3 à 8 mots du hook parlé (text), recopié tel quel, qui se comprend seul ; casse normale, pas de majuscules imposées" },
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

export function buildFollowUpPrompt(params: {
  QUESTIONS_PREFIX: string;
  brandingContext: string;
  brandVocabBlock: string;
  context: string;
  answers: any[];
}): { systemPrompt: string; userPrompt: string } {
  const { QUESTIONS_PREFIX, brandingContext, brandVocabBlock, context, answers } = params;
  const answersBlock = answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n");
  const systemPrompt = `${QUESTIONS_PREFIX}
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
  const userPrompt = "Pose-moi 1 ou 2 questions d'approfondissement basées sur mes réponses.";
  return { systemPrompt, userPrompt };
}

// Carrousel et stories retouchés dans « Modifier » : le texte est découpé par des
// lignes repères que le front relit pour remettre chaque texte à sa place
// (src/features/creer/edited-text.ts, lot 7 du 14/10/2026). Sans ces repères,
// l'ajustement ne peut pas être enregistré. Bloc absent pour les autres formats.
const ADJUST_MARKER_RE = /^[ \t]*---[ \t]*(?:SLIDE[ \t]+\d+|STORY[ \t]+\d+|CAPTION)\b.*---[ \t]*$/;
function adjustMarkersBlock(currentContent: string): string {
  const markers = String(currentContent || "").split("\n").filter((l) => ADJUST_MARKER_RE.test(l)).length;
  if (!markers) return "";
  return `\n\nREPÈRES À CONSERVER : le contenu est découpé par ${markers} lignes repères de la forme « --- … --- ». Recopie chacune de ces lignes à l'identique et dans le même ordre, sans en ajouter, en retirer ni en fusionner : elles servent à remettre chaque texte à sa place. Ajuste seulement le texte entre les repères.`;
}

export function buildAdjustPrompt(params: {
  COMMON_PREFIX: string;
  editorialFormatLabel?: string | null;
  effectiveObjective?: string | null;
  angle: any;
  currentContent: string;
  adjustment: string;
  sourceContext?: string;
}): { systemPrompt: string; userPrompt: string } {
  const { COMMON_PREFIX, editorialFormatLabel, effectiveObjective, angle, currentContent, adjustment, sourceContext } = params;
  // Smart guidance based on adjustment type
  const adjustLower = (adjustment || "").toLowerCase();
  let adjustGuidance = "";
  if (adjustLower.includes("long")) {
    const isCarouselContent = currentContent?.includes("SLIDE") || currentContent?.includes("📌");
    adjustGuidance = isCarouselContent
      ? "AJOUTE une slide supplémentaire qui développe un point existant en profondeur. Ne rallonge pas les slides existantes."
      : "Développe l'idée principale avec un exemple concret ou une anecdote. Ne rallonge pas artificiellement avec des transitions vides.";
  } else if (adjustLower.includes("court")) {
    adjustGuidance = "Coupe les transitions faibles et les répétitions. Garde le sujet explicite, les faits de départ, les attributions et les exemples utiles. Ne sacrifie ni la compréhension ni la profondeur.";
  } else if (adjustLower.includes("punchy")) {
    adjustGuidance = "Resserre chaque idée et coupe les détours, en gardant des phrases complètes et parlées qui s'enchaînent : pas de fragments sans verbe, pas de phrases-slogans en série, sans cheville de relance ni phrase isolée pour faire de l'effet. L'accroche doit claquer plus fort, avec un détail du sujet.";
  } else if (adjustLower.includes("exemples") || adjustLower.includes("concret")) {
    adjustGuidance = "Remplace les conseils abstraits par des situations concrètes. Chaque point doit avoir un exemple terrain, un cas réel, ou un chiffre.";
  } else if (adjustLower.includes("storytelling") || adjustLower.includes("histoire")) {
    adjustGuidance = "Restructure autour d'une narration. Commence par un moment précis (lieu, émotion), développe la tension, puis la résolution.";
  } else if (adjustLower.includes("chiffres") || adjustLower.includes("données") || adjustLower.includes("stats")) {
    adjustGuidance = "Ajoute 2-3 données chiffrées. Si pas de chiffres exacts disponibles, indique [STAT À VÉRIFIER] pour que l'utilisatrice insère les vrais chiffres.";
  }

  const systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${FORMAT_STRUCTURES}

${WRITING_RESOURCES}

${editorialFormatLabel ? `FORMAT ÉDITORIAL : ${editorialFormatLabel}` : ""}
${effectiveObjective ? `OBJECTIF : ${effectiveObjective}` : ""}
${angle ? `ANGLE : ${angle.title} (${angle.tone})` : ""}

${claritySourceBlock(sourceContext)}
CONTENU ACTUEL :
"""
${currentContent}
"""

AJUSTEMENT DEMANDÉ : ${adjustment}
${adjustGuidance ? `\nGUIDE :\n${adjustGuidance}` : ""}${adjustMarkersBlock(currentContent)}

Réécris le contenu avec l'ajustement demandé. Garde la structure, les anecdotes et les mots de l'utilisatrice. Change UNIQUEMENT ce qui est lié à l'ajustement.
Ne raccourcis JAMAIS la profondeur sauf si l'ajustement demande explicitement de raccourcir.

Réponds UNIQUEMENT en JSON :
{
  "content": "..."
}`;
  const userPrompt = `Ajuste le contenu : ${adjustment}`;
  return { systemPrompt, userPrompt };
}

export function buildDictationPrompt(params: {
  COMMON_PREFIX: string;
  sourceText: string;
  targetFormat: string;
}): { systemPrompt: string; userPrompt: string } {
  const { COMMON_PREFIX, sourceText, targetFormat } = params;
  const systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${WRITING_RESOURCES}

L'utilisatrice a dicté ceci en mode vocal :
"""
${sourceText}
"""

Transforme en : ${targetFormat}

RÈGLES ABSOLUES :
- Garde SES mots : reprends telles quelles les tournures qu'elle emploie réellement dans le texte source.
- Garde SON rythme. Si elle fait des phrases longues qui déroulent, garde ça.
- Garde SES expressions, même familières ou imparfaites : c'est sa voix.
- NE réécris PAS dans un style "professionnel". Structure, c'est tout.
- Tu peux couper les répétitions et les hésitations.
- Tu peux réorganiser l'ordre pour plus de clarté.
- Tu DOIS garder l'énergie et la personnalité de l'oral.

Le résultat doit sonner comme si ELLE l'avait écrit, pas comme si une IA avait reformulé.

Réponds UNIQUEMENT en JSON :
{
  "content": "..."
}`;
  const userPrompt = `Structure ma dictée vocale en ${targetFormat}.`;
  return { systemPrompt, userPrompt };
}

export function buildAnglesPrompt(params: {
  COMMON_PREFIX: string;
  editorialFormatLabel?: string | null;
  contentType?: string | null;
  context: string;
  effectiveObjective?: string | null;
  calendarBlock: string;
}): { systemPrompt: string; userPrompt: string } {
  const { COMMON_PREFIX, editorialFormatLabel, contentType, context, effectiveObjective, calendarBlock } = params;
  const editorialCtx = editorialFormatLabel
    ? `\nFORMAT ÉDITORIAL CHOISI : "${editorialFormatLabel}"\nL'utilisatrice a choisi ce format parmi les 13 angles éditoriaux. Les 3 angles proposés doivent être des VARIATIONS de "${editorialFormatLabel}", pas des formats complètement différents.\nChaque angle prend un POINT D'ENTRÉE différent dans le sujet, mais tous suivent la logique de "${editorialFormatLabel}".\nExemple : si elle a choisi "Mythe à déconstruire", les 3 angles déconstruisent le même sujet mais avec 3 approches différentes (données vs vécu vs comparaison).\n`
    : "";

  const systemPrompt = `${COMMON_PREFIX}

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
  const userPrompt = `Propose-moi 3 angles éditoriaux pour : ${context}`;
  return { systemPrompt, userPrompt };
}

export function buildHooksPrompt(params: {
  COMMON_PREFIX: string;
  answers?: any[];
  excludeHooksRaw: unknown;
  faceCam?: string | null;
  context: string;
  effectiveObjective?: string | null;
  objective?: string | null;
}): { systemPrompt: string; userPrompt: string } {
  const { COMMON_PREFIX, answers, excludeHooksRaw, faceCam, context, effectiveObjective, objective } = params;
  // Lot 7 reels : proposer 3 angles d'attaque AVANT la génération complète.
  // Étape gratuite (hors BILLED_STEPS) ; le hook choisi repart en selected_hook.
  const answersBlock = answers?.length
    ? "\n\nMATIÈRE DU BRIEF (réponses de l'utilisatrice, sa vraie voix) :\n" +
      answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
    : "";
  const excludeHooks: string[] = Array.isArray(excludeHooksRaw)
    ? excludeHooksRaw.filter((x: unknown): x is string => typeof x === "string").slice(0, 12)
    : [];
  const excludeBlock = excludeHooks.length
    ? `\n\nHOOKS DÉJÀ PROPOSÉS, REFUSÉS PAR L'UTILISATRICE :\n${excludeHooks.map((h) => `- "${h}"`).join("\n")}\nINTERDIT de les reproposer, même reformulés. Change d'angle, pas juste de mots.`
    : "";
  const noFaceCam = faceCam === "non";
  const recapLine = recapHooksLine(context);

  const systemPrompt = `${COMMON_PREFIX}

TA MISSION : proposer 3 HOOKS d'ouverture pour un REEL Instagram sur le sujet donné.
Le hook = les 3 premières secondes. 50 % des viewers scrollent avant la 3e seconde :
c'est LE levier de rétention. L'utilisatrice choisit UN hook, le script complet sera
écrit dessus.${recapLine}

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
3. text_overlay = ce qu'on LIT à l'écran en MUET (3-8 mots) : UNIQUEMENT ses mots,
   un extrait du hook parlé (text) recopié tel quel, celui qui fonctionne SEUL sans
   le son et porte son mot ou chiffre fort. Jamais une information que le parlé ne
   dit pas. Casse normale d'une phrase, pas de majuscules imposées.
4. AUCUN chiffre qui ne vient pas du brief, des réponses ou du branding.
5. SINGULARITÉ : pas le hook consensuel de la niche. Ancre dans SON métier, SES mots,
   SA matière (contexte de marque ci-dessus).
5bis. FRANÇAIS IRRÉPROCHABLE — relis chaque hook à voix haute : élisions (« l'avant/après »,
   jamais « le avant/après ») et homophones (« qu'UN marchand de biens, ça… », jamais
   « qu'on marchand de biens ») ; le hook choisi part TEL QUEL dans le script final.
6. format_recommande = la structure que ce hook appelle naturellement
   (face_cam_confession / voix_off_broll / hook_loop) et duree_cible = durée estimée
   cohérente avec l'objectif (visibilité → court ~20-30 s ; confiance/vente → ~40-60 s).${noFaceCam ? `
7. L'UTILISATRICE NE VEUT PAS SE MONTRER : format_recommande ≠ face_cam_confession
   pour les 3 hooks (voix off + b-roll ou hook loop uniquement).` : ""}${recapLine ? `
8. REEL RÉCAP (prime sur les règles 1 à 6) : chacun des 3 hooks ouvre la SÉRIE de sujets (ce qu'ils ont en commun, ou l'annonce de leur nombre), jamais un seul des sujets. Les types restent différents.` : ""}${excludeBlock}`;
  const userPrompt = `SUJET DU REEL : "${context || "?"}"
Objectif : ${effectiveObjective || objective || "non précisé"}${answersBlock}

Propose-moi 3 hooks de types différents pour ce reel.${recapLine ? " C'est un reel récap : chaque hook annonce la série de sujets, pas un seul sujet." : ""}`;
  return { systemPrompt, userPrompt };
}

/**
 * Format qui choisit la branche de rédaction. Le format demandé par
 * l'utilisatrice (`contentType`) prime TOUJOURS ; `angle.format_livraison`
 * (suggestion IA du step "angles") ne sert que s'il n'y a pas de contentType.
 * Avant : format_livraison passait devant, un angle « carrousel » pouvait
 * faire rédiger un carrousel pour un post LinkedIn demandé.
 */
export function resolveFormatHint(contentType: string | null | undefined, angle: { format_livraison?: unknown } | null | undefined): string {
  const requested = typeof contentType === "string" ? contentType.trim().toLowerCase() : "";
  if (requested) return requested;
  return typeof angle?.format_livraison === "string" ? angle.format_livraison.toLowerCase() : "";
}

export function buildQuestionsPrompt(params: {
  QUESTIONS_PREFIX: string;
  brandingContext: string;
  brandVocabBlock: string;
  context: string;
  contentType?: string | null;
  editorialFormatLabel?: string | null;
  angle: any;
  calendarBlock: string;
  objectiveBlock: string;
  newsContextBlock: string;
  recentBriefsContext: string;
}): { systemPrompt: string; userPrompt: string } {
  const { QUESTIONS_PREFIX, brandingContext, brandVocabBlock, context, contentType, editorialFormatLabel, angle, calendarBlock, objectiveBlock, newsContextBlock, recentBriefsContext } = params;
  // Canal détecté par inclusion : le front envoie « linkedin_post » (questions)
  // et « post_linkedin » (génération) ; une égalité stricte laissait passer
  // « linkedin_post » → canal « Instagram » dans les questions d'un parcours LinkedIn.
  const ctypeQ = String(contentType || "").toLowerCase();
  const isLinkedIn = ctypeQ.includes("linkedin");
  const isNewsletterQ = !isLinkedIn && (ctypeQ.includes("newsletter") || ctypeQ.includes("email"));
  const isPinterestQ = !isLinkedIn && !isNewsletterQ && ctypeQ.includes("pinterest");
  const channelLabel = isLinkedIn ? "LinkedIn" : isNewsletterQ ? "Newsletter" : isPinterestQ ? "Pinterest" : "Instagram";
  const linkedinStory = isLinkedIn && /storytelling|coulisses|récit|histoire/i.test([editorialFormatLabel, angle?.title].filter(Boolean).join(" "));
  const channelGuidance = linkedinStory
    ? "Questions orientées RÉCIT PERSONNEL : demande d'abord ce que la personne veut raconter d'elle-même, puis un moment réel (lieu et action) et ce qu'elle pensait ou ressentait. Son plaisir de travailler ou de transmettre peut être le sujet. N'exige ni crise, ni résultat business, ni leçon universelle. Une citation ou un dialogue ne doivent venir que d'un souvenir fourni."
    : isLinkedIn
    ? "Questions orientées POINT DE VUE : demande ce que la personne veut exprimer sur ce sujet, puis un choix, une observation ou un fait réel. Si le sujet est un moment vécu, explore son expérience personnelle avant de demander ce qu'elle enseigne aux autres. N'exige pas une prise de position conflictuelle ni un résultat business."
    : isNewsletterQ
    ? "Questions orientées PROFONDEUR : demande des réflexions de fond, des convictions, des retours d'expérience détaillés."
    : "Questions orientées ÉMOTION : demande des moments vécus, des ressentis, des transformations personnelles, des coulisses.";
  const questionTypes = linkedinStory
    ? `   - INTENTION : qu'est-ce que la personne souhaite raconter d'elle-même à travers ce moment ?
   - SCÈNE VÉCUE : où était-elle, que faisait-elle, et quel geste ou choix compte dans cette histoire ?
   - PENSÉE / ÉMOTION : qu'est-ce qui lui traversait l'esprit ou qu'est-ce qu'elle ressentait, avec ses mots ?
   - DÉROULÉ : qu'a-t-elle fait ensuite et qu'est-ce qui lui plaît ou lui reste de ce moment ?`
    : `   - ANECDOTE : un moment précis vécu sur ce sujet
   - POINT DE VUE : ce que la personne pense de ce sujet, sans conflit obligatoire
   - PROCESS / MÉTHODE : ce qu'elle fait concrètement
   - OBSERVATION : ce qu'elle voit revenir
   - CONVICTION : ce qu'elle défend quand c'est pertinent`;

  const systemPrompt = `${QUESTIONS_PREFIX}
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
${angle ? `- Angle : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}
${angle.format_livraison ? `- Format de livraison recommandé : ${angle.format_livraison}` : ""}` : "- Angle : pas d'angle choisi, pars du sujet."}
${calendarBlock}${objectiveBlock}${newsContextBlock}
${recentBriefsContext}
${newsContextBlock ? "\n⚠️ NEWSJACKING ACTIF : au moins 1 question sur 3 doit aider à faire le pont entre cette actualité et le vécu / l'opinion / l'expertise de l'utilisatrice (pas une question générique sur le sujet).\n" : ""}

══ AVANT DE POSER LES QUESTIONS — RAISONNEMENT INTERNE (ne PAS afficher) ══

Réfléchis silencieusement à :
1. Quel est le SUJET COURANT ? (ré-extraire 1 mot-clé du bloc ci-dessus)
2. Quel vocabulaire métier de l'utilisatrice puis-je intégrer naturellement ?
3. Y a-t-il un sujet identique dans l'historique récent ? Si oui, quelle question NE PAS reposer ?

Puis pose les 3 questions qui maximisent la matière personnelle apportée sur CE sujet.

Pose exactement 3 questions pour récupérer SA matière première sur le sujet courant. Ces questions doivent extraire les faits, intentions et formulations personnels utiles à ce contenu.

RÈGLES :
1. ANCRAGE SUJET (règle n°1, non négociable) : chaque question DOIT contenir un mot du sujet courant ou un aspect concret directement déductible du sujet courant. Une question qui ne référence pas le sujet courant est invalide — réécris-la.
2. Priorise ce qui manque pour écrire juste sur CE sujet : un fait précis, un exemple, un choix, une nuance. Creuse une conviction quand elle sert le propos, sans imposer une introspection. Ne redemande pas une information déjà fournie.
3. ${channelGuidance}
4. Questions OUVERTES (pas oui/non).
   Tutoie l'utilisatrice comme le reste de l'interface. Ne présuppose pas une motivation, une émotion, un bénéfice produit ou une rencontre ; laisse-la confirmer ou dire qu'elle ne sait pas.
5. Choisis des questions complémentaires parmi les types utiles au sujet, sans quota par type :
${questionTypes}
   ⚠️ INTERDIT de faire 3 questions "Raconte-moi une fois où…". Une question peut recueillir la scène, les autres son intention et son ressenti ou son choix.
6. Le ton des questions est chaleureux et curieux (comme une amie qui s'intéresse vraiment).
7. Chaque question a un placeholder qui donne un mini-exemple de réponse SPÉCIFIQUE au sujet courant.
8. ORIENTÉES vers l'objectif sans écraser l'intention du sujet : vente peut demander un choix ou un résultat réel ; engagement un vécu ou une émotion ; visibilité un regard personnel ; crédibilité une méthode ou une preuve. N'exige ni conflit, ni transformation, ni chiffre lorsque la personne raconte simplement ce qu'elle aime faire.
${recentBriefsContext ? "9. MÉMOIRE ANTI-RÉPÉTITION : l'historique ci-dessus liste des sujets DIFFÉRENTS déjà traités. Tu ne dois JAMAIS importer leur contenu, leur vocabulaire spécifique ou leurs scènes dans tes questions sur le sujet courant. Ils servent uniquement à éviter de re-poser une question identique." : ""}

INTERDIT — NE FAIS JAMAIS ÇA :
- Questions génériques type "Qu'est-ce qui te passionne dans ton métier ?", "Quel est ton parcours ?", "Qu'est-ce qui te différencie ?"
- Questions de coaching de vie déconnectées du sujet
- Questions trop larges qui pourraient s'appliquer à N'IMPORTE QUEL sujet
- 3 questions qui commencent toutes par "Raconte-moi" ou "Il y a eu un moment où"
- Questions interchangeables d'un user à l'autre (= sans vocabulaire métier)
- ⚠️ Questions qui mentionnent des éléments venus de l'historique des briefs précédents (scènes, lieux, personnages, anecdotes d'anciens briefs) — l'historique ne sert PAS de matière narrative pour le sujet courant
- Chaque question DOIT mentionner le sujet courant ou un aspect concret du sujet courant

Cherche des formulations propres au sujet courant ; ne reprends aucun exemple de question prévu pour un autre sujet.

Réponds UNIQUEMENT en JSON :
{
  "questions": [
    {
      "question": "...",
      "placeholder": "..."
    }
  ]
}`;
  const userPrompt = `Pose-moi 3 questions pour créer mon contenu sur ce sujet précis : "${context}"${angle ? ` (angle "${angle.title}")` : ""}.`;
  return { systemPrompt, userPrompt };
}

export async function buildGeneratePrompt(params: {
  supabase: any;
  userId: string;
  workspace_id?: string | null;
  body: any;
  COMMON_PREFIX: string;
  context: string;
  contentType?: string | null;
  editorialFormat?: string | null | undefined;
  editorialFormatLabel?: string | null;
  angle: any;
  answers?: any[];
  followUpAnswers?: any[];
  calendarBlock: string;
  objectiveBlock: string;
  newsContextBlock: string;
  preGenBlock: string;
  effectiveObjective?: string | null | undefined;
  pinterest_link?: string | null | undefined;
  pinterest_board?: string | null | undefined;
  variation?: boolean | null;
  previousContent?: string | null;
  isCarousel: boolean;
  isReel: boolean;
  isStories: boolean;
  isLinkedIn: boolean;
  isPinterest: boolean;
  isNewsletter: boolean;
  isPhotoMode: boolean;
  /** Tu ou vous de la fiche de marque : remplace les consignes d'adresse figées des stories (04/10/2026). */
  audienceAddress?: AudienceAddress | null;
}): Promise<{ systemPrompt: string; userPrompt: string; storiesPhotoCatalog: { index: number; id: string; description: string; preferred?: boolean }[] }> {
  const {
    supabase, userId, workspace_id, body, COMMON_PREFIX, context, contentType, editorialFormat, editorialFormatLabel,
    angle, answers, followUpAnswers, calendarBlock, objectiveBlock, newsContextBlock, preGenBlock, effectiveObjective,
    pinterest_link, pinterest_board, variation, previousContent,
    isCarousel, isReel, isStories, isLinkedIn, isPinterest, isNewsletter, isPhotoMode,
  } = params;

  let storiesPhotoCatalog: { index: number; id: string; description: string; preferred?: boolean }[] = [];

  const answersBlock = answers?.length
    ? answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
    : "";

  if (isLinkedIn && !isPhotoMode && isFactualFictionalLinkedInBrief(context)) {
    return {
      systemPrompt: `Tu écris en français un court post LinkedIn factuel sur un exemple explicitement fictif. Le brief et les réponses éventuelles sont tes seules sources. Ignore le profil de marque, les angles, le calendrier et les objectifs externes. Commence par indiquer que l'exemple est fictif, puis présente seulement les caractéristiques affirmées dans le brief. Si la source contient quatre faits, quatre faits suffisent : le texte doit rester court. N'ajoute ni contexte de test, ni exercice de communication, ni commentaire sur la rédaction, ni morale ou conseil. Ne transforme pas les interdictions du brief en une liste de propriétés absentes. Ne déduis ni commande, ni disponibilité, ni fabrication, ni intention personnelle. Un mode de retrait n'implique pas que l'objet est « disponible » : formule seulement « retrait uniquement dans… » si c'est le fait fourni. N'écris à la première personne que si la source contient des propos personnels à reprendre. Réponds uniquement en JSON valide : {"content":"post complet avec phrase d'ouverture","accroche":"copie exacte de la première ligne de content","format":"linkedin","pillar":"","objectif":"","personal_tip":null}.`,
      userPrompt: `BRIEF FACTUEL FICTIF :\n${context}${answersBlock ? `\n\nPRÉCISIONS DE L'UTILISATRICE :\n${answersBlock}` : ""}\n\nRédige le post LinkedIn sur le sujet du brief, sans reprendre ses consignes de contrôle dans le post.`,
      storiesPhotoCatalog,
    };
  }
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
      audienceAddress: params.audienceAddress ?? null,
      photo_catalog: storiesPhotoCatalog.map(({ index, description, preferred }) => ({
        index,
        description,
        chosen: preferred || undefined,
      })),
    });
  } else if (isLinkedIn) {
    depthMandate = linkedinBrief(editorialFormat ?? null);
  } else if (isPinterest) {
    depthMandate = pinterestBrief(pinterest_link ?? null, pinterest_board ?? null);
  } else if (isNewsletter) {
    depthMandate = newsletterBrief();
  } else if (isPhotoMode) {
    depthMandate = photoCaptionBrief(body.photo_description);
  } else {
    depthMandate = captionBrief(effectiveObjective ?? null);
  }
  // Posts (hors légende photo), reels et stories défendent une position (#1292 pour le carrousel).
  const positionFormat = isReel ? "reel" : isStories ? "stories"
    : (!isCarousel && !isLinkedIn && !isPinterest && !isNewsletter && !isPhotoMode) ? "caption" : null;
  // « Ton cas d'abord » (04/10/2026) : avec un cas personnel fourni, la lecture
  // sociale en « on / nous » laisse la place à son vécu, preuve centrale.
  // Actu (05/10/2026) : l'accroche de l'IA n'est jamais un vécu ; avec ses
  // réponses, « l'actu déclenche, son ressenti porte le contenu ».
  const caseMode = livedCaseFromCreativeBody(body).mode;
  if (positionFormat) depthMandate += `\n\n${positionDepthBlock(positionFormat, !!newsContextBlock, caseMode)}`;
  else if (isLinkedIn && caseMode === "own_case") depthMandate += `\n\n${LIVED_CASE_FIRST}`;
  else if (isLinkedIn && caseMode === "news_feeling") depthMandate += `\n\n${NEWS_FEELING_FIRST}`;

  let systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${isLinkedIn || isPinterest || isNewsletter || isStories ? "" : FORMAT_STRUCTURES}

${isLinkedIn || isPinterest || isStories ? "" : WRITING_RESOURCES}

${isLinkedIn || isPinterest || isNewsletter || isStories ? "" : VISUAL_ANALOGIES}

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
${isStories ? "Rédige la séquence en suivant le FORMAT et les GARDE-FOUS ci-dessus." : "Rédige le contenu en suivant les INSTRUCTIONS DE RÉDACTION FINALE ci-dessus."}
Le contenu doit être PRÊT À POSTER (pas un brouillon).
${currentContentContract([context, answersBlock, followUpBlock].filter(Boolean).join("\n"))}

${isReel || isStories ? `` : isNewsletter ? `Un email part en TEXTE BRUT : aucune valeur ne doit contenir de markdown (**gras**, *italique*, ## titres) — les astérisques s'afficheraient tels quels chez le lecteur. Pour un aparté, utilise des parenthèses.

Réponds UNIQUEMENT en JSON :
{
  "subject": "objet de l'email (max 50 caractères, accrocheur, jamais 'Newsletter #N')",
  "preview_text": "texte de preview (40-90 caractères, situe le sujet si l'objet est allusif, fidèle au corps)",
  "content": "corps complet de la newsletter : situation identifiable dans les premières phrases, même sans lire l'objet (avec \\n\\n entre paragraphes)",
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
  const userPrompt = "Rédige mon contenu à partir de mes réponses et de l'angle choisi.";

  return { systemPrompt, userPrompt, storiesPhotoCatalog };
}

// ═══ TÉLÉMÉTRIE QUALITÉ (stories / reel / LinkedIn) ═══
// Les carrousels loggent leur score de gate à chaque génération (Brique 1,
// content_quality_events) → le juge du bilan hebdo les note. Les autres
// formats en étaient absents (angle mort connu). Mesure LÉGÈRE
// (analyzeTextRedac, zéro appel LLM) sur le texte FINAL, MÊME formule de
// score que redacScore sur les dimensions du texte libre (retournements /
// formules moulées / chiffres inventés), + aperçu pour l'échantillon du juge.
// Fire-and-forget : logContentQuality n'interrompt jamais la génération et
// exclut déjà les comptes QA. La newsletter (retour SSE anticipé) se logge
// dans son propre bloc ; le LinkedIn STREAMÉ reste hors couverture ici (il
// ne passe pas par cette queue) — angle mort résiduel connu.
async function logGenerationQualityTelemetry(parsed: any, params: {
  userId: string;
  context: string;
  body: any;
  newsContext?: string | null;
  fullContext: string;
  researchSource?: string;
  brandGuardText?: string;
  finalUsage: UsageSink;
  workspace_id?: string | null;
  isStories: boolean;
  isReel: boolean;
  isLinkedIn: boolean;
  /** Accroches déjà écrites sur ce sujet : la redite compte dans le score mesuré (24/08). */
  previousHooks?: string[];
  /** Résultat de la passe stories (score APRÈS correction) : loggé tel quel, sans re-mesure. */
  storiesGate?: StoriesGateResult | null;
  /** Échos d'accroche AVANT correction (reel / LinkedIn), rendus par leur passe. */
  hookEchoesBefore?: number;
}): Promise<void> {
  const { userId, context, body, newsContext, fullContext, researchSource, brandGuardText, finalUsage, workspace_id, isStories, isReel, isLinkedIn, previousHooks, storiesGate, hookEchoesBefore: echoesBefore } = params;
  const qualityNumbers = () =>
    gateNumbers([
      typeof context === "string" ? context : "",
      body.answers ? JSON.stringify(body.answers) : "",
      (body.preGenAnswers || body.pre_gen_answers) ? JSON.stringify(body.preGenAnswers || body.pre_gen_answers) : "",
      typeof newsContext === "string" ? newsContext : "",
      fullContext || "",
    ], researchSource);
  const logTextQuality = async (format: string, text: string, previewDoc: unknown, gate?: StoriesGateResult | null, hookEchoesBefore?: number) => {
    try {
      let score: number, violations: number, repassed = false;
      if (gate) {
        ({ score, violations, repassed } = gate);
      } else {
        const { allowed, research } = qualityNumbers();
        const a = analyzeTextRedac(text, allowed, brandGuardText, {
          previousHooks,
          subject: typeof context === "string" ? context : undefined,
        }, research);
        violations = textRedacViolations(a);
        score = Math.max(40, 100 - 10 * violations);
      }
      await logContentQuality(
        userId,
        format,
        { score, violations, repassed, content: JSON.stringify(previewDoc), hookEchoesBefore: gate ? gate.hook_echoes_before : hookEchoesBefore },
        finalUsage.model,
        workspace_id ?? undefined,
        typeof context === "string" ? context : undefined,
      );
    } catch (e) {
      console.error(`[creative-flow] log qualité ${format} ignoré (génération intacte):`, (e as any)?.message || e);
    }
  };

  if (isStories && Array.isArray(parsed?.stories)) {
    // Texte audité = texte des stories (les pastilles en sont des extraits depuis le 04/10/2026), même mesure que la passe.
    await logTextQuality("stories", storiesAuditableText(parsed.stories), { stories: parsed.stories }, storiesGate);
  } else if (isReel && Array.isArray(parsed?.script)) {
    await logTextQuality("reel", reelAuditableText(parsed), { script: parsed.script }, null, echoesBefore);
  } else if (isLinkedIn && typeof parsed?.content === "string" && parsed.content.trim()) {
    // Sans `subject` : l'accroche enregistrée est la 1re ligne du POST (avec
    // `subject`, c'était le sujet lui-même, inutile à la garde anti-redite qui
    // retire les mots du sujet avant de comparer).
    await logTextQuality("linkedin", parsed.content, { content: parsed.content }, null, echoesBefore);
  }
}

/**
 * Recherche « creuser le sujet » pour posts, reels et stories (04/10/2026, même
 * logique que le carrousel depuis #1292) : mécanisme réel, lecture sociale et faits
 * sourcés qui étayent une position. L'actu ne donne que le déclencheur, les réponses
 * le vécu. Condiment : échec silencieux, borné à 20 s (budget reel 90 s + 45 s).
 */
/** Stories sur son propre cas (« Ton cas d'abord », mode own_case) : aucune
 * recherche « creuser le sujet », donc aucun chiffre de recherche (décision de
 * Laetitia du 05/10/2026). L'actu, les autres formats et les stories sans cas
 * fourni gardent la recherche. */
export function skipDepthResearch(isStories: boolean, lived: { mode: string }): boolean {
  return isStories && lived.mode === "own_case";
}

export async function creativeDepthBlock(params: { context?: string | null; newsContext?: string | null; activity?: string; livedCase?: string }): Promise<string> {
  const subject = typeof params.context === "string" ? params.context.trim() : "";
  if (!subject) return "";
  const newsAngle = typeof params.newsContext === "string" ? params.newsContext.trim().slice(0, 600) : "";
  // « Ton cas d'abord » (04/10/2026) : cas personnel fourni → vérification d'un point, au plus un fait.
  const mode = params.livedCase?.trim() ? "support" : "depth";
  const material = await _deps.fetchDepthMaterial({
    mode,
    livedCase: params.livedCase,
    subject: [subject.slice(0, 1500), newsAngle].filter(Boolean).join("\n"),
    activity: params.activity,
    model: getModelForAction("content"),
    apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
    logger: (m) => console.log(`[creative-flow] ${m}`),
    timeoutMs: 20_000,
  });
  return buildDepthBlock(material, mode);
}

/**
 * Bloc Deep Research (recherche web via l'outil Anthropic web_search), extrait
 * de serve() pour être testable directement (deno test, sans vrai serveur
 * HTTP — voir index_test.ts). Comportement inchangé : ne débite un crédit
 * `deep_research` QUE si la recherche web a réellement réussi (searchResponse.ok).
 * Renvoie le texte à ajouter au systemPrompt, "" si rien à ajouter (échec ou
 * réponse vide).
 */
export async function runDeepResearchWebSearch(params: {
  userId: string;
  workspaceId?: string;
  calendarContext?: { theme?: string } | null;
  context?: string | null;
  contentType?: string | null;
  profile?: { activite?: string } | null;
  effectiveObjective?: string | null;
  objective?: string | null;
  editorialFormatLabel?: string | null;
  angle?: { title?: string } | null;
}): Promise<string> {
  const { userId, workspaceId, calendarContext, context, contentType, profile, effectiveObjective, objective, editorialFormatLabel, angle } = params;

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

  if (!searchResponse.ok) {
    console.error("Deep research web search failed:", searchResponse.status);
    return "";
  }

  const searchData = await searchResponse.json();
  const webSearchTokens = (searchData.usage?.input_tokens ?? 0) + (searchData.usage?.output_tokens ?? 0);
  // Extract all text blocks from the response
  const textParts: string[] = [];
  for (const block of (searchData.content || [])) {
    if (block.type === "text") {
      textParts.push(block.text);
    }
  }
  const researchResult = textParts.join("\n\n");

  // Log deep research usage only when the web search actually succeeded
  await logUsage(userId, "deep_research", "web_search", webSearchTokens || undefined, searchModel, workspaceId);

  if (!researchResult.trim()) return "";
  return `\n\n--- RECHERCHE WEB ---\n${researchResult}\n--- FIN RECHERCHE ---\n\nUtilise ces données pour étayer la position du contenu avec des faits concrets, des chiffres, des exemples récents, intégrés naturellement. Tout chiffre repris reste attaché à sa source (mention discrète : nom, année) ; jamais de chiffre sans source.`;
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

    // Reusable newsjacking block — injected into prompts when present.
    // Kept separate from `context` to avoid blowing the 8000-char cap on subjects.
    const newsContextBlock = (typeof newsContext === "string" && newsContext.trim().length > 0)
      ? `\n\n══════════════════════════════════════\nCONTEXTE ACTUALITÉ (NEWSJACKING)\n══════════════════════════════════════\n${newsContext.trim()}\n\nCONSIGNE NEWSJACKING : ce contenu rebondit sur cette actualité. Le HOOK / ACCROCHE doit partir de l'actualité elle-même (c'est elle qui capte l'attention car elle est dans l'air du temps). Ensuite seulement, fais le pont vers l'expertise, le vécu ou le positionnement de l'utilisatrice. L'actu n'est pas un prétexte en arrière-plan : c'est le point d'entrée visible du contenu.\n\nRÈGLE SPECTATEUR ZÉRO CONTEXTE (obligatoire) : pars du principe que la personne qui regarde ou lit n'a PAS suivi cette actualité. Juste après le hook, RACONTE les faits en 1-2 phrases simples et concrètes (qui a fait quoi, où, quand) avant toute opinion ou analyse. INTERDIT de désigner l'actu par allusion (« cette histoire de… », « cette affaire », « ce qui se passe en ce moment ») tant que les faits n'ont pas été racontés dans le contenu lui-même. Test décisif : quelqu'un qui n'a lu aucun article sur le sujet doit comprendre de quoi on parle dès les 10 premières secondes d'un reel, la slide 2 d'un carrousel, ou les 2 premières phrases d'un post.\n`
      : "";

    // Determine channel from contentType for persona selection
    const channelFromType = contentType?.includes("linkedin") ? "linkedin" : contentType?.includes("instagram") || contentType?.includes("carousel") || contentType?.includes("reel") || contentType?.includes("stories") ? "instagram" : undefined;

    const profileBlock = profile ? buildProfileBlock(profile) : "";
    const ctx = await getUserContext(supabase, userId, workspace_id, channelFromType);
    // « Ton cas d'abord » (04/10/2026) : quand la personne a donné son propre cas,
    // son histoire de marque n'est pas jointe à la rédaction (elle racontait le
    // parcours de la marque à la place du récit fourni).
    const caseForStory = livedCaseFromCreativeBody(body);
    const ownCaseGeneration = step === "generate" && (caseForStory.provided || caseForStory.mode === "news_feeling");
    const brandingContext = formatContextForAI(ctx, ownCaseGeneration ? { ...CONTEXT_PRESETS.content, includeStory: false } : CONTEXT_PRESETS.content);
    // Champs de marque bruts (combat, mission, ton…) : le redac-gate s'en sert
    // pour détecter une recopie quasi mot pour mot (audit slop 18/08). Aucune
    // requête supplémentaire — ctx.tone est déjà fetché par getUserContext().
    const brandGuardText = buildBrandGuardText(ctx);
    // Tu ou vous réglé dans la fiche de marque (null = pas de réglage : rien ne change).
    const audienceAddress = parseAudienceAddress(ctx?.tone?.tone_register);

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
    let effectivePreGen = preGenAnswers ?? body.pre_gen_answers;
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
      if (effectivePreGen.conviction) pl.push(fromBranding
        ? `- Conviction issue du branding (repère de fond seulement si pertinent pour CE sujet, à reformuler ; présence non obligatoire) : "${effectivePreGen.conviction}"`
        : `- Conviction/phrase clé fournie pour CE contenu (conserve son sens et ses mots lorsqu’ils fonctionnent, sans insertion forcée) : "${effectivePreGen.conviction}"`);
      if (pl.length) {
        preGenBlock = `\nL'UTILISATRICE A PARTAGÉ CES ÉLÉMENTS PERSONNELS :\n${pl.join("\n")}\n\nINTÈGRE CES ÉLÉMENTS dans le contenu généré :\n- L'anecdote doit apparaître naturellement (en accroche ou en illustration)\n- L'émotion visée guide le ton et la structure\n- La conviction éclaire le propos si elle est pertinente ; ne récite pas une conviction de marque sans lien avec le sujet\n- Ne change PAS le sens de ce qu'elle a dit, juste la structure\n`;
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
    const COMMON_PREFIX = CONTENT_CLARITY_RULES + "\n\n" + BASE_SYSTEM_RULES + "\n\n" + incarnationBlock + "\n\n" + `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :\n- Reproduis fidèlement le style décrit\n- Réutilise les expressions signature naturellement dans le texte\n- RESPECTE les expressions interdites : ne les utilise JAMAIS\n- Imite les patterns de ton et de structure\n- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA\n\n` + CORE_PRINCIPLES + "\n\n" + EMBEDDED_EDUCATION + "\n\n" + ANTI_SLOP + "\n\n" + fullContext;

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
    const formatHint = resolveFormatHint(contentType, angle);
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
      const genResult = await buildGeneratePrompt({
        supabase, userId, workspace_id, body, COMMON_PREFIX, context, contentType, editorialFormat, editorialFormatLabel,
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
      // 8192 pour la génération de contenu : le JSON reel (script + duplicata `sections`
      // + `lecture_test` + shot list) dépasse le défaut de 4096 de callAnthropicSimple
      // → stop_reason "max_tokens" → échec systématique en ~40 s. Un plafond haut ne
      // coûte rien tant qu'il n'est pas consommé.
      const factualFictionalLinkedIn = step === "generate" && isLinkedIn && !isPhotoMode && isFactualFictionalLinkedInBrief(context);
      const maxTokens = step === "questions" ? 800 : step === "hooks" ? 1400 : step === "recycle" ? 12288 : factualFictionalLinkedIn ? 1200 : 8192;
      const isLinkedInText = !!contentType?.includes("linkedin") && step !== "questions";
      const tempText = factualFictionalLinkedIn ? 0.2 : isLinkedInText ? 0.7 : 0.85;
      // L1 : Haiku pour les steps `questions` et `follow-up` (3-5× plus rapide que Sonnet,
      // suffisant pour des questions structurées en JSON). Sonnet reste pour la génération de contenu.
      const modelForCall = (step === "questions" || step === "follow-up")
        ? getModelForAction("questions")
        : getModelForAction("content");
      // Questions/follow-up = appels Haiku courts et bornés : on plafonne chaque
      // tentative à 30s pour qu'un fetch qui traîne bascule vite en retry plutôt
      // que de faire patienter l'utilisatrice >1 min sur le chemin d'activation.
      // `generate` (et adjust/angles/dictation) suivaient le même chemin sans
      // aucune limite jusqu'ici — le générateur le plus utilisé de l'outil
      // tournait sans filet (audit latences 17/08).
      const abortMs = (step === "questions" || step === "follow-up") ? 30000
        : step === "hooks" ? 45000
        : step === "generate" ? GENERATE_ABORT_MS
        : step === "adjust" ? ADJUST_ABORT_MS
        : (step === "angles" || step === "dictation") ? LIGHT_ABORT_MS
        : undefined;
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

    if (step === "generate" && isLinkedIn && !isPhotoMode && isFactualFictionalLinkedInBrief(context) && typeof parsed.content === "string") {
      alignFactualLinkedInHook(parsed);
    }

    // (step === "recycle" ne passe plus par ici : pipeline parallèle dédié plus haut.)

    // ═══ NORMALISATION HOOKS (lot 7) ═══
    if (step === "hooks" && parsed && typeof parsed === "object") {
      const hooksEarlyExit = normalizeHooksResponse(parsed, { body, rawContent, corsHeaders });
      if (hooksEarlyExit) return hooksEarlyExit;
      // Tu ou vous : le hook choisi part tel quel dans le script final.
      await enforceAudienceAddressInFields(parsed, HOOKS_ADDRESS_FIELDS, audienceAddress, addrOpts("hooks", 20_000));
    }

    // Ajustement : le contenu réécrit suit le réglage tu/vous.
    if (step === "adjust" && parsed && typeof parsed === "object") {
      await enforceAudienceAddressInFields(parsed, ["content"], audienceAddress, addrOpts("adjust"));
    }

    // ═══ PASSE DE CORRECTION LinkedIn ═══
    // Échos d'accroche AVANT correction (LinkedIn / reel) : télémétrie de la garde anti-redite.
    let textEchoesBefore: number | undefined;
    if (
      step === "generate" &&
      contentType?.includes("linkedin") &&
      !body.photo_mode &&
      !isFactualFictionalLinkedInBrief(context) &&
      parsed && typeof parsed === "object" &&
      typeof parsed.content === "string" &&
      parsed.content.length >= 200
    ) {
      textEchoesBefore = await applyLinkedInCorrectionPass(parsed, { body, fullContext, researchSource, brandGuardText, echoSubject, previousHooks });
    }

    // L'accroche suit le début exact du post FINAL (après correction, photo
    // comprise) : la correction peut avoir changé la première ligne.
    if (step === "generate" && isLinkedIn && parsed && typeof parsed === "object" && typeof parsed.content === "string") {
      // Tu ou vous (non diffusé, photo, exemple fictif) : AVANT l'alignement de l'accroche.
      await enforceAudienceAddressInFields(parsed, ["content"], audienceAddress, addrOpts("linkedin"));
      alignLinkedInHookFields(parsed);
    }

    if (isNewsletter && step === "generate" && parsed && typeof parsed === "object") {
      await applyNewsletterCorrectionPass(parsed, { body, fullContext, researchSource, context, newsContext, brandGuardText, previousHooks, audienceAddress });
      Object.assign(parsed, stripMarkdownFromNewsletter(parsed));
      if (typeof parsed.content === "string") parsed.word_count = parsed.content.split(/\s+/).filter(Boolean).length;
    }

    // ═══ PASSE QUALITÉ REEL (audit reels 12/07) ═══
    if (isReel && step === "generate" && parsed && typeof parsed === "object" && Array.isArray(parsed.script)) {
      textEchoesBefore = await applyReelQualityPass(parsed, { body, effectiveObjective, fullContext, researchSource, brandGuardText, echoSubject, previousHooks, audienceAddress });
    }

    // Tu ou vous des autres textes générés ici : légende Instagram (non
    // streamée), légende photo, épingle, script de reel en mode photo,
    // carrousel. LinkedIn, newsletter, reel et stories ont leur propre place.
    if (
      step === "generate" && parsed && typeof parsed === "object" &&
      !isLinkedIn && !isNewsletter && !isStories && !(isReel && Array.isArray(parsed.script))
    ) {
      if (Array.isArray(parsed.slides ?? parsed.carousel?.slides)) {
        Object.assign(parsed, await enforceCarouselObjectAudienceAddress(parsed, audienceAddress, "carousel"));
      } else {
        await enforceAudienceAddressInFields(parsed, POST_ADDRESS_FIELDS, audienceAddress, addrOpts(isPinterest ? "pinterest" : isPhotoMode ? "photo-caption" : "post"));
      }
    }

    // ═══ STORIES : texte d'abord, mise en forme ensuite (04/10/2026) ═══
    // 1. La rédaction n'écrit que du texte : tout choix de mise en page qu'elle
    //    aurait quand même écrit est retiré (restent le petit titre, du texte,
    //    et la photo à prendre).
    // 2. La correction ne touche que le texte et le petit titre.
    // 3. La mise en forme lit le texte FINAL et pose le plan visuel par code,
    //    puis la garde photo d'abord et les photos de la bibliothèque.
    let storiesGate: StoriesGateResult | null = null;
    if (isStories && step === "generate") {
      // Mode photo (vision) : même séquence structurée que le flux principal,
      // donc même chaîne ci-dessous (04/10/2026).
      if (isPhotoMode) adoptStructuredStories(parsed);
      stripStoriesWriterLayout(parsed);
      storiesGate = await applyStoriesCorrectionPass(parsed, { body, fullContext, researchSource, brandGuardText, echoSubject, previousHooks });
      // Tu ou vous : texte, petit titre et sticker, AVANT la mise en forme (les pastilles en sont extraites).
      await enforceAudienceAddressInFields(parsed, STORIES_ADDRESS_FIELDS, audienceAddress, addrOpts("stories"));
      finalizeStoriesLayout(parsed, { storiesPhotoCatalog, logger: (m) => console.log(m) });
    }

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
