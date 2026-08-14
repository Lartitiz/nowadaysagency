// Source unique pour « ce chemin a-t-il le menu app (AppSidebar) monté ? ».
// Utilisé par AnimatedRoutes (App.tsx, pour monter ou non <AppSidebar>) ET par
// AppHeader (pour savoir si son bouton hamburger a un tiroir en face — sinon
// c'est un bouton mort sur les pages publiques comme /pricing ou /services,
// où AppHeader s'affiche pour une utilisatrice connectée mais AppSidebar non).
export const PUBLIC_PATHS = ["/", "/login", "/connexion", "/reset-password", "/binome", "/pricing", "/services", "/share/branding", "/checkout/binome", "/unsubscribe"];

export function isAppShellVisible(pathname: string): boolean {
  return (
    !PUBLIC_PATHS.includes(pathname) &&
    !pathname.startsWith("/invite/") &&
    !pathname.startsWith("/share/") &&
    !pathname.startsWith("/calendrier/partage/")
  );
}

// Onboarding = tunnel : pas de menu latéral (13 portes de sortie avant le
// premier contenu, cf audit de simplicité 13/08). Le menu revient dès /welcome.
export function isMobileNavAvailable(pathname: string): boolean {
  return isAppShellVisible(pathname) && pathname !== "/onboarding";
}
