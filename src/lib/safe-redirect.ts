/**
 * Chemin interne sûr pour un paramètre `?redirect=` (post-connexion, invitation…).
 * Refuse une URL absolue ou protocole-relative (open redirect) et le retour
 * vers les pages de connexion elles-mêmes (boucle).
 */
export function isSafeRedirectTarget(path: string | null | undefined): path is string {
  if (!path) return false;
  return path.startsWith("/") && !path.startsWith("//") && path !== "/login" && path !== "/connexion";
}
