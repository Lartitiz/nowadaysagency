/**
 * Purge centralisée de toutes les clés de persistance applicative.
 * À appeler au logout et au switch de compte.
 * Source unique de vérité pour la liste des clés à nettoyer.
 */

// Clés sessionStorage à clé fixe utilisées dans l'app
const SESSION_KEYS = [
  "creer_flow_state",
  "creer_unifie_result",
  "audit_recommendation",
];

// Préfixes sessionStorage scopés par user (à balayer)
const SESSION_PREFIXES = [
  "onboarding_checked", // matche aussi l'ancienne clé fixe + "onboarding_checked:{id}" + ":demo"
];

// Préfixes localStorage scopés par user (à balayer)
const LOCAL_PREFIXES = [
  "creer_flow_state_backup", // matche "creer_flow_state_backup:{userId}"
];

function sweepByPrefix(storage: Storage, prefixes: string[]) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const k = storage.key(i);
    if (k && prefixes.some(p => k === p || k.startsWith(p + ":"))) {
      storage.removeItem(k);
    }
  }
}

export function clearAppStorage() {
  try {
    for (const k of SESSION_KEYS) {
      sessionStorage.removeItem(k);
    }
    sweepByPrefix(sessionStorage, SESSION_PREFIXES);
  } catch { /* storage indisponible — ignore */ }
  try {
    sweepByPrefix(localStorage, LOCAL_PREFIXES);
  } catch { /* storage indisponible — ignore */ }
}
