// Plafond quotidien des étapes GRATUITES de création (angles, questions, suite,
// accroches, dictée). Décision de Laetitia du 20/10/2026 (audit de coût API) :
// ces étapes ne débitent aucun crédit et n'avaient aucun quota, seulement la
// limite de 20 appels par minute gardée en mémoire. Un compte gratuit pouvait
// donc les enchaîner sans fin à nos frais (prompt système de ~50 000 caractères).
//
// Même principe que le Studio (visual-studio/free-interpretation-cap.ts) :
// compteur sur 24 h glissantes, aucun crédit débité. Le compteur est la table
// ai_usage_hors_credit (source « etape_gratuite »), qui sert aussi au bilan du
// lundi pour le coût. En cas d'erreur de lecture, on laisse passer.
import { checkQuota, isQaTestAccount } from "../_shared/plan-limiter.ts";
import { compterHorsCredit24h } from "../_shared/usage-hors-credit.ts";

/** Étapes facturées (1 crédit) : hors plafond. Toutes les autres sont gratuites. */
export const BILLED_STEPS = new Set(["generate", "adjust", "recycle"]);

/** ~8 contenus préparés par jour en gratuit (3 à 4 étapes par contenu). */
export const FREE_STEPS_DAILY_FREE = 30;
/** Garde-fou d'usage raisonnable en payant, invisible en usage normal. */
export const FREE_STEPS_DAILY_PAID = 150;

// Pas les mots « crédit », « quota » ni « limite » : plusieurs écrans les
// détectent et afficheraient à tort l'écran « plus de crédits ».
export const FREE_STEPS_MESSAGE =
  "Tu as beaucoup exploré aujourd'hui : les suggestions (angles, questions, accroches) reviennent demain. " +
  "Tu peux déjà créer ton contenu avec ce que tu as.";

export async function freeStepsCapReached(
  // deno-lint-ignore no-explicit-any
  sb: any, userId: string, workspaceId: string | null | undefined,
  readPlan = async (id: string, ws: string | null | undefined) => (await checkQuota(id, "content", ws)).plan,
): Promise<boolean> {
  if (isQaTestAccount(userId)) return false;
  try {
    const plan = await readPlan(userId, workspaceId);
    if (plan === "admin" || plan === "unknown") return false;
    const plafond = plan === "free" ? FREE_STEPS_DAILY_FREE : FREE_STEPS_DAILY_PAID;
    return (await compterHorsCredit24h(sb, userId, "etape_gratuite")) >= plafond;
  } catch (e) {
    console.warn(JSON.stringify({ type: "free_steps_cap_unreadable", error: String((e as any)?.message || e) }));
    return false;
  }
}

export function freeStepsCapResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "free_steps_daily_cap", message: FREE_STEPS_MESSAGE }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
