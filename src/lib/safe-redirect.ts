/**
 * Chemin interne à l'app, sûr à passer à `navigate()`, `<Navigate>` ou `<Link to>`.
 * Un seul `/` en tête, et rien que le navigateur pourrait relire comme un autre
 * site : ni `//evil.com`, ni `/\evil.com` (l'antislash vaut un `/` dans une URL
 * http), ni tabulation/retour à la ligne (retirés par le navigateur : `/\t/evil.com`
 * devient `//evil.com`), ni `javascript:`/`https:` (qui ne commencent pas par `/`).
 */
export function isInternalPath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) return false;
  try {
    return new URL(path, "https://app.local").origin === "https://app.local";
  } catch {
    return false;
  }
}

/**
 * Chemin interne sûr pour un paramètre `?redirect=` (post-connexion, invitation…).
 * Refuse tout ce que refuse `isInternalPath` (open redirect) et le retour
 * vers les pages de connexion elles-mêmes (boucle).
 */
export function isSafeRedirectTarget(path: string | null | undefined): path is string {
  return isInternalPath(path) && path !== "/login" && path !== "/connexion";
}
