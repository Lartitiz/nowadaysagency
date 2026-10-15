// Plafond quotidien des discussions du Studio pour le plan Gratuit (15/10/2026,
// décision de Laetitia après l'audit mensuel du 14/10).
// La discussion (interprétation par l'IA, avec images) ne consomme aucun crédit :
// sans ce plafond, un compte gratuit pouvait lancer 100 interprétations par jour
// à nos frais (limite SQL de `studio_reserve_interpretation`, commune à tous).
// Premium et comptes de recette gardent la limite SQL de 100 par jour.
import { checkQuota, isQaTestAccount } from "../_shared/plan-limiter.ts";
import { premiumAllowed } from "./contract.ts";

export const FREE_DAILY_INTERPRETATIONS = 15;
export const FREE_LIMIT_MESSAGE =
  `Avec le plan gratuit, le Studio répond à ${FREE_DAILY_INTERPRETATIONS} demandes par jour. ` +
  "Reviens demain, ou passe en Premium pour continuer aujourd’hui.";

/** Renvoie true quand une cliente gratuite a déjà atteint son plafond sur 24 h glissantes. */
export async function freeInterpretationCapReached(
  // deno-lint-ignore no-explicit-any
  sb: any, actor: string, workspaceId: string,
  readQuota = (id: string, ws: string) => checkQuota(id, "photo_retouch", ws, sb),
): Promise<boolean> {
  if (isQaTestAccount(actor)) return false;
  // Même lecture du plan que l'écran du Studio (read-state.ts) : admin, plan
  // perso, plan de l'espace facturé. En cas d'erreur de lecture, on laisse
  // passer : la limite SQL de 100 par jour reste le filet.
  const quota = await readQuota(actor, workspaceId);
  if (quota.reason === "error" || premiumAllowed(quota.plan, false)) return false;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error } = await sb
    .from("visual_studio_interpretations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", actor)
    .gt("created_at", since);
  if (error) throw error;
  return (count ?? 0) >= FREE_DAILY_INTERPRETATIONS;
}
