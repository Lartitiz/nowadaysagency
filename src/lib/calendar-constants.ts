export const ANGLES = [
  "Storytelling", "Mythe à déconstruire", "Coup de gueule", "Enquête / décryptage",
  "Conseil contre-intuitif", "Test grandeur nature", "Before / After",
  "Histoire cliente", "Regard philosophique", "Surf sur l'actu",
];

export const STATUSES = [
  { id: "idea", label: "Idée" },
  { id: "a_rediger", label: "À rédiger" },
  { id: "drafting", label: "En rédaction" },
  { id: "ready", label: "Prêt à publier" },
  { id: "published", label: "Publié" },
];

export const CANAL_FILTERS = [
  { id: "all", label: "Tout", enabled: true },
  { id: "instagram", label: "Instagram", enabled: true },
  { id: "linkedin", label: "LinkedIn", enabled: true },
  { id: "pinterest", label: "Pinterest", enabled: true },
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
  a_rediger: "bg-cal-idea border-dashed border-cal-idea-border text-foreground",
  drafting: "bg-cal-drafting border-cal-drafting-border text-foreground",
  ready: "bg-cal-ready border-cal-ready-border text-foreground",
  published: "bg-cal-published border-cal-published-border text-foreground line-through",
};

export const CANAL_COLORS: Record<string, string> = {
  instagram: "bg-[hsl(340,96%,60%)]",   // rose
  linkedin: "bg-[hsl(210,80%,40%)]",    // bleu LinkedIn
  pinterest: "bg-[hsl(356,82%,52%)]",   // rouge Pinterest
  blog: "bg-[hsl(160,50%,45%)]",
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
  content_type?: string | null;
  content_type_emoji?: string | null;
  category?: string | null;
  objective?: string | null;
  angle_suggestion?: string | null;
  launch_id?: string | null;
  format?: string | null;
  content_draft?: string | null;
  accroche?: string | null;
  // Stories-specific
  stories_count?: number | null;
  stories_objective?: string | null;
  stories_structure?: string | null;
  stories_sequence_id?: string | null;
  stories_timing?: Record<string, string> | null;
  story_sequence_detail?: any;
  amplification_stories?: any;
}
