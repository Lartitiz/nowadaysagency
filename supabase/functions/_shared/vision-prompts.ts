// Vision-anchored prompts for `step=questions` and `step=generate`
// when photo_mode + photos[0].base64 are provided.
// Extracted verbatim from index.ts to keep behavior identical.

export interface VisionQuestionsParams {
  contentType: string | null | undefined;
  context: string | null | undefined;
  objective: string | null | undefined;
  photo_description: string | null | undefined;
  per_photo_context: string | null | undefined;
}

export function buildVisionQuestionsPrompt(p: VisionQuestionsParams): string {
  const ctype = String(p.contentType || "").toLowerCase();
  let channelLabelQ = "Instagram (post photo)";
  let channelGuidanceQ = "Ton ÉMOTION / SCÈNE VÉCUE : ressenti, hors-champ, instant, ce qui se passait juste avant ou après la photo.";
  if (ctype.includes("linkedin")) {
    channelLabelQ = "LinkedIn (post pro)";
    channelGuidanceQ = "Ton PRO : ce qu'on apprend pro derrière l'image, prise de position assumée, résultat / chiffre concret, contexte business.";
  } else if (ctype.includes("reel")) {
    channelLabelQ = "Reel Instagram (vidéo courte)";
    channelGuidanceQ = "L'image sert de référence visuelle / vignette / plan d'inspiration. Questions sur : l'instant à montrer, la promesse rapide, ce que la voix off ou face cam dit pendant qu'on voit l'image.";
  } else if (ctype.includes("story") || ctype.includes("stories")) {
    channelLabelQ = "Stories Instagram (séquence éphémère)";
    channelGuidanceQ = "L'image est le point d'ancrage d'une séquence (zooms, crops, hors-champ, sticker question). Questions sur : ce qu'on découpe, le 'avant/après', ce qu'on veut faire réagir.";
  } else if (ctype.includes("newsletter")) {
    channelLabelQ = "Newsletter (email long format)";
    channelGuidanceQ = "Ton ÉDITORIAL / INTIME : l'image est en ouverture, le texte prolonge l'ambiance. Questions sur : ce que l'image évoque, le fil narratif qu'elle ouvre, l'angle perso à creuser.";
  }

  return `Tu es une coach com' qui prépare un brief avec l'utilisatrice.

Voici la photo qu'elle veut utiliser pour un contenu ${channelLabelQ}.
Sujet : "${p.context || "non précisé"}"
${p.objective ? `Objectif : ${p.objective}` : ""}
${p.photo_description ? `Description globale fournie en amont : "${p.photo_description}"` : ""}
${p.per_photo_context ? `Contexte précis sur cette photo : "${p.per_photo_context}"` : ""}

Pose exactement 3 questions d'approfondissement ANCRÉES dans la photo et adaptées au format ${channelLabelQ}.

RÈGLES :
- MENTIONNE ce que tu VOIS RÉELLEMENT (élément concret, geste, lumière, lieu, ambiance)
- Chaque question doit être SPÉCIFIQUE à CETTE photo (impossible à reposer pour une autre image)
- ${channelGuidanceQ}
- VARIÉTÉ obligatoire : 1 anecdote/scène, 1 opinion/conviction, 1 process/observation (pas 3 "raconte-moi")
- Questions OUVERTES, ton chaleureux et curieux

Réponds UNIQUEMENT en JSON valide :
{
  "questions": [
    { "question": "...", "placeholder": "..." },
    { "question": "...", "placeholder": "..." },
    { "question": "...", "placeholder": "..." }
  ]
}`;
}

export interface VisionGenerateBrief {
  formatBrief: string;
  jsonShape: string;
}

export function buildVisionGenerateBrief(contentType: string | null | undefined): VisionGenerateBrief {
  const ctype = String(contentType || "").toLowerCase();

  if (ctype.includes("linkedin")) {
    return {
      formatBrief: `Rédige un POST LINKEDIN pro qui s'appuie sur cette photo. L'image illustre un point précis du texte (ne pas la paraphraser). Ton pro mais incarné. Ouvre par un hook fort qui fait écho au visuel, déroule un apprentissage / prise de position / résultat concret, termine par une invitation à réagir. 1300-2000 caractères.`,
      jsonShape: `{\n  "content": "...",\n  "accroche": "...",\n  "format": "post_linkedin",\n  "pillar": "...",\n  "objectif": "..."\n}`,
    };
  }
  if (ctype.includes("reel")) {
    return {
      formatBrief: `Rédige le SCRIPT D'UN REEL Instagram qui s'appuie sur cette image (vignette / référence visuelle / plan d'inspiration).\nStructure : HOOK (1 phrase choc, 2-3s) → PROMESSE → DÉROULÉ (3-5 beats voix-off ou face cam) → CTA.\nLe script doit faire un lien explicite avec ce qu'on voit sur l'image (sans la paraphraser bêtement).`,
      jsonShape: `{\n  "content": "<script complet avec timing indicatif>",\n  "accroche": "<le hook>",\n  "format": "reel_script",\n  "pillar": "...",\n  "objectif": "..."\n}`,
    };
  }
  if (ctype.includes("story") || ctype.includes("stories")) {
    return {
      formatBrief: `Découpe une SÉQUENCE DE 3 À 5 STORIES Instagram qui exploitent cette image (zooms, crops narratifs, hors-champ, sticker question / sondage). Chaque story doit avoir une intention claire (accroche, contexte, révélation, CTA). Texte court, oral, direct.`,
      jsonShape: `{\n  "content": "<séquence numérotée des stories avec texte + indication visuelle>",\n  "accroche": "<le texte de la story 1>",\n  "format": "stories_sequence",\n  "pillar": "...",\n  "objectif": "..."\n}`,
    };
  }
  if (ctype.includes("newsletter")) {
    return {
      formatBrief: `Rédige une NEWSLETTER (email long format) qui s'ouvre sur cette image en bandeau / illustration. Le texte doit prolonger l'ambiance visuelle, pas la décrire. Ton intime, éditorial, comme une lettre. Objet court (<60 car), pré-header (<90 car), corps 1500-2500 mots avec sous-titres oraux.`,
      jsonShape: `{\n  "content": "<corps complet>",\n  "subject": "<objet email>",\n  "preheader": "<pré-header>",\n  "accroche": "<première ligne du corps>",\n  "format": "newsletter",\n  "pillar": "...",\n  "objectif": "..."\n}`,
    };
  }

  // Default: Instagram caption photo
  return {
    formatBrief: `Rédige une légende Instagram pour cette photo. La légende doit COMPLÉTER l'image, pas la décrire. Ton sensoriel. 400-800 caractères.`,
    jsonShape: `{\n  "content": "...",\n  "accroche": "...",\n  "format": "caption_photo",\n  "pillar": "...",\n  "objectif": "..."\n}`,
  };
}
