// carousel-ai : formats de sortie imposés à l'IA (outils JSON) et rappel
// « ne refuse pas mes photos » (fiche 2, lot 1 de docs/robustesse/gros-fichiers.md ;
// constantes déplacées à l'identique depuis index.ts).

// ── Sortie structurée pour les deepening_questions ──
// Même pattern que creative-flow (#359) : le tool forcé (tool_choice) fait
// garantir le JSON par l'API elle-même — fini les 502 « réponse IA illisible »
// quand Haiku glisse un guillemet non échappé ou un saut de ligne brut dans du
// JSON texte. Prompts inchangés : seule la couche de transport devient déterministe.
export const QUESTIONS_TOOL = {
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

// PLAN ENVISAGÉ (08/10/2026) : le rédacteur réfléchit ~50 s avant d'écrire
// sa première slide. Un appel court (Haiku) propose entre-temps les titres
// prévus, affichés « plan envisagé » jusqu'à la 1re vraie slide. Ils ne sont
// JAMAIS réutilisés dans le carrousel : simple repère pendant l'attente.
export const OUTLINE_TOOL = {
  name: "plan_envisage",
  description: "Titres prévus des slides du carrousel, dans l'ordre.",
  input_schema: {
    type: "object",
    properties: { titles: { type: "array", items: { type: "string" }, maxItems: 20 } },
    required: ["titles"],
  },
};

export const OUTLINE_INSTRUCTION = "\n\nNE RÉDIGE PAS LE CARROUSEL. Donne seulement le titre prévu de chaque slide, dans l'ordre (couverture comprise), en respectant la longueur demandée : quelques mots par titre.";

export const PHOTO_QUESTIONS_TOOL = {
  ...QUESTIONS_TOOL,
  description: "Zéro à deux précisions essentielles, sans questionnaire obligatoire.",
  input_schema: {
    ...QUESTIONS_TOOL.input_schema,
    properties: { questions: { ...QUESTIONS_TOOL.input_schema.properties.questions, maxItems: 2 } },
  },
};

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
export const PHOTO_MISMATCH_FIELD = {
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
export const PHOTO_MISMATCH_SYSTEM_REMINDER = `

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

export const FIL_FIELD = {
  type: "object",
  description: "Plan du fil, écrit AVANT les slides : arrivee = proposition précise que le texte développe, pas le thème ni un parcours de photos ; etapes = étapes du raisonnement/récit qui y mènent, pas liste des objets montrés.",
  properties: { arrivee: { type: "string" }, etapes: { type: "array", items: { type: "string" } } },
};

export const MIX_CAROUSEL_TOOL = {
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
export const PHOTO_CAROUSEL_TOOL = {
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
export const EDITORIAL_INTENT_FIELD = {type:"object",required:["mode","idea","reader_takeaway","basis_source_ids","inferred"],properties:{mode:{type:"string",enum:["recit","explication","argumentation","reflexion","comparaison","liste","serie_visuelle"]},idea:{type:"string"},reader_takeaway:{type:"string"},basis_source_ids:{type:"array",items:{type:"string"}},inferred:{type:"boolean"}}};

export const STRUCTURE_PROPOSAL_TOOL = {
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
