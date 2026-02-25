export const COACHING_CHECKLISTS: Record<string, string[]> = {
  story: ["story_origin", "story_turning_point", "story_struggles", "story_unique", "story_vision"],
  persona: ["description", "demographics", "frustrations", "desires", "objections", "buying_triggers", "channels", "daily_life"],
  tone_style: ["tone_description", "tone_do", "tone_dont", "combats", "visual_style"],
  content_strategy: ["content_pillars", "content_twist", "content_formats", "content_frequency", "content_editorial_line"],
  offers: ["offer_name", "offer_price", "offer_target", "offer_promise", "offer_includes"],
  charter: ["mood_place", "colors", "visual_style", "typography", "logo", "visual_donts"],
};

export const COACHING_LABELS: Record<string, Record<string, string>> = {
  story: {
    story_origin: "Comment tout a commencé",
    story_turning_point: "Le déclic",
    story_struggles: "Les galères",
    story_unique: "Ce qui te rend unique",
    story_vision: "Ta vision",
  },
  persona: {
    description: "Portrait général",
    demographics: "Âge, situation, localisation",
    frustrations: "Ce qui la bloque",
    desires: "Ce qu'elle veut vraiment",
    objections: "Ses objections",
    buying_triggers: "Déclencheurs d'achat",
    channels: "Où elle traîne",
    daily_life: "Sa journée type",
  },
  tone_style: {
    tone_description: "Comment tu parles",
    tone_do: "Ce que tu fais",
    tone_dont: "Ce que tu ne fais jamais",
    combats: "Tes combats",
    visual_style: "Ton style visuel",
  },
  content_strategy: {
    content_pillars: "Tes piliers de contenu",
    content_twist: "Ton twist créatif",
    content_formats: "Tes formats préférés",
    content_frequency: "Ton rythme",
    content_editorial_line: "Ta ligne éditoriale",
  },
  offers: {
    offer_name: "Nom de l'offre",
    offer_price: "Prix",
    offer_target: "Pour qui",
    offer_promise: "La promesse",
    offer_includes: "Ce qui est inclus",
  },
  charter: {
    mood_place: "Lieu imaginaire de ta marque",
    colors: "Tes couleurs",
    visual_style: "Ton style visuel",
    typography: "Tes polices",
    logo: "Ton logo",
    visual_donts: "Ce que tu détestes visuellement",
  },
};
