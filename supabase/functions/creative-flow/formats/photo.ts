// Mode photo (creative-flow) : questions et génération ancrées sur les photos
// envoyées (vision), pour tous les formats. Extrait À L'IDENTIQUE d'index.ts
// au lot 3 (13/10/2026). Les consignes par format sont dans
// _shared/vision-prompts.ts ; les briques communes dans ../shared.ts.
// Voir docs/creation-contenu/CARTE.md.

import { type AudienceAddress } from "../../_shared/audience-address.ts";
import { callAnthropic, getModelForAction, type UsageSink } from "../../_shared/anthropic.ts";
import { buildVisionQuestionsPrompt, buildVisionGenerateBrief, buildVisionTool } from "../../_shared/vision-prompts.ts";
import { GENERATE_ABORT_MS, QUESTIONS_TOOL, extractImagePayload, photoVoiceRule } from "../shared.ts";

// Vision-anchored questions: let Claude SEE ALL photos (1..10) to ask grounded questions.
// Appel non-streamé — retourne le rawContent Anthropic (JSON questions), le sink
// d'usage est alimenté via `finalUsage` comme pour les autres branches du step.
export async function runVisionQuestions(params: {
  body: any;
  contentType?: string | null;
  context?: string | null;
  objective?: string | null;
  QUESTIONS_PREFIX: string;
  brandingContext: string;
  brandVocabBlock: string;
  recentBriefsContext: string;
  finalUsage: UsageSink;
}): Promise<string> {
  const { body, contentType, context, objective, QUESTIONS_PREFIX, brandingContext, brandVocabBlock, recentBriefsContext, finalUsage } = params;
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

  return await callAnthropic({
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
}

// Photo mode with vision: send 1 to 10 images to Claude — format-aware prompt.
// 1 = scène unique. 2 = "avant / après" (transformation). 3+ = "série / reportage".
// Branche non-streamée (le post photo non-LinkedIn ne streame pas) — retourne
// le rawContent Anthropic, l'usage est alimenté via `finalUsage`.
export async function runVisionGenerate(params: {
  body: any;
  contentType?: string | null;
  context?: string | null;
  answers?: any[];
  systemPrompt: string;
  finalUsage: UsageSink;
  /** Tu ou vous de la fiche de marque (04/10/2026). */
  audienceAddress?: AudienceAddress | null;
}): Promise<string> {
  const { body, contentType, context, answers, systemPrompt, finalUsage } = params;
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
      text: `══ RÈGLES À LIRE AVANT LES IMAGES ══
- Le sujet déclaré, les réponses et la voix de la marque priment sur la description visuelle. Ne déroule pas un inventaire des photos ; nomme directement le sujet quand il est connu.
- Une photo peut étayer un fait visible. Elle ne révèle pas une pensée, une émotion, une citation, un dialogue ou une chronologie hors champ. N'invente pas ces éléments.
- Évite les slogans, les cascades de phrases courtes et la question finale automatique. Garde les phrases courtes qui correspondent à la personne et au moment raconté.
- Recopie exactement les chiffres, noms et dates lisibles si tu les utilises.
- ${photoVoiceRule(params.audienceAddress, "Respecte la personne grammaticale et le registre de la marque, sans tutoiement ni vouvoiement imposé.")}

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
    ? `\n\n🔄 MODE AVANT / APRÈS : la 1ère image = état AVANT, la 2nde = état APRÈS. Raconte le changement réel comme un fil unique ; ne crée ni déclic ni résultat absent du brief. Ne décris pas chaque image séparément.`
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

  // Tool forcé : le prompt demande déjà un JSON (jsonShape) ; sans tool le
  // modèle peut le casser (fence/guillemet non échappé) → JSON illisible côté
  // serveur. Le tool (miroir de jsonShape) fait garantir un JSON valide par
  // l'API. Non-streaming ici (le post photo ne streame pas), donc pas d'enjeu
  // de live à préserver — juste la validité, comme le POST streaming #534.
  return await callAnthropic({
    model: getModelForAction("content"),
    system: systemPrompt,
    messages: [{ role: "user", content: photoContent }],
    temperature: isLinkedInPhoto ? 0.7 : 0.85,
    max_tokens: 4096,
    abortTimeoutMs: GENERATE_ABORT_MS,
    tool: buildVisionTool(contentType),
  }, finalUsage);
}
