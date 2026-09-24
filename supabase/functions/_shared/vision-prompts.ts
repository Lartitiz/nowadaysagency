// Vision-anchored prompts for `step=questions` and `step=generate`
// when photo_mode + photos[0].base64 are provided.
// Extracted verbatim from index.ts to keep behavior identical.

export interface VisionQuestionsParams {
  contentType: string | null | undefined;
  context: string | null | undefined;
  objective: string | null | undefined;
  photo_description: string | null | undefined;
  per_photo_context: string | null | undefined;
  photo_count?: number;
  series_mode?: "single" | "before_after" | "series";
  per_photo_contexts?: Array<string | null | undefined>;
}

export function buildVisionQuestionsPrompt(p: VisionQuestionsParams): string {
  const ctype = String(p.contentType || "").toLowerCase();
  let channelLabelQ = "Instagram (post photo)";
  let channelGuidanceQ = "Ton ÉMOTION / SCÈNE VÉCUE : ressenti, hors-champ, instant, ce qui se passait juste avant ou après la photo.";
  if (ctype.includes("linkedin")) {
    channelLabelQ = "LinkedIn (post)";
    channelGuidanceQ = "Demande ce que la personne veut raconter ou expliquer à travers ce sujet, puis le fait, le geste, la pensée ou l'émotion qu'elle peut réellement préciser. Un résultat business, un chiffre ou une prise de position ne sont utiles que s'ils servent son intention et sont fournis.";
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

  const photoCount = Math.max(1, p.photo_count || 1);
  const seriesMode = p.series_mode || (photoCount === 1 ? "single" : photoCount === 2 ? "before_after" : "series");

  // Per-photo contexts block (if any photos have a precise context)
  let perPhotoBlock = "";
  if (p.per_photo_contexts && p.per_photo_contexts.length > 0) {
    const lines = p.per_photo_contexts
      .map((c, i) => (c && c.trim() ? `- Photo ${i + 1} : "${c.trim()}"` : null))
      .filter(Boolean);
    if (lines.length > 0) {
      perPhotoBlock = `\nContextes précis fournis par photo :\n${lines.join("\n")}`;
    }
  } else if (p.per_photo_context) {
    perPhotoBlock = `\nContexte précis sur cette photo : "${p.per_photo_context}"`;
  }

  // Mode-specific intro + question guidance
  let photoIntro: string;
  let questionGuidance: string;
  if (seriesMode === "single" || photoCount === 1) {
    photoIntro = `Voici la photo qu'elle veut utiliser pour ILLUSTRER son contenu ${channelLabelQ}.`;
    questionGuidance = `Pose exactement 3 questions d'approfondissement sur LE SUJET qu'elle a déclaré (voir bloc PRIORITAIRE ci-dessus), adaptées au format ${channelLabelQ}. Au moins 1 des 3 questions PEUT s'appuyer sur un détail visible dans la photo ; les autres approfondissent le sujet déclaré et le point de vue de la personne.`;
  } else if (seriesMode === "before_after") {
    photoIntro = `Voici les 2 photos qu'elle veut utiliser pour ILLUSTRER son contenu ${channelLabelQ}. Elles forment un AVANT (photo 1) / APRÈS (photo 2).`;
    questionGuidance = `Pose exactement 3 questions ANCRÉES dans LE SUJET qu'elle a déclaré (voir bloc PRIORITAIRE), adaptées au format ${channelLabelQ}. Au moins 1 des 3 questions peut s'appuyer sur le changement visible entre les 2 photos ; les autres creusent son intention et les faits vécus, sans supposer de déclic.`;
  } else {
    photoIntro = `Voici les ${photoCount} photos qu'elle veut utiliser pour ILLUSTRER son contenu ${channelLabelQ}. Elles appartiennent à UNE MÊME SÉQUENCE (chantier, événement, coulisses, étapes…).`;
    questionGuidance = `Pose exactement 3 questions ANCRÉES dans LE SUJET qu'elle a déclaré (voir bloc PRIORITAIRE ci-dessus), adaptées au format ${channelLabelQ}. Au moins 1 des 3 questions peut s'appuyer sur un détail visible dans une photo (cite-la) ; les autres approfondissent le sujet déclaré et le regard de la personne.`;
  }

  const subjectBlock = p.context && p.context.trim()
    ? `══ SUJET PRIORITAIRE DE L'UTILISATRICE (BOUSSOLE) ══
"${p.context.trim()}"

C'est CE sujet qu'elle veut traiter. Les photos sont des ILLUSTRATIONS, pas le sujet.
Tes 3 questions doivent l'aider à creuser CE sujet : pas à décrire les photos.
Si les photos évoquent un autre angle, ignore-le : reste sur le sujet déclaré.

`
    : "";

  return `Tu es une coach com' qui prépare un brief avec l'utilisatrice.

${subjectBlock}${photoIntro}
${p.objective ? `Objectif : ${p.objective}` : ""}
${p.photo_description ? `Description complémentaire des photos (secondaire) : "${p.photo_description}"` : ""}${perPhotoBlock}

${questionGuidance}

RÈGLES :
- PRIORITÉ ABSOLUE au sujet déclaré ci-dessus. Les photos servent à enrichir, pas à dicter l'angle.
- Tu peux mentionner ce que tu VOIS sur ${photoCount > 1 ? "les photos (cite leur numéro si pertinent)" : "la photo"} quand c'est pertinent pour le sujet
- ${channelGuidanceQ.replace("derrière l'image", "sur LE sujet qu'elle veut traiter")}
- VARIÉTÉ : pose des questions complémentaires adaptées au sujet. ${ctype.includes("linkedin") ? "Si c'est un récit personnel, explore l'intention, un moment réel et ce qu'elle pensait ou ressentait ; si c'est une idée, creuse son raisonnement. N'exige pas d'anecdote ni de conviction artificielle." : "Évite trois questions qui demandent toutes la même anecdote."}
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
      formatBrief: `Rédige un POST LINKEDIN à partir du sujet déclaré et de ce que les photos montrent réellement.

- Le sujet et le point de vue de la personne guident le texte ; les photos l'appuient. Ne commence pas par décrire ou numéroter les images. Nomme les personnes, événements ou produits nécessaires à la compréhension seulement s'ils sont fournis ou lisibles.
- Si la personne raconte un vécu, suis une action, une pensée ou une émotion qu'elle a effectivement donnée, dans sa voix et à sa personne grammaticale. Une image seule ne prouve ni ce qu'elle a pensé, ni ce qu'une autre personne a dit, ni ce qui s'est passé avant ou après.
- Si aucun vécu n'est fourni, développe le sujet comme une observation ou une idée sans scène fictive. Le post n'a besoin ni d'un désaccord, ni d'une leçon, ni d'un appel à réagir.
- Chaque paragraphe apporte une information ou une nuance nouvelle. Coupe le remplissage ; la longueur dépend de la matière disponible. Respecte le registre de la marque, qu'elle tutoie, vouvoie ou parle au « je ».
- Une fin qui aboutit suffit. Pas de hashtags sauf s'ils font partie des réponses de la personne.`,
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
      formatBrief: `Rédige une NEWSLETTER (email long format) qui s'ouvre sur cette image en bandeau / illustration. Le texte doit prolonger l'ambiance visuelle, pas la décrire. Ton intime, éditorial, comme une lettre. Objet court (<60 car), pré-header (<90 car), corps 1500-3000 caractères avec sous-titres oraux.`,
      jsonShape: `{\n  "content": "<corps complet>",\n  "subject": "<objet email>",\n  "preheader": "<pré-header>",\n  "accroche": "<première ligne du corps>",\n  "format": "newsletter",\n  "pillar": "...",\n  "objectif": "..."\n}`,
    };
  }

  // Default: Instagram caption photo
  return {
    formatBrief: `Rédige une légende Instagram pour cette photo. La légende doit COMPLÉTER l'image, pas la décrire. Ton sensoriel. 400-800 caractères.`,
    jsonShape: `{\n  "content": "...",\n  "accroche": "...",\n  "format": "caption_photo",\n  "pillar": "...",\n  "objectif": "..."\n}`,
  };
}

export interface VisionTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Tool forcé (`tool_choice`) pour la génération VISION (photo). Miroir EXACT de
 * `buildVisionGenerateBrief().jsonShape` : le schéma DOIT rester synchro avec la
 * forme demandée dans le prompt — les deux vivent donc côte à côte, unique source
 * de vérité. Passer ce tool à `callAnthropic` fait garantir le JSON par l'API
 * (assemblage du bloc `tool_use`) au lieu d'un JSON en texte que le modèle peut
 * casser (même remède que le POST streaming, mais ici sur le chemin NON-streaming
 * du post/caption/linkedin AVEC photos). `format` reste une chaîne fixe indicative
 * (le consommateur lit surtout `content`/`accroche`).
 */
export function buildVisionTool(contentType: string | null | undefined): VisionTool {
  const ctype = String(contentType || "").toLowerCase();
  const base: Record<string, unknown> = {
    content: { type: "string", description: "Le contenu complet, prêt à poster." },
    accroche: { type: "string", description: "La première phrase / accroche." },
    pillar: { type: "string" },
    objectif: { type: "string" },
  };
  const make = (fmt: string, extra: Record<string, unknown> = {}, extraRequired: string[] = []): VisionTool => ({
    name: "rediger_contenu_visuel",
    description: "Retourne le contenu rédigé à partir de la/des photo(s), au format structuré.",
    input_schema: {
      type: "object",
      properties: {
        ...base,
        ...extra,
        format: { type: "string", description: `Valeur attendue : "${fmt}".` },
      },
      required: ["content", "accroche", ...extraRequired],
    },
  });

  if (ctype.includes("linkedin")) return make("post_linkedin");
  if (ctype.includes("reel")) return make("reel_script");
  if (ctype.includes("story") || ctype.includes("stories")) return make("stories_sequence");
  if (ctype.includes("newsletter")) {
    return make("newsletter", {
      subject: { type: "string", description: "Objet de l'email (<60 car)." },
      preheader: { type: "string", description: "Pré-header (<90 car)." },
    });
  }
  return make("caption_photo"); // défaut : légende photo Instagram
}
