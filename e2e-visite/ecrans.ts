// Liste des écrans CONNECTÉS parcourus par la visite guidée.
// Partagée entre visite.spec.ts (captures) et sonde.spec.ts (signaux/audit)
// pour qu'elles couvrent exactement le même périmètre.
// NB : /site, /seo, /pinterest sont des modules masqués (feature-flags.ts
// enabled:false) → admin only ; un compte test non-admin est redirigé.
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
];
