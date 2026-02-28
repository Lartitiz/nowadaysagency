export const ACTIVITY_SECTIONS = [
  {
    label: "Créatrices & artisanes",
    items: [
      { key: "artisane", emoji: "🧶", label: "Artisane / Créatrice", desc: "bijoux, céramique, textile, maroquinerie" },
      { key: "mode_textile", emoji: "👗", label: "Mode & textile éthique", desc: "styliste, vêtements, accessoires" },
      { key: "art_design", emoji: "🎨", label: "Art & design", desc: "artiste visuelle, illustratrice, designer, DA" },
      { key: "deco_interieur", emoji: "🏡", label: "Déco & design d'intérieur", desc: "mobilier, upcycling, scénographie" },
      { key: "beaute_cosmetiques", emoji: "🌿", label: "Beauté & cosmétiques naturels", desc: "soins, coiffure, esthétique bio" },
    ],
  },
  {
    label: "Accompagnantes & prestataires",
    items: [
      { key: "bien_etre", emoji: "🧘", label: "Bien-être & corps", desc: "yoga, naturopathe, sophrologue" },
      { key: "coach", emoji: "🧠", label: "Coach / Thérapeute", desc: "dev perso, facilitatrice, retraites" },
      { key: "coach_sportive", emoji: "💪", label: "Coach sportive", desc: "fitness, pilates, sport bien-être" },
      { key: "consultante", emoji: "📱", label: "Consultante / Freelance", desc: "com', social media, rédaction, marketing" },
      { key: "formatrice", emoji: "📚", label: "Formatrice", desc: "ateliers, formations, pédagogie" },
    ],
  },
];

export const CHANNELS = [
  { key: "instagram", emoji: "📱", label: "Instagram" },
  { key: "website", emoji: "🌐", label: "Site web" },
  { key: "newsletter", emoji: "✉️", label: "Newsletter" },
  { key: "linkedin", emoji: "💼", label: "LinkedIn" },
  { key: "pinterest", emoji: "📌", label: "Pinterest" },
  { key: "podcast", emoji: "🎙️", label: "Podcast" },
  { key: "none", emoji: "🤷", label: "Rien pour l'instant" },
];

export const DESIRED_CHANNELS = [
  { key: "instagram", emoji: "📱", label: "Instagram" },
  { key: "website", emoji: "🌐", label: "Site web / blog" },
  { key: "newsletter", emoji: "✉️", label: "Newsletter" },
  { key: "linkedin", emoji: "💼", label: "LinkedIn" },
  { key: "pinterest", emoji: "📌", label: "Pinterest" },
  { key: "tiktok", emoji: "🎵", label: "TikTok" },
  { key: "podcast", emoji: "🎙️", label: "Podcast" },
  { key: "youtube", emoji: "▶️", label: "YouTube" },
];

export const BLOCKERS = [
  { key: "invisible", emoji: "😶", label: "Je suis invisible malgré mes efforts" },
  { key: "lost", emoji: "😵", label: "Je sais pas par où commencer" },
  { key: "no_time", emoji: "⏰", label: "J'ai pas le temps" },
  { key: "fear", emoji: "🫣", label: "J'ai peur de me montrer / de vendre" },
  { key: "no_structure", emoji: "🌀", label: "J'ai trop d'idées, aucune structure" },
  { key: "boring", emoji: "😴", label: "Ma com' est plate, elle me ressemble pas" },
];

export const OBJECTIVES = [
  { key: "system", emoji: "📅", label: "Avoir un système de com' clair et tenable" },
  { key: "visibility", emoji: "📈", label: "Être visible et attirer des client·es" },
  { key: "sell", emoji: "🛒", label: "Vendre régulièrement sans me forcer" },
  { key: "zen", emoji: "🧘", label: "Communiquer sans stress ni culpabilité" },
  { key: "expert", emoji: "🌟", label: "Être reconnue comme experte dans mon domaine" },
];

export const TIME_OPTIONS = [
  { key: "15min", emoji: "😅", label: "15 min par-ci par-là" },
  { key: "30min", emoji: "⏱️", label: "30 minutes" },
  { key: "1h", emoji: "📱", label: "1 heure" },
  { key: "2h", emoji: "💪", label: "2 heures" },
  { key: "more", emoji: "🔥", label: "Plus de 2 heures" },
];

export const TONE_OPTIONS = [
  { key: "chaleureux", emoji: "🤗", label: "Chaleureux" },
  { key: "direct", emoji: "🎯", label: "Direct" },
  { key: "fun", emoji: "😄", label: "Fun" },
  { key: "expert", emoji: "🧠", label: "Expert" },
  { key: "engage", emoji: "💪", label: "Engagé" },
  { key: "doux", emoji: "🌿", label: "Doux" },
  { key: "inspirant", emoji: "✨", label: "Inspirant" },
  { key: "provoc", emoji: "🔥", label: "Provoc" },
];

export const VALUE_CHIPS = [
  "Authenticité", "Éthique", "Créativité", "Féminisme",
  "Slow", "Écologie", "Bienveillance", "Liberté",
  "Beauté", "Transmission", "Inclusivité", "Audace",
];

export const TOTAL_STEPS = 12; // 0=welcome, 1=prenom+activite, 2=activity_type, 3=product_or_service, 4=links+docs, 5=canaux_combined, 6=objectif, 7=blocage, 8=temps, 9-10=affinage, 11=diagnostic_loading, (12=diagnostic_view via step>TOTAL_STEPS)
