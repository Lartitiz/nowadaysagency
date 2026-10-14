// Consignes des étapes d'assistance de creative-flow : angles, questions,
// suivi, ajustement et dictée (le choix du format vit dans format-flags.ts). Déplacées
// À L'IDENTIQUE depuis index.ts (fiche 3, lot A, 14/10/2026), qui les
// réexporte. Ces étapes servent TOUS les formats : une modification ici se voit
// dans les snapshots de chaque format (prompts_snapshot_test.ts,
// prompts_snapshot_formats_test.ts, contrats du handler). Voir
// docs/creation-contenu/CARTE.md.
//
// ADJUST_MARKER_RE doit rester aligné avec src/features/creer/edited-text.ts
// (repères relus par le front, lot 7 du 14/10/2026).

import { FORMAT_STRUCTURES, WRITING_RESOURCES, FRAMEWORK_SELECTION, ANTI_BIAS, EDITORIAL_ANGLES_REFERENCE } from "../../_shared/copywriting-prompts.ts";
import { claritySourceBlock } from "../../_shared/content-clarity.ts";
import { detectFormatFlags } from "../format-flags.ts";

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
  // Même détection que le reste du handler (format-flags.ts, lot F3) : sans
  // contentType, le format de livraison de l'angle choisi compte aussi.
  const flagsQ = detectFormatFlags(contentType, angle);
  const isLinkedIn = flagsQ.isLinkedIn;
  const isNewsletterQ = !isLinkedIn && flagsQ.isNewsletter;
  const isPinterestQ = !isLinkedIn && !isNewsletterQ && flagsQ.isPinterest;
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
