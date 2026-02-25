// ── Calendar display helpers ──

/** @deprecated Use OBJECTIVE_CARD_COLORS instead */
export const CATEGORY_CARD_COLORS: Record<string, { bg: string; borderLeft: string }> = {
  visibilite: { bg: "hsl(210, 100%, 96%)", borderLeft: "hsl(210, 80%, 55%)" },
  confiance: { bg: "hsl(142, 76%, 95%)", borderLeft: "hsl(142, 60%, 45%)" },
  vente: { bg: "hsl(25, 100%, 96%)", borderLeft: "hsl(25, 95%, 55%)" },
  post_lancement: { bg: "hsl(142, 76%, 95%)", borderLeft: "hsl(142, 60%, 45%)" },
  stories: { bg: "hsl(340, 80%, 96%)", borderLeft: "hsl(340, 80%, 55%)" },
};

/** Couleurs par OBJECTIF (fond + bordure gauche) */
export const OBJECTIVE_CARD_COLORS: Record<string, { bg: string; borderLeft: string; text: string }> = {
  visibilite:  { bg: "hsl(210, 100%, 96%)", borderLeft: "hsl(210, 80%, 55%)", text: "hsl(210, 80%, 35%)" },
  confiance:   { bg: "hsl(142, 76%, 95%)",  borderLeft: "hsl(142, 60%, 45%)", text: "hsl(142, 60%, 30%)" },
  vente:       { bg: "hsl(25, 100%, 96%)",  borderLeft: "hsl(25, 95%, 55%)",  text: "hsl(25, 95%, 35%)" },
  credibilite: { bg: "hsl(270, 80%, 96%)",  borderLeft: "hsl(270, 60%, 55%)", text: "hsl(270, 60%, 35%)" },
  stories:     { bg: "hsl(340, 80%, 96%)",  borderLeft: "hsl(340, 80%, 55%)", text: "hsl(340, 80%, 35%)" },
  default:     { bg: "hsl(0, 0%, 97%)",     borderLeft: "hsl(0, 0%, 65%)",    text: "hsl(0, 0%, 40%)" },
};

/** Style de border-left par STATUT */
export const STATUS_BORDER_STYLE: Record<string, { style: string; opacity: string }> = {
  idea:      { style: "dotted", opacity: "0.5" },
  a_rediger: { style: "dashed", opacity: "0.7" },
  drafting:  { style: "dashed", opacity: "1" },
  ready:     { style: "solid",  opacity: "1" },
  draft_ready: { style: "solid", opacity: "1" },
  published: { style: "solid",  opacity: "1" },
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
