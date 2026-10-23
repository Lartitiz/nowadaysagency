// Issue d'un rafraîchissement de jeton OAuth (Pinterest, Canva, Google), commune
// aux fonctions qui se servent du jeton et à social-status qui dit à la page
// Connexions si la connexion marche encore.
//
// Pourquoi : ces plateformes renouvellent leur jeton d'accès au moment où on s'en
// sert. La date d'expiration en base est donc celle du dernier usage, pas celle de
// la connexion. Seule une tentative de renouvellement dit la vérité : refus
// définitif (« dead ») = il faut se reconnecter ; panne passagère (« unknown ») =
// on ne sait pas, on n'alarme pas.

export type RefreshOutcome =
  | { state: "fresh"; token: string } // jeton encore valide, rien à faire
  | { state: "refreshed"; token: string; expiresAt: string }
  | { state: "dead" } // la plateforme refuse le renouvellement : reconnecter
  | { state: "unknown"; token: string | null }; // panne, délai, pas de refresh_token

/**
 * La plateforme refuse-t-elle définitivement le renouvellement ?
 * 400/401 = refresh_token expiré ou révoqué (invalid_grant…), sauf erreur de
 * configuration de l'app (invalid_client) : se reconnecter n'y changerait rien.
 */
export function isDefinitiveRefusal(status: number, body: any): boolean {
  if (status !== 400 && status !== 401) return false;
  const code = String(body?.error ?? body?.code ?? "");
  return code !== "invalid_client" && code !== "unauthorized_client";
}
