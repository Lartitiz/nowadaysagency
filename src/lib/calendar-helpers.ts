// ── Calendar display helpers ──

export const CATEGORY_CARD_COLORS: Record<string, { bg: string; borderLeft: string }> = {
  visibilite: { bg: "hsl(340, 100%, 97%)", borderLeft: "hsl(338, 96%, 61%)" },
  confiance: { bg: "hsl(271, 81%, 96%)", borderLeft: "hsl(271, 81%, 56%)" },
  vente: { bg: "hsl(45, 100%, 94%)", borderLeft: "hsl(38, 92%, 50%)" },
  post_lancement: { bg: "hsl(142, 76%, 94%)", borderLeft: "hsl(142, 71%, 45%)" },
  stories: { bg: "hsl(263, 70%, 96%)", borderLeft: "hsl(263, 70%, 50%)" },
};

export const FORMAT_EMOJIS: Record<string, string> = {
  post_carrousel: "📑",
  post_photo: "🖼️",
  reel: "🎬",
  story: "📱",
  story_serie: "📱",
  live: "🎤",
};

export const FORMAT_LABELS: Record<string, string> = {
  post_carrousel: "Carrousel",
  post_photo: "Post photo",
  reel: "Reel",
  story: "Story",
  story_serie: "Stories",
  live: "Live",
};

export const TYPE_SHORT_LABELS: Record<string, string> = {
  coup_de_gueule_doux: "Coup de gueule",
  conseil_contre_intuitif: "Conseil",
  enigme_teaser: "Teaser",
  tendance: "Tendance",
  storytelling_personnel: "Storytelling",
  coulisses: "Coulisses",
  educatif_autorite: "Éducatif",
  question_engagement: "Question",
  valeurs_combat: "Valeurs",
  annonce_revelation: "Annonce",
  presentation_offre: "Offre",
  objections_faq: "Objections",
  preuve_sociale: "Témoignage",
  pour_qui: "Pour qui",
  derniere_chance: "Last call",
  bonus_early_bird: "Bonus",
  remerciement: "Merci",
  bilan: "Bilan",
  story_sequence_vente: "Stories vente",
  story_sequence_faq: "Stories FAQ",
  story_sequence_temoignage: "Stories témoignage",
  story_sequence_objection: "Stories objections",
  story_sequence_last_call: "Stories last call",
  story_sequence_bienvenue: "Stories bienvenue",
  live_qa: "Live Q&A",
  dm_strategiques: "DM stratégiques",
  diagnostic: "Diagnostic",
  comparatif: "Comparatif",
  mini_fiction: "Mini-fiction",
};

export const CATEGORY_LABELS: Record<string, { emoji: string; label: string }> = {
  visibilite: { emoji: "👁️", label: "Visibilité" },
  confiance: { emoji: "🤝", label: "Confiance" },
  vente: { emoji: "💰", label: "Vente" },
  post_lancement: { emoji: "🌿", label: "Post-lanc." },
};
