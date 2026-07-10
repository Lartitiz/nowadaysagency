// Liste des écrans CONNECTÉS parcourus par la visite guidée.
// Partagée entre visite.spec.ts (captures) et sonde.spec.ts (signaux/audit)
// pour qu'elles couvrent exactement le même périmètre.
// NB : /seo et /pinterest sont des modules masqués (feature-flags.ts
// enabled:false) → admin only ; un compte test non-admin est redirigé.
// /site est OUVERT depuis le 09/07/2026 (#455) → couvert ci-dessous.
// Les écrans /site n'ont pas encore d'entrée dans perf-baseline.json :
// seul le plancher absolu s'applique, régénérer la baseline au prochain run sain.
export const ECRANS: Array<{ slug: string; url: string }> = [
  { slug: "dashboard", url: "/dashboard" },
  { slug: "dashboard-complet", url: "/dashboard/complet" },
  { slug: "creer", url: "/creer" },
  { slug: "calendrier", url: "/calendrier" },
  { slug: "idees", url: "/idees" },
  { slug: "branding", url: "/branding" },
  { slug: "instagram", url: "/instagram" },
  { slug: "linkedin", url: "/linkedin" },
  { slug: "abonnement", url: "/abonnement" },
  { slug: "profil", url: "/profil" },
  { slug: "site", url: "/site" },
  { slug: "site-audit", url: "/site/audit" },
  { slug: "site-accueil", url: "/site/accueil" },
  { slug: "site-accueil-recap", url: "/site/accueil/recap" },
  { slug: "site-a-propos", url: "/site/a-propos" },
  { slug: "site-temoignages", url: "/site/temoignages" },
  { slug: "site-capture", url: "/site/capture" },
  { slug: "site-inspirations", url: "/site/inspirations" },
  { slug: "site-optimiser", url: "/site/optimiser" },
];
