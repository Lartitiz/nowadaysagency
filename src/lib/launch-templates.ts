// ── Launch template definitions ──

export interface LaunchPhaseTemplate {
  name: string;
  label: string;
  emoji: string;
  defaultDurationDays: number;
}

export interface LaunchTemplate {
  id: string;
  label: string;
  emoji: string;
  duration: string;
  description: string;
  idealFor: string;
  contentRange: string;
  phases: LaunchPhaseTemplate[];
}

export const LAUNCH_TEMPLATES: LaunchTemplate[] = [
  {
    id: "flash",
    label: "Lancement flash",
    emoji: "⚡",
    duration: "1 semaine",
    description: "2 phases rapides pour un impact immédiat.",
    idealFor: "Drop produit, promo flash, annonce rapide",
    contentRange: "~8-10 contenus",
    phases: [
      { name: "teasing", label: "Teasing", emoji: "👀", defaultDurationDays: 3 },
      { name: "vente", label: "Vente", emoji: "🔥", defaultDurationDays: 4 },
    ],
  },
  {
    id: "classique",
    label: "Lancement classique",
    emoji: "📅",
    duration: "3-4 semaines",
    description: "4 phases pour un lancement structuré et progressif.",
    idealFor: "Nouvelle offre, collection, programme",
    contentRange: "~15-20 contenus",
    phases: [
      { name: "pre_teasing", label: "Pré-teasing", emoji: "🌱", defaultDurationDays: 7 },
      { name: "teasing", label: "Teasing", emoji: "👀", defaultDurationDays: 7 },
      { name: "vente", label: "Vente", emoji: "🔥", defaultDurationDays: 14 },
      { name: "post_lancement", label: "Post-lancement", emoji: "🌊", defaultDurationDays: 5 },
    ],
  },
  {
    id: "gros_lancement",
    label: "Gros lancement",
    emoji: "🚀",
    duration: "1-3 mois",
    description: "6 phases pour un lancement d'envergure avec préparation longue.",
    idealFor: "Formation, gros événement, programme signature",
    contentRange: "~30-50 contenus",
    phases: [
      { name: "planification", label: "Planification", emoji: "📋", defaultDurationDays: 7 },
      { name: "distribution", label: "Distribution de contenu", emoji: "📣", defaultDurationDays: 21 },
      { name: "captation", label: "Captation", emoji: "🧲", defaultDurationDays: 14 },
      { name: "teasing", label: "Teasing & préventes", emoji: "👀", defaultDurationDays: 14 },
      { name: "evenement", label: "Événement", emoji: "🎪", defaultDurationDays: 3 },
      { name: "vente", label: "Vente", emoji: "🔥", defaultDurationDays: 14 },
    ],
  },
];

// ── Content types used in slots ──

export interface ContentTypeInfo {
  id: string;
  emoji: string;
  label: string;
  category: "visibilite" | "confiance" | "vente" | "post_lancement";
}

export const CONTENT_TYPES: ContentTypeInfo[] = [
  // Visibilité
  { id: "coup_de_gueule_doux", emoji: "🔥", label: "Coup de gueule doux", category: "visibilite" },
  { id: "conseil_contre_intuitif", emoji: "💡", label: "Conseil contre-intuitif", category: "visibilite" },
  { id: "enigme_teaser", emoji: "🧩", label: "Énigme / teaser", category: "visibilite" },
  { id: "tendance", emoji: "📈", label: "Tendance / sujet du moment", category: "visibilite" },
  // Confiance
  { id: "storytelling_personnel", emoji: "📖", label: "Storytelling personnel", category: "confiance" },
  { id: "coulisses", emoji: "👀", label: "Coulisses", category: "confiance" },
  { id: "educatif_autorite", emoji: "🎓", label: "Contenu éducatif", category: "confiance" },
  { id: "question_engagement", emoji: "💬", label: "Question / sondage", category: "confiance" },
  { id: "valeurs_combat", emoji: "🌱", label: "Valeurs / combat", category: "confiance" },
  // Vente
  { id: "annonce_revelation", emoji: "🚀", label: "Annonce / révélation", category: "vente" },
  { id: "presentation_offre", emoji: "🎁", label: "Présentation de l'offre", category: "vente" },
  { id: "objections_faq", emoji: "🛡️", label: "Objections / FAQ", category: "vente" },
  { id: "preuve_sociale", emoji: "🏆", label: "Preuve sociale", category: "vente" },
  { id: "pour_qui", emoji: "🎯", label: "Pour qui c'est / pour qui c'est pas", category: "vente" },
  { id: "derniere_chance", emoji: "⏰", label: "Dernière chance", category: "vente" },
  { id: "bonus_early_bird", emoji: "📦", label: "Bonus / early bird", category: "vente" },
  // Post-lancement
  { id: "remerciement", emoji: "🙏", label: "Remerciement", category: "post_lancement" },
  { id: "bilan", emoji: "📊", label: "Bilan / retour d'expérience", category: "post_lancement" },
];

export const FORMAT_OPTIONS = [
  { id: "post_carrousel", label: "Carrousel" },
  { id: "post_photo", label: "Post photo" },
  { id: "reel", label: "Reel" },
  { id: "story_serie", label: "Story série" },
  { id: "story", label: "Story" },
  { id: "live", label: "Live" },
];

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  visibilite: { bg: "bg-[hsl(340,70%,96%)]", text: "text-[hsl(340,70%,45%)]", label: "👀 Visibilité" },
  confiance: { bg: "bg-[hsl(270,60%,96%)]", text: "text-[hsl(270,60%,45%)]", label: "🤝 Confiance" },
  vente: { bg: "bg-[hsl(45,80%,94%)]", text: "text-[hsl(45,80%,35%)]", label: "💰 Vente" },
  post_lancement: { bg: "bg-[hsl(140,50%,94%)]", text: "text-[hsl(140,50%,35%)]", label: "🌊 Post-lancement" },
};

export const PHASE_STYLES: Record<string, { bg: string; border: string; emoji: string; label: string }> = {
  planification: { bg: "bg-muted/40", border: "border-border", emoji: "📋", label: "Planification" },
  distribution: { bg: "bg-[hsl(210,60%,96%)]", border: "border-[hsl(210,60%,85%)]", emoji: "📣", label: "Distribution" },
  captation: { bg: "bg-[hsl(180,50%,95%)]", border: "border-[hsl(180,50%,85%)]", emoji: "🧲", label: "Captation" },
  pre_teasing: { bg: "bg-[hsl(270,60%,96%)]", border: "border-[hsl(270,60%,85%)]", emoji: "🌱", label: "Pré-teasing" },
  teasing: { bg: "bg-[hsl(340,70%,96%)]", border: "border-[hsl(340,70%,85%)]", emoji: "👀", label: "Teasing" },
  evenement: { bg: "bg-[hsl(30,80%,95%)]", border: "border-[hsl(30,80%,80%)]", emoji: "🎪", label: "Événement" },
  vente: { bg: "bg-[hsl(45,80%,94%)]", border: "border-[hsl(45,80%,80%)]", emoji: "🔥", label: "Vente" },
  post_lancement: { bg: "bg-[hsl(140,50%,94%)]", border: "border-[hsl(140,50%,80%)]", emoji: "🌊", label: "Post-lancement" },
};

export const TIME_OPTIONS = [
  { id: "0", label: "0h — Je fais avec mon temps habituel", hours: 0 },
  { id: "1", label: "+1h/semaine — Un petit effort en plus", hours: 1 },
  { id: "2-3", label: "+2-3h/semaine — Je mets le paquet", hours: 2.5 },
  { id: "5", label: "+5h/semaine — All in sur ce lancement", hours: 5 },
];

export const FALLBACK_TIME_OPTIONS = [
  { id: "1-2", label: "1-2h", hours: 1.5 },
  { id: "3-4", label: "3-4h", hours: 3.5 },
  { id: "5-6", label: "5-6h", hours: 5.5 },
  { id: "7+", label: "7h+", hours: 7 },
];

// ── Slot interface ──

export interface LaunchSlot {
  id: string;
  date: string;
  phase: string;
  format: string;
  content_type: string;
  content_type_emoji: string;
  category: string;
  objective: string;
  angle_suggestion: string;
}

export interface LaunchPhase {
  name: string;
  label: string;
  start_date: string;
  end_date: string;
  slots: LaunchSlot[];
}

export interface LaunchPlan {
  total_slots: number;
  estimated_weekly_hours: number;
  phases: LaunchPhase[];
}
