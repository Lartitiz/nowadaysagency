import { ReactNode } from "react";

export interface DashboardModule {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  colSpan: number;
  rowSpan: number;
  variant: "default" | "highlight" | "dark" | "accent";
  route: string;
  section: "actions" | "spaces" | "tools" | "ai";
  component?: string;
  enabled: boolean;
  order: number;
}

export const dashboardModules: DashboardModule[] = [
  {
    id: "create-content",
    title: "Créer un contenu",
    subtitle: "Post, carousel, reel, article... c'est parti.",
    icon: "✨",
    colSpan: 12,
    rowSpan: 2,
    variant: "highlight",
    route: "/creer",
    section: "actions",
    enabled: true,
    order: 1,
  },
  {
    id: "editorial-calendar",
    title: "Calendrier édito",
    subtitle: "Ta semaine de publication en un coup d'œil.",
    icon: "📅",
    colSpan: 6,
    rowSpan: 3,
    variant: "default",
    route: "/calendrier",
    section: "actions",
    enabled: true,
    order: 2,
  },
  {
    id: "engagement-routine",
    title: "Routine d'engagement",
    subtitle: "Tes actions hebdo pour créer du lien.",
    icon: "💬",
    colSpan: 6,
    rowSpan: 1,
    variant: "default",
    route: "/instagram/routine",
    section: "actions",
    enabled: true,
    order: 3,
  },
  {
    id: "explore-stats",
    title: "Explorer mes stats",
    subtitle: "Score audit et performance Instagram.",
    icon: "📊",
    colSpan: 6,
    rowSpan: 2,
    variant: "dark",
    route: "/instagram/stats",
    section: "actions",
    enabled: true,
    order: 4,
  },
  {
    id: "publish-content",
    title: "Publier mon contenu",
    subtitle: "Tes posts de la semaine.",
    icon: "📝",
    colSpan: 4,
    rowSpan: 2,
    variant: "accent",
    route: "/calendrier",
    section: "actions",
    enabled: true,
    order: 5,
  },
  {
    id: "improve-seo",
    title: "Améliorer mon SEO",
    subtitle: "Référencement & mots-clés.",
    icon: "🔍",
    colSpan: 4,
    rowSpan: 2,
    variant: "default",
    route: "/seo",
    section: "actions",
    enabled: true,
    order: 6,
  },
  {
    id: "write-homepage",
    title: "Rédiger ma page d'accueil",
    subtitle: "Textes et structure de ta home.",
    icon: "🌐",
    colSpan: 4,
    rowSpan: 2,
    variant: "highlight",
    route: "/site/accueil",
    section: "actions",
    enabled: true,
    order: 7,
  },
];

export interface SpaceModule {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  gradient: string;
  route: string;
  badge?: string;
  external?: boolean;
  enabled: boolean;
  order: number;
}

export const spaceModules: SpaceModule[] = [
  {
    id: "branding",
    title: "Mon identité",
    subtitle: "Ta marque, ton positionnement, ta cible, tes offres.",
    icon: "🎨",
    gradient: "from-[hsl(var(--bento-lavande))] to-[hsl(340_100%_97%)]",
    route: "/branding",
    enabled: true,
    order: 0,
  },
  {
    id: "instagram",
    title: "Instagram",
    subtitle: "Profil, contenus, bio, engagement",
    icon: "📱",
    gradient: "from-[hsl(338_96%_90%)] to-[hsl(340_100%_97%)]",
    route: "/instagram",
    enabled: true,
    order: 1,
  },
  {
    id: "website",
    title: "Site Web",
    subtitle: "Audit, pages, templates, témoignages",
    icon: "🌍",
    gradient: "from-[hsl(var(--bento-mint))] to-[hsl(160_50%_97%)]",
    route: "/site",
    enabled: true,
    order: 2,
  },
  {
    id: "linkedin",
    title: "LinkedIn",
    subtitle: "Profil, posts, réseau",
    icon: "💼",
    gradient: "from-[hsl(var(--bento-blue))] to-[hsl(220_60%_97%)]",
    route: "/linkedin",
    enabled: true,
    order: 3,
  },
  {
    id: "seo",
    title: "SEO",
    subtitle: "Mots-clés, référencement",
    icon: "🔎",
    gradient: "from-[hsl(var(--bento-violet))] to-[hsl(270_50%_97%)]",
    route: "/seo",
    enabled: true,
    order: 4,
  },
];

export const sectionLabels: Record<string, string> = {
  actions: "",
  spaces: "MES ESPACES",
  tools: "OUTILS IA",
  ai: "INTELLIGENCE",
};
