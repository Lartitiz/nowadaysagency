/**
 * Purge centralisée de toutes les clés de persistance applicative.
 * À appeler au logout et au switch de compte.
 * Source unique de vérité pour la liste des clés à nettoyer.
 */

// Clés sessionStorage utilisées dans l'app
const SESSION_KEYS = [
  "creer_flow_state",
  "creer_unifie_result",
  "audit_recommendation",
  "onboarding_checked",
];

// Clés localStorage utilisées dans l'app (hors auth Supabase)
const LOCAL_KEYS = [
  "creer_flow_state_backup",
];

export function clearAppStorage() {
  try {
    for (const k of SESSION_KEYS) {
      sessionStorage.removeItem(k);
    }
  } catch { /* storage indisponible — ignore */ }
  try {
    for (const k of LOCAL_KEYS) {
      localStorage.removeItem(k);
    }
  } catch { /* storage indisponible — ignore */ }
}
