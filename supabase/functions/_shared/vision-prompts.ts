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
    photoIntro = `Voici la photo qu'elle veut utiliser pour un contenu ${channelLabelQ}.`;
    questionGuidance = `Pose exactement 3 questions d'approfondissement ANCRÉES dans la photo et adaptées au format ${channelLabelQ}.`;
  } else if (seriesMode === "before_after") {
    photoIntro = `Voici les 2 photos qu'elle veut utiliser pour un contenu ${channelLabelQ}. Elles forment un AVANT (photo 1) / APRÈS (photo 2).`;
    questionGuidance = `Pose exactement 3 questions ANCRÉES dans la transformation visible entre les 2 photos, adaptées au format ${channelLabelQ}. Chaque question doit faire référence à un élément concret VU sur la photo 1 OU la photo 2 (mentionne laquelle). Couvre : (1) le déclic ou la bascule, (2) le geste / process qui a fait changer les choses, (3) le ressenti / l'apprentissage du résultat.`;
  } else {
    photoIntro = `Voici les ${photoCount} photos qu'elle veut utiliser pour un contenu ${channelLabelQ}. Elles appartiennent à UNE MÊME SÉQUENCE / reportage (chantier, événement, coulisses, étapes d'un process, journée…).`;
    questionGuidance = `Pose exactement 3 questions ANCRÉES dans l'ENSEMBLE de la série (pas uniquement la 1ère photo), adaptées au format ${channelLabelQ}. Chaque question doit citer un détail concret VU sur une photo PRÉCISE (mentionne le numéro de la photo). Couvre : (1) le fil rouge / pourquoi cette séquence dans son ensemble, (2) un moment ou détail marquant visible sur UNE photo spécifique (ex. "sur la photo 3, on voit…"), (3) la prise de position / l'apprentissage pro qui ressort de la série entière. INTERDIT de poser les 3 questions sur la même photo.`;
  }

  return `Tu es une coach com' qui prépare un brief avec l'utilisatrice.

${photoIntro}
Sujet : "${p.context || "non précisé"}"
${p.objective ? `Objectif : ${p.objective}` : ""}
${p.photo_description ? `Description globale fournie en amont : "${p.photo_description}"` : ""}${perPhotoBlock}

${questionGuidance}

RÈGLES :
- MENTIONNE ce que tu VOIS RÉELLEMENT sur ${photoCount > 1 ? `les ${photoCount} photos (cite leur numéro)` : "la photo"} (élément concret, geste, lumière, lieu, ambiance)
- Chaque question doit être SPÉCIFIQUE à ${photoCount > 1 ? "CES images précises" : "CETTE photo"} (impossible à reposer pour d'autres images)
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
      // Longueur 700-1100 (raccourci : l'image porte déjà une partie de la charge
      // sémantique, et plus court = moins de remplissage / slop).
      formatBrief: `Rédige un POST LINKEDIN ancré dans la/les photo(s).

LONGUEUR : 700-1100 caractères. Plus court = mieux ; coupe tout ce qui n'apporte rien.

ADRESSE : VOUS (vouvoiement). Jamais "tu", jamais "toi", jamais "ton/ta/tes".

STRUCTURE EN 3 TEMPS (sans titres, sans bullet, sans emoji-puce) :
1. ACCROCHE (1-2 lignes) : une phrase qui se tient SEULE, lisible même sans voir l'image, qui crée une tension, un contraste ou une surprise. Pas de "Aujourd'hui, je voulais vous parler de…". Pas de question rhétorique fermée ("Vous saviez que… ?").
2. PONT IMAGE↔TEXTE (1 ligne, max 2) : une phrase qui fait un lien CONCRET avec ce qu'on voit, SANS paraphraser l'image. Préférer l'oblique : "Ce détail dit quelque chose de…", "Derrière ce qu'on voit, il y a…".
3. MESSAGE (le reste) : UNE seule idée pro, prise de position assumée, ou apprentissage concret. Pas de liste à puces, pas de "3 leçons", pas de structure énumérative. Une pensée qui se déroule.

FIN : pas de CTA fabriqué. Soit une phrase ouverte qui invite naturellement à réagir, soit on coupe net.

══ INTERDIT — DÉSIGNER LES IMAGES (même sans les numéroter) ══
Le contournement le plus fréquent : remplacer "Photo 1" par une désignation visuelle ("ce flyer X", "ce comptoir Y"). C'est la MÊME erreur.
❌ "Ce flyer orange et jaune, c'est l'événement Aire You Ready."
❌ "Ce comptoir bleu avec ses illustrations de tartines, c'est l'intérieur des Petits Pâtis."
❌ "Sur la première, on voit… sur la seconde…"
✅ NOMMER directement le sujet sans le présenter comme une image : "Aire You Ready, c'est…", "Aux Petits Pâtis, on…".
Règle simple : si tu retires la phrase, le lecteur ne doit PAS perdre une info — sinon c'est une légende, pas un post.

══ INTERDIT — CASCADES / PHRASES-LISTES PARALLÈLES ══
Même déguisées en "oral" ou "rythme", elles sonnent IA.
❌ "Pas un musée à cocher. Un verre au comptoir. Une conversation qui s'étire."
❌ "Pas pour faire joli. Pour créer du lien."
❌ "Pas X. Pas Y. C'est Z."
✅ Une seule pensée qui se déroule en phrases complètes, avec des connecteurs réels.

══ INTERDIT — CTA FABRIQUÉ ══
❌ « Ici, il se passe quelque chose. Venez. »
❌ "Et vous, qu'en pensez-vous ?"
❌ "Spoiler :", "Plot twist :", "Et si je vous disais que…"
✅ Couper net sur la dernière phrase du message, OU une phrase ouverte non-injonctive.

AUTRES INTERDITS :
- Écrire "Photo 1", "Photo 2", "la première photo", "la seconde image", etc.
- Décrire les photos une par une / faire une légende multi-images
- Hashtags en fin (sauf si dans les réponses utilisatrice)`,
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
