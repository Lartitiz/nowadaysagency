// carousel-ai : textes des prompts par parcours (accroches, slides, sujets,
// angles, questions, carrousel express, photo, mixte, bloc « texte d'abord »).
// Fiche 2, lot 2 de docs/robustesse/gros-fichiers.md : fonctions déplacées à
// l'identique depuis index.ts. Aucune ne lit la base ni n'appelle Claude.

import { type CaseMode } from "../_shared/lived-case.ts";
import { type AudienceAddress, audienceAddressRule } from "../_shared/audience-address.ts";
import { buildCarouselWritingSystem } from "./writing-contract.ts";
import { buildIdentityBlock } from "../_shared/user-context.ts";
import { CONTENT_CLARITY_RULES } from "../_shared/content-clarity.ts";
import { textWritingPrompt, photoWritingPrompt, newsWriting, mixWritingPrompt } from "./variant-writing.ts";
import { buildConfirmedStructureBlock } from "./confirmed-structure.ts";

// ── Régime « texte d'abord » (lot 1 casting) ──
// Le carrousel mixte est rédigé SANS photos : chaque slide photo sort avec une
// photo_directive (l'image idéale, en français) + photo_query_en (mots-clés banque
// d'images) + éventuellement library_photo_index (match STRICT dans le catalogue
// bibliothèque envoyé par le front). Le casting des images se fait ensuite, slide
// par slide, dans l'écran résultat.
export function buildTextFirstBlock(body: any): string {
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

export function buildSystemPrompt(brandingContext: string, isLinkedIn = false, profile?: any, livedCase: boolean | CaseMode = false, audienceAddress: AudienceAddress | null = null): string {
  return buildCarouselWritingSystem(brandingContext, isLinkedIn, buildIdentityBlock(profile, "rédactrice éditoriale"), CONTENT_CLARITY_RULES, livedCase, audienceAddressRule(audienceAddress));
}

export function buildHooksPrompt(body: any, isLinkedIn = false): string {
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

  return `DEMANDE : Propose 3 accroches (hooks) pour un carrousel ${isLinkedIn ? "LinkedIn" : "Instagram"}.

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

export function buildSlidesPrompt(body: any, isLinkedIn = false): string {
  return textWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { scenarioOrigin: body.scenario_origin, narrativeThread: body.narrative_thread }));
}

export function buildSuggestTopicsPrompt(body: any, isLinkedIn = false): string {
  const { carousel_type, objective, recent_posts } = body;
  return `DEMANDE : Suggère 5 sujets de carrousels ${isLinkedIn ? "LinkedIn" : "Instagram"}.

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

export function buildSuggestAnglesPrompt(body: any, isLinkedIn = false): string {
  const { carousel_type, subject, objective, deepening_answers } = body;

  let deepeningCtx = "";
  if (deepening_answers) {
    const answers = Object.entries(deepening_answers)
      .filter(([, v]) => v && (v as string).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    if (answers) deepeningCtx = `\nRÉPONSES DE L'UTILISATRICE :\n${answers}\n`;
  }

  return `DEMANDE : Propose 3 angles éditoriaux pour un carrousel ${isLinkedIn ? "LinkedIn" : "Instagram"}, basés sur les réponses de l'utilisatrice.

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

export function buildDeepeningQuestionsPrompt(body: any, brandingContext?: string, isLinkedIn: boolean = false, recentBriefsContext?: string, brandVocabBlock?: string): string {
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

export function buildExpressFullPrompt(body: any, isLinkedIn = false): string {
  return textWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { scenarioOrigin: body.scenario_origin, narrativeThread: body.narrative_thread }));
}

export function buildPhotoCarouselPrompt(body: any, isLinkedIn = false): string {
  return photoWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { scenarioOrigin: body.scenario_origin, narrativeThread: body.narrative_thread, withStoryBeat: true }));
}

export function buildPhotoCarouselNewsReactionPrompt(body: any, isLinkedIn = false): string {
  return buildPhotoCarouselPrompt(body, isLinkedIn) + newsWriting(body);
}

export function buildMixCarouselPrompt(body: any, isLinkedIn = false): string {
  return mixWritingPrompt(body, isLinkedIn, buildConfirmedStructureBlock(body.confirmed_structure, { scenarioOrigin: body.scenario_origin, narrativeThread: body.narrative_thread, withStoryBeat: true }), buildTextFirstBlock(body));
}

export function buildMixCarouselNewsReactionPrompt(body: any, isLinkedIn = false): string {
  return buildMixCarouselPrompt(body, isLinkedIn) + newsWriting(body);
}
