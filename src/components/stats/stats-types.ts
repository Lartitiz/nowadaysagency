/* Shared types and constants for the Stats module */

export type StatsRow = Record<string, any>;

export type StatsConfig = {
  id?: string;
  website_platform?: string | null;
  website_platform_other?: string | null;
  uses_ga4?: boolean;
  traffic_sources?: string[];
  sales_pages?: { name: string; url: string }[];
  business_type?: string | null;
  business_metrics?: string[];
  custom_metrics?: { name: string; type: string; section: string }[];
  launch_metrics?: string[];
};

export type PeriodPreset = "this_month" | "last_month" | "3_months" | "6_months" | "this_year" | "last_year" | "all" | "custom";

export type DashboardKPIs = {
  followers: number | null;
  avgReach: number;
  avgEngagement: number;
  engagementByFollowers: number | null;
  netGrowth: number | null;
  changeFollowers: { val: number; dir: "up" | "down" | "flat" } | null;
  changeReach: { val: number; dir: "up" | "down" | "flat" } | null;
  changeEngagement: { val: number; dir: "up" | "down" | "flat" } | null;
  changeNetGrowth: { val: number; dir: "up" | "down" | "flat" } | null;
  followersGained: number | null;
};

/* ── Period helpers ── */

import { monthKey } from "@/lib/stats-helpers";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: "Ce mois",
  last_month: "Le mois dernier",
  "3_months": "Les 3 derniers mois",
  "6_months": "Les 6 derniers mois",
  this_year: "Cette année",
  last_year: "L'année dernière",
  all: "Depuis le début",
  custom: "Période personnalisée",
};

export function getPeriodRange(preset: PeriodPreset, now: Date): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this_month":
      return { from: monthKey(new Date(y, m, 1)), to: monthKey(new Date(y, m, 1)) };
    case "last_month":
      return { from: monthKey(new Date(y, m - 1, 1)), to: monthKey(new Date(y, m - 1, 1)) };
    case "3_months":
      return { from: monthKey(new Date(y, m - 2, 1)), to: monthKey(new Date(y, m, 1)) };
    case "6_months":
      return { from: monthKey(new Date(y, m - 5, 1)), to: monthKey(new Date(y, m, 1)) };
    case "this_year":
      return { from: monthKey(new Date(y, 0, 1)), to: monthKey(new Date(y, m, 1)) };
    case "last_year":
      return { from: monthKey(new Date(y - 1, 0, 1)), to: monthKey(new Date(y - 1, 11, 1)) };
    case "all":
      return { from: "2020-01-01", to: monthKey(new Date(y, m, 1)) };
    default:
      return { from: monthKey(new Date(y, m, 1)), to: monthKey(new Date(y, m, 1)) };
  }
}

/* ── Business model presets ── */

export const BUSINESS_PRESETS: Record<string, { label: string; emoji: string; desc: string; metrics: string[] }> = {
  services: {
    label: "Services / Accompagnement", emoji: "🤝",
    desc: "Appels découverte, devis, clients signés",
    metrics: ["discovery_calls", "proposals_sent", "clients_signed", "revenue", "ad_budget"],
  },
  ecommerce: {
    label: "Produits / E-commerce", emoji: "🛍️",
    desc: "Commandes, panier moyen, taux de conversion",
    metrics: ["orders", "avg_basket", "revenue", "conversion_rate", "best_product", "ad_budget"],
  },
  formations: {
    label: "Formations / Programmes", emoji: "📚",
    desc: "Inscrits, conversions, taux de complétion",
    metrics: ["signups", "conversions", "revenue", "waitlist", "ad_budget"],
  },
  freelance: {
    label: "Freelance / Projets", emoji: "🎨",
    desc: "Devis envoyés, projets signés, CA",
    metrics: ["requests_received", "proposals_sent", "projects_signed", "revenue", "ad_budget"],
  },
  mix: {
    label: "Mix de plusieurs", emoji: "🔀",
    desc: "Tu choisis les métriques qui te parlent",
    metrics: ["discovery_calls", "clients_signed", "revenue", "ad_budget"],
  },
};

export const ALL_BUSINESS_METRICS: Record<string, { label: string; type: "number" | "euro" | "text" }> = {
  discovery_calls: { label: "Appels découverte", type: "number" },
  proposals_sent: { label: "Devis/propositions envoyés", type: "number" },
  clients_signed: { label: "Clients signés", type: "number" },
  revenue: { label: "CA du mois", type: "euro" },
  ad_budget: { label: "Budget pub", type: "euro" },
  orders: { label: "Nb de commandes", type: "number" },
  avg_basket: { label: "Panier moyen", type: "euro" },
  conversion_rate: { label: "Taux de conversion boutique", type: "number" },
  best_product: { label: "Produit le plus vendu", type: "text" },
  signups: { label: "Nb d'inscrits", type: "number" },
  conversions: { label: "Nb de conversions (achat)", type: "number" },
  waitlist: { label: "Inscrits liste d'attente", type: "number" },
  requests_received: { label: "Demandes reçues", type: "number" },
  projects_signed: { label: "Projets signés", type: "number" },
};

export const ALL_TRAFFIC_SOURCES = [
  { id: "search", label: "Recherche Google (SEO)" },
  { id: "social", label: "Réseaux sociaux" },
  { id: "pinterest", label: "Pinterest" },
  { id: "instagram", label: "Instagram" },
  { id: "newsletter", label: "Newsletter / Email" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" },
  { id: "ads", label: "Publicité payante" },
];

export const ALL_LAUNCH_METRICS = [
  { id: "signups", label: "Inscriptions (liste d'attente / freebie)" },
  { id: "launch_dms", label: "DM liés au lancement" },
  { id: "link_clicks", label: "Clics lien de vente" },
  { id: "story_views", label: "Vues stories lancement" },
  { id: "conversions", label: "Conversions (ventes)" },
  { id: "webinar_signups", label: "Inscrits webinar" },
  { id: "live_participants", label: "Participants live" },
  { id: "freebie_downloads", label: "Téléchargements freebie" },
];

export const WEBSITE_PLATFORMS = [
  { id: "squarespace", label: "Squarespace" },
  { id: "wordpress", label: "WordPress" },
  { id: "shopify", label: "Shopify" },
  { id: "wix", label: "Wix" },
  { id: "webflow", label: "Webflow" },
  { id: "other", label: "Autre" },
];

export function getPlatformLabel(config: StatsConfig) {
  if (!config.website_platform) return "";
  const p = WEBSITE_PLATFORMS.find(p => p.id === config.website_platform);
  let label = p?.label || config.website_platform;
  if (config.website_platform === "other" && config.website_platform_other) label = config.website_platform_other;
  if (config.uses_ga4) label += " + GA4";
  return label;
}
