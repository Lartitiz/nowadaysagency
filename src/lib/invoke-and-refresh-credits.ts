import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { invalidateUserPlanCache } from "@/hooks/use-user-plan";

export type { InvokeError } from "@/lib/invoke-with-timeout";

/** Remet à jour le compteur de crédits affiché (en-tête, menu), sans hook :
 *  utilisable hors WorkspaceProvider. Ne doit jamais faire échouer l'action
 *  qui vient de réussir. */
export function refreshCreditsCounter() {
  try {
    invalidateUserPlanCache(true);
  } catch { /* le compteur se remettra à jour au prochain chargement */ }
}

/** Comme invokeWithTimeout, pour un appel qui coûte des crédits : après un
 *  succès, le compteur de l'en-tête suit tout de suite. Après un échec, rien
 *  n'a été débité, on ne recharge pas.
 *  Vu le 24/11/2026 : « Réécrire ma carte » coûtait 1 crédit, mais l'en-tête
 *  restait à « 23 crédits » jusqu'à la première génération. */
export const invokeAndRefreshCredits: typeof invokeWithTimeout = async (...args) => {
  const result = await invokeWithTimeout(...args);
  if (!result.error) refreshCreditsCounter();
  return result;
};
