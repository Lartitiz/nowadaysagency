export const FOCUS_TOPICS = [
  { value: "instagram_content", label: "Création contenus Instagram", icon: "📱" },
  { value: "instagram_strategy", label: "Stratégie Instagram / routine engagement", icon: "📱" },
  { value: "website", label: "Site web / pages de vente", icon: "🌐" },
  { value: "newsletter", label: "Newsletter / emailing / séquences", icon: "✉️" },
  { value: "seo", label: "SEO / référencement", icon: "🔍" },
  { value: "press", label: "Relations presse / dossier de presse", icon: "📰" },
  { value: "pinterest", label: "Pinterest", icon: "📌" },
  { value: "linkedin", label: "LinkedIn", icon: "💼" },
  { value: "launch", label: "Lancement d'offre / campagne", icon: "🚀" },
  { value: "branding", label: "Branding / identité visuelle", icon: "🎨" },
  { value: "automation", label: "Automatisation (ManyChat, emails)", icon: "🤖" },
  { value: "custom", label: "Autre (personnalisé)", icon: "✏️" },
] as const;

export type FocusTopicValue = (typeof FOCUS_TOPICS)[number]["value"];

export function getFocusLabel(topic: string | null | undefined): string {
  if (!topic) return "À définir ensemble";
  const found = FOCUS_TOPICS.find(t => t.value === topic);
  return found ? found.label : topic;
}

export function getFocusIcon(topic: string | null | undefined): string {
  if (!topic) return "💬";
  const found = FOCUS_TOPICS.find(t => t.value === topic);
  return found ? found.icon : "✏️";
}

export function getSessionTypeIcon(type: string | null | undefined): string {
  switch (type) {
    case "launch": return "🎯";
    case "strategy": return "📊";
    case "checkpoint": return "✅";
    case "focus": return "🔧";
    default: return "📅";
  }
}

export function getSessionTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "launch": return "Atelier de lancement";
    case "strategy": return "Atelier Stratégique";
    case "checkpoint": return "Point d'étape";
    case "focus": return "Session focus";
    default: return "Session";
  }
}

export const FIXED_SESSIONS = [
  { n: 1, type: "launch", title: "Atelier de lancement", duration: 90, phase: "strategy" },
  { n: 2, type: "strategy", title: "Atelier Stratégique", duration: 120, phase: "strategy" },
  { n: 3, type: "checkpoint", title: "Point d'étape", duration: 60, phase: "strategy" },
] as const;

export const DEFAULT_DELIVERABLES = [
  { title: "Audit de communication", type: "audit", route: "/branding/audit" },
  { title: "Branding complet", type: "branding", route: "/branding" },
  { title: "Portrait cible", type: "persona", route: "/branding/section?section=persona" },
  { title: "Offres reformulées", type: "offers", route: "/branding/offres" },
  { title: "Ligne éditoriale", type: "editorial", route: "/branding/section?section=content_strategy" },
  { title: "Calendrier 3 mois", type: "calendar", route: "/calendrier" },
  { title: "Bio optimisée", type: "bio", route: "/instagram/profil/bio" },
  { title: "10-15 contenus prêts", type: "content", route: "/calendrier" },
  { title: "Templates Canva", type: "templates", route: null },
  { title: "Plan de com' 6 mois", type: "plan", route: "/plan" },
] as const;
