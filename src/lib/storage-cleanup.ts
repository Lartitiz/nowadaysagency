/**
 * Purge centralisée de toutes les clés de persistance applicative.
 * À appeler au logout et au switch de compte.
 * Source unique de vérité pour la liste des clés à nettoyer.
 */

// Clés sessionStorage à clé fixe utilisées dans l'app
const SESSION_KEYS = [
  "lac_fresh_signup",
  "creer_flow_state",
  "creer_unifie_result",
  "creer_flow_photos",
  "audit_recommendation",
];


// Préfixes sessionStorage scopés par user (à balayer)
const SESSION_PREFIXES = [
  "onboarding_checked", // matche aussi l'ancienne clé fixe + "onboarding_checked:{id}" + ":demo"
];

// Clés localStorage à clé fixe NON scopées par compte → fuiteraient entre comptes
// empilés dans le même navigateur si on ne les purge pas au switch/logout.
const LOCAL_KEYS = [
  // Workspace actif : sinon, au changement de compte, on reste pointé sur le
  // workspace du compte précédent → l'app affiche le profil/branding du
  // propriétaire de CET espace (modèle agence) au lieu du nouveau compte.
  "active_workspace_id",

  // Brouillon d'onboarding + prénom de l'inscription. NON scopés par compte :
  // sans purge, le prénom d'un compte/espace (ex. « Camille » du compte test)
  // reste dans lac_prenom et est réécrit comme prénom par défaut au prochain
  // onboarding → contamine le profil d'un autre compte/espace ("Salut Camille"
  // partout). Cf use-onboarding.ts (seed depuis lac_prenom) + SignupForm.tsx.
  "lac_prenom",
  "lac_onboarding_step",
  "lac_onboarding_answers",
  "lac_onboarding_branding",
  "lac_onboarding_ts",
  "lac_onboarding_reset",
  "lac_branding_cache_refreshed",

  // État d'affichage du bandeau « Tes premiers pas » (replié / masqué / vu).
  // Globaux → l'état bave entre espaces (un dismiss sur un espace masque le
  // bandeau partout, et inversement). Purgés au switch pour repartir propre.
  "lac_missions_collapsed",
  "lac_missions_first_seen",
  "missions_dismissed_at",
];

// Préfixes localStorage scopés par user (à balayer)
const LOCAL_PREFIXES = [
  "creer_flow_state_backup", // matche "creer_flow_state_backup:{userId}"
  "creer_flow_photos_backup", // manifeste photo de secours, "…:{userId}"
];

// Bases IndexedDB applicatives à supprimer (base64 lourd des photos en cours)
const IDB_NAMES = ["creer_photos"];

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
    for (const k of LOCAL_KEYS) {
      localStorage.removeItem(k);
    }
    sweepByPrefix(localStorage, LOCAL_PREFIXES);
  } catch { /* storage indisponible — ignore */ }
  try {
    if (typeof indexedDB !== "undefined") {
      for (const name of IDB_NAMES) indexedDB.deleteDatabase(name);
    }
  } catch { /* IndexedDB indisponible — ignore */ }
}
