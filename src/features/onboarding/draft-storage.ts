// Brouillon local de l'onboarding (une mission : savoir s'il est encore valable
// et le purger). Importé par src/hooks/use-onboarding.ts.
// NE PAS renommer les clés : elles sont lues ou effacées ailleurs
// (Onboarding.tsx, OnboardingPhase2Import.tsx, use-guide-recommendation.ts,
// storage-cleanup.ts…, voir docs/robustesse/gros-fichiers.md, fiche 23).

const DRAFT_TTL_DAYS = 7;

const DRAFT_KEYS = [
  "lac_onboarding_step",
  "lac_onboarding_answers",
  "lac_onboarding_branding",
  "lac_onboarding_ts",
];

/** Vrai si le brouillon local date de plus de 7 jours (lecture seule). */
export function isOnboardingDraftExpired(now = new Date()): boolean {
  const savedTs = localStorage.getItem("lac_onboarding_ts");
  if (!savedTs) return false;
  const limit = new Date(now);
  limit.setDate(limit.getDate() - DRAFT_TTL_DAYS);
  return new Date(savedTs) < limit;
}

/**
 * Brouillon expiré : efface ses 4 clés (étape comprise) et rend `true`.
 * L'étape doit alors repartir de 0, sinon on reprend au milieu avec des
 * réponses vidées.
 */
export function purgeExpiredOnboardingDraft(): boolean {
  if (!isOnboardingDraftExpired()) return false;
  DRAFT_KEYS.forEach(key => localStorage.removeItem(key));
  return true;
}

/**
 * Étape au-delà du parcours sans diagnostic local (compte remis à zéro) :
 * efface les 4 clés du brouillon ET la liste des captures de ce compte.
 * Ce n'est pas la purge de fin d'onboarding (qui efface aussi lac_prenom,
 * lac_activite et le diagnostic local) : ne pas les fusionner.
 */
export function purgeStaleOnboardingDraft(userId: string): void {
  DRAFT_KEYS.forEach(key => localStorage.removeItem(key));
  localStorage.removeItem(`lac_onboarding_upload_ids:${userId}`);
}
