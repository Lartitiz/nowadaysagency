// Routes du diagnostic (fiche 12, lot 1 : code sorti d'index.ts à l'identique).
// La liste doit rester alignée avec la ligne « Routes disponibles » du prompt
// système (index.ts, prompt du diagnostic).

export const DIAGNOSTIC_ROUTES = new Set([
  "/branding", "/branding/proposition/recap", "/branding/offres", "/branding/charter",
  "/instagram/audit", "/instagram/profil/bio", "/instagram/routine", "/linkedin/profil", "/site/audit",
  "/site/accueil", "/site/capture", "/calendrier", "/creer", "/idees",
]);
const LEGACY_DIAGNOSTIC_ROUTES: Record<string, string> = {
  "/audit-instagram": "/instagram/audit", "/bio-profile": "/instagram/profil/bio",
  "/storytelling": "/branding", "/persona": "/branding",
  "/proposition": "/branding/proposition/recap", "/offre": "/branding/offres",
  "/charte-graphique": "/branding/charter", "/strategie": "/branding",
  "/engagement": "/instagram/routine",
};

export function normalizeDiagnosticRoute(route: unknown): string {
  const candidate = typeof route === "string" ? route : "";
  const mapped = LEGACY_DIAGNOSTIC_ROUTES[candidate] || candidate;
  return DIAGNOSTIC_ROUTES.has(mapped) ? mapped : "/branding";
}
