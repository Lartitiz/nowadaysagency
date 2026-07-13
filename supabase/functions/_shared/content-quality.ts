// Télémétrie qualité de la génération de contenu — table append-only
// `content_quality_events`, écrite à CHAQUE passage du gate rédactionnel.
//
// Pourquoi : le score de `runRedacGate` finissait en console.log, et
// `generated_carousels.quality_score` n'est écrit qu'en front (si l'utilisatrice
// sauve un brouillon), donc souvent null. Ici on mesure CHAQUE génération côté
// serveur → le score de gate du bilan hebdo (edge cron-health) devient complet et
// fiable, ce qui permet de détecter une non-régression après un swap de modèle
// (bascule Sonnet 5) ou un redéploiement.
//
// Fire-and-forget, calqué sur logUsage : même client service, même bypass des
// comptes QA, et un échec d'insert n'interrompt JAMAIS la génération (try/catch).
import { getServiceClient, isQaTestAccount } from "./plan-limiter.ts";
import type { RedacGateResult } from "./redac-gate.ts";

export async function logContentQuality(
  userId: string,
  format: string,
  gate: RedacGateResult,
  modelUsed?: string,
  workspaceId?: string,
): Promise<void> {
  // Contenu illisible (JSON non parsé) : rien à mesurer.
  if (gate.score == null) return;
  // Comptes QA exclus (même Set déterministe que logUsage/checkQuota).
  if (isQaTestAccount(userId)) return;
  try {
    await getServiceClient().from("content_quality_events").insert({
      user_id: userId,
      workspace_id: workspaceId || null,
      format,
      model: modelUsed || null,
      redac_score: gate.score,
      redac_violations: gate.violations,
      redac_repassed: gate.repassed,
    });
  } catch (e) {
    console.error("[content-quality] insert ignoré (génération intacte) :", (e as any)?.message || e);
  }
}
