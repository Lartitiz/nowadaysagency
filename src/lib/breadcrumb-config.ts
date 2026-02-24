/**
 * Route-to-breadcrumb mapping.
 * Each key is a route pattern, value is an array of { label, path? }.
 * The last item (current page) has no path.
 * Dynamic segments like :id are handled by matching prefixes.
 */

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

// Routes that should NOT show a breadcrumb
const EXCLUDED_ROUTES = [
  "/dashboard",
  "/onboarding",
  "/welcome",
  "/login",
  "/connexion",
  "/reset-password",
  "/",
];

export function isExcludedRoute(pathname: string): boolean {
  return EXCLUDED_ROUTES.includes(pathname);
}

// Static breadcrumb map — order matters (more specific first)
const BREADCRUMB_MAP: [string, BreadcrumbItem[]][] = [
  // ── Instagram sub-pages ──
  ["/instagram/profil/bio", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Mon profil", path: "/instagram/profil" },
    { label: "Bio" },
  ]],
  ["/instagram/profil/nom", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Mon profil", path: "/instagram/profil" },
    { label: "Nom" },
  ]],
  ["/instagram/profil/stories", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Mon profil", path: "/instagram/profil" },
    { label: "Stories à la une" },
  ]],
  ["/instagram/profil/epingles", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Mon profil", path: "/instagram/profil" },
    { label: "Posts épinglés" },
  ]],
  ["/instagram/profil/feed", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Mon profil", path: "/instagram/profil" },
    { label: "Feed" },
  ]],
  ["/instagram/profil/edito", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Mon profil", path: "/instagram/profil" },
    { label: "Ligne éditoriale" },
  ]],
  ["/instagram/profil", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Mon profil" },
  ]],
  ["/instagram/audit", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Audit" },
  ]],
  ["/instagram/stats", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Mes stats" },
  ]],
  ["/instagram/creer", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Créer" },
  ]],
  ["/instagram/carousel", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Créer", path: "/instagram/creer" },
    { label: "Carrousel" },
  ]],
  ["/instagram/reels", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Reels" },
  ]],
  ["/instagram/stories", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Stories" },
  ]],
  ["/instagram/inspirer", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "S'inspirer" },
  ]],
  ["/instagram/routine", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Routine d'engagement" },
  ]],
  ["/instagram/rythme", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Mon rythme" },
  ]],
  ["/instagram/lancement/plan", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Lancement", path: "/instagram/lancement" },
    { label: "Plan" },
  ]],
  ["/instagram/lancement/recommandation", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Lancement", path: "/instagram/lancement" },
    { label: "Recommandation" },
  ]],
  ["/instagram/lancement", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram", path: "/instagram" },
    { label: "Lancement" },
  ]],
  ["/instagram", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Instagram" },
  ]],

  // ── Branding sub-pages ──
  ["/branding/section?section=story", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Mon histoire" },
  ]],
  ["/branding/section?section=persona", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Mon client·e idéal·e" },
  ]],
  ["/branding/section?section=value_proposition", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Proposition de valeur" },
  ]],
  ["/branding/section?section=tone_style", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Ton & style" },
  ]],
  ["/branding/section?section=content_strategy", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Stratégie de contenu" },
  ]],
  ["/branding/audit/", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Résultat audit" },
  ]],
  ["/branding/audit", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Audit" },
  ]],
  ["/branding/ton/recap", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Ton & style", path: "/branding/section?section=tone_style" },
    { label: "Récap" },
  ]],
  ["/branding/ton", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Ton & style" },
  ]],
  ["/branding/storytelling/import", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Mon histoire", path: "/branding/section?section=story" },
    { label: "Import" },
  ]],
  ["/branding/storytelling/new", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Mon histoire", path: "/branding/section?section=story" },
    { label: "Nouvelle histoire" },
  ]],
  ["/branding/storytelling/", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Mon histoire", path: "/branding/section?section=story" },
    { label: "Détail" },
  ]],
  ["/branding/storytelling", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Mon histoire" },
  ]],
  ["/branding/persona/recap", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Ma cible", path: "/branding/section?section=persona" },
    { label: "Récap" },
  ]],
  ["/branding/persona", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Ma cible" },
  ]],
  ["/branding/proposition/recap", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Proposition de valeur", path: "/branding/section?section=value_proposition" },
    { label: "Récap" },
  ]],
  ["/branding/proposition", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Proposition de valeur" },
  ]],
  ["/branding/strategie/recap", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Stratégie", path: "/branding/section?section=content_strategy" },
    { label: "Récap" },
  ]],
  ["/branding/strategie", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Stratégie" },
  ]],
  ["/branding/offres/", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Mes offres", path: "/branding/offres" },
    { label: "Atelier" },
  ]],
  ["/branding/offres", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Mes offres" },
  ]],
  ["/branding/section", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding", path: "/branding" },
    { label: "Section" },
  ]],
  ["/branding", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Branding" },
  ]],

  // ── LinkedIn ──
  ["/linkedin/audit", [
    { label: "Accueil", path: "/dashboard" },
    { label: "LinkedIn", path: "/linkedin" },
    { label: "Audit" },
  ]],
  ["/linkedin/profil", [
    { label: "Accueil", path: "/dashboard" },
    { label: "LinkedIn", path: "/linkedin" },
    { label: "Mon profil" },
  ]],
  ["/linkedin/resume", [
    { label: "Accueil", path: "/dashboard" },
    { label: "LinkedIn", path: "/linkedin" },
    { label: "Résumé" },
  ]],
  ["/linkedin/parcours", [
    { label: "Accueil", path: "/dashboard" },
    { label: "LinkedIn", path: "/linkedin" },
    { label: "Parcours" },
  ]],
  ["/linkedin/recommandations", [
    { label: "Accueil", path: "/dashboard" },
    { label: "LinkedIn", path: "/linkedin" },
    { label: "Recommandations" },
  ]],
  ["/linkedin/engagement", [
    { label: "Accueil", path: "/dashboard" },
    { label: "LinkedIn", path: "/linkedin" },
    { label: "Engagement" },
  ]],
  ["/linkedin", [
    { label: "Accueil", path: "/dashboard" },
    { label: "LinkedIn" },
  ]],

  // ── Pinterest ──
  ["/pinterest/compte", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Pinterest", path: "/pinterest" },
    { label: "Mon compte" },
  ]],
  ["/pinterest/tableaux", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Pinterest", path: "/pinterest" },
    { label: "Tableaux" },
  ]],
  ["/pinterest/mots-cles", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Pinterest", path: "/pinterest" },
    { label: "Mots-clés" },
  ]],
  ["/pinterest/epingles", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Pinterest", path: "/pinterest" },
    { label: "Épingles" },
  ]],
  ["/pinterest/routine", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Pinterest", path: "/pinterest" },
    { label: "Routine" },
  ]],
  ["/pinterest", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Pinterest" },
  ]],

  // ── Site web ──
  ["/site/accueil/recap", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Site web", path: "/site" },
    { label: "Page d'accueil", path: "/site/accueil" },
    { label: "Récap" },
  ]],
  ["/site/accueil", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Site web", path: "/site" },
    { label: "Page d'accueil" },
  ]],
  ["/site/a-propos", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Site web", path: "/site" },
    { label: "À propos" },
  ]],
  ["/site/temoignages", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Site web", path: "/site" },
    { label: "Témoignages" },
  ]],
  ["/site", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Site web" },
  ]],

  // ── Transversal ──
  ["/atelier/rediger", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Atelier", path: "/atelier" },
    { label: "Rédiger" },
  ]],
  ["/atelier", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Atelier" },
  ]],
  ["/calendrier", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Calendrier" },
  ]],
  ["/idees", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Mes idées" },
  ]],
  ["/mon-plan", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Mon plan" },
  ]],
  ["/plan", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Mon plan" },
  ]],
  ["/contacts", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Contacts" },
  ]],
  ["/communaute", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Communauté" },
  ]],
  ["/lives", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Lives" },
  ]],
  ["/studio", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Studio" },
  ]],

  // ── Profil / Settings ──
  ["/profil", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Mon profil" },
  ]],
  ["/parametres", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Paramètres" },
  ]],
  ["/abonnement", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Abonnement" },
  ]],
  ["/accompagnement", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Accompagnement" },
  ]],
  ["/admin/coaching", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Admin" },
    { label: "Coaching" },
  ]],
  ["/legal-ia", [
    { label: "Accueil", path: "/dashboard" },
    { label: "Mentions légales IA" },
  ]],
];

/**
 * Get breadcrumb items for the current pathname.
 * Returns null if no breadcrumb should be shown.
 */
export function getBreadcrumbItems(pathname: string, search?: string): BreadcrumbItem[] | null {
  if (isExcludedRoute(pathname)) return null;

  // Build full key with query params for matching
  const fullPath = search ? pathname + search : pathname;

  // Try exact match with query string first
  for (const [pattern, items] of BREADCRUMB_MAP) {
    if (fullPath === pattern) return items;
  }

  // Try exact match on pathname only
  for (const [pattern, items] of BREADCRUMB_MAP) {
    if (pathname === pattern && !pattern.includes("?")) return items;
    // Prefix match for routes with trailing dynamic segments
    if (pattern.endsWith("/") && !pattern.includes("?") && pathname.startsWith(pattern)) return items;
  }

  // Fallback: try longest prefix match
  let bestMatch: BreadcrumbItem[] | null = null;
  let bestLen = 0;
  for (const [pattern, items] of BREADCRUMB_MAP) {
    const patternPath = pattern.split("?")[0];
    if (!patternPath.endsWith("/") && pathname.startsWith(patternPath + "/") && patternPath.length > bestLen) {
      bestMatch = items;
      bestLen = patternPath.length;
    }
  }

  return bestMatch;
}
