export const ANGLES = [
  "Storytelling", "Mythe à déconstruire", "Coup de gueule", "Enquête / décryptage",
  "Conseil contre-intuitif", "Test grandeur nature", "Before / After",
  "Histoire cliente", "Regard philosophique", "Surf sur l'actu",
];

export const STATUSES = [
  { id: "idea", label: "Idée" },
  { id: "drafting", label: "En rédaction" },
  { id: "ready", label: "Prêt à publier" },
  { id: "published", label: "Publié" },
];

export const CANAL_FILTERS = [
  { id: "all", label: "Tout", enabled: true },
  { id: "instagram", label: "Instagram", enabled: true },
  { id: "linkedin", label: "LinkedIn", enabled: true },
  { id: "blog", label: "Blog", enabled: false },
];

export const OBJECTIFS = [
  { id: "visibilite", label: "Visibilité", emoji: "👀", cssVar: "obj-visibilite" },
  { id: "confiance", label: "Confiance", emoji: "🤝", cssVar: "obj-confiance" },
  { id: "vente", label: "Vente", emoji: "💰", cssVar: "obj-vente" },
  { id: "credibilite", label: "Crédibilité", emoji: "🏆", cssVar: "obj-credibilite" },
];

export const statusStyles: Record<string, string> = {
  idea: "bg-cal-idea border-cal-idea-border text-foreground",
  drafting: "bg-cal-drafting border-cal-drafting-border text-foreground",
  ready: "bg-cal-ready border-cal-ready-border text-foreground",
  published: "bg-cal-published border-cal-published-border text-foreground line-through",
};

export interface CalendarPost {
  id: string;
  date: string;
  theme: string;
  angle: string | null;
  status: string;
  notes: string | null;
  canal: string;
  objectif: string | null;
}
