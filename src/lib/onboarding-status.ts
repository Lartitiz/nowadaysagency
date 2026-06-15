/**
 * Helper unique de résolution du statut onboarding.
 *
 * Lit `onboarding_completed` dans deux tables séparées (`profiles` et
 * `user_plan_config`) et renvoie un statut explicite à 3 états. Ne jamais
 * interpréter un résultat non fiable (null / erreur RLS) comme « pas onboardé ».
 *
 * Responsabilités HORS scope (déléguées à l'appelant) :
 * - Gating session/token : l'appelant doit s'assurer que la session est prête
 *   avant d'invoquer ce helper (via `useAuth().session?.access_token`).
 * - Cache / navigation : le helper est pur.
 */

import { supabase } from "@/integrations/supabase/client";

export type OnboardingStatus = "done" | "needs" | "unknown";

export interface ResolveOnboardingStatusOptions {
  /** ID utilisé pour requêter `profiles` (résolu workspace côté appelants). */
  profileUserId: string;
  /** ID utilisé pour requêter `user_plan_config` (= user.id côté appelants). */
  planConfigUserId: string;
}

/**
 * Résout le statut onboarding via les deux tables sources.
 *
 * Règles de décision :
 * - `"done"`    → au moins une table renvoie `onboarding_completed === true`.
 * - `"needs"`   → au moins une LIGNE EXISTE avec `onboarding_completed === false`
 *                 ET aucune table ne renvoie `true`.
 * - `"unknown"` → les deux requêtes sont indisponibles (null/undefined ou rejetées).
 *                 Un `null` (ligne absente ou bloquée par RLS) ne contribue
 *                 JAMAIS à `"needs"`.
 *
 * `Promise.allSettled` : si une seule requête échoue, on exploite quand même
 * la table qui a répondu. On ne tombe en `"unknown"` que si les DEUX sont KO.
 */
export async function resolveOnboardingStatus(
  opts: ResolveOnboardingStatusOptions
): Promise<OnboardingStatus> {
  const { profileUserId, planConfigUserId } = opts;

  const [profileResult, configResult] = await Promise.allSettled([
    supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", profileUserId)
      .maybeSingle(),
    supabase
      .from("user_plan_config")
      .select("onboarding_completed")
      .eq("user_id", planConfigUserId)
      .maybeSingle(),
  ]);

  // Extraction : { row, available } où `available` = true si la requête a
  // techniquement abouti (même si la ligne est absente, data peut être null).
  // Une requête rejetée OU une erreur Supabase rend la table indisponible.
  const profile =
    profileResult.status === "fulfilled" && !profileResult.value.error
      ? (profileResult.value.data as { onboarding_completed: boolean | null } | null)
      : undefined; // undefined = indisponible ; null = ligne absente
  const config =
    configResult.status === "fulfilled" && !configResult.value.error
      ? (configResult.value.data as { onboarding_completed: boolean | null } | null)
      : undefined;

  const profileTrue = profile !== undefined && profile !== null && profile.onboarding_completed === true;
  const configTrue = config !== undefined && config !== null && config.onboarding_completed === true;

  if (profileTrue || configTrue) return "done";

  // "needs" requiert une ligne réellement présente avec false explicite.
  // Un null (ligne absente ou bloquée RLS) ne déclenche JAMAIS "needs".
  const profileFalse = profile !== undefined && profile !== null && profile.onboarding_completed === false;
  const configFalse = config !== undefined && config !== null && config.onboarding_completed === false;

  if (profileFalse || configFalse) return "needs";

  // Si les deux tables sont indisponibles, on est en "unknown".
  // Si l'une est disponible mais renvoie null (ligne absente), idem : "unknown".
  return "unknown";
}
