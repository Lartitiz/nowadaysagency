/**
 * « Réessayer cette image seulement » en un clic (12/11/2026).
 *
 * Le serveur (action `retry`) remet la demande ratée telle quelle, sans rien
 * générer. Avant, il fallait ensuite cliquer « Générer cette image » : deux
 * gestes pour une demande déjà confirmée, et un échec de service (souvent
 * passager) donnait l'impression qu'il fallait tout recommencer.
 *
 * On enchaîne donc la génération, SAUF quand l'écran de confirmation a
 * quelque chose à dire : solde insuffisant, Premium requis, texte en cours
 * de saisie, étape d'intégration (choix de scène à valider).
 */
import type { StudioState } from "./api";

export function retryCanGenerateNow(state: StudioState | null | undefined, draft: string): boolean {
  const proposal = state?.session.proposal;
  if (!state || !proposal || !state.writable || !state.quota.allowed || draft.trim()) return false;
  if (proposal.operation !== "background" && state.generative_allowed === false) return false;
  if (proposal.scene_workflow?.phase === "integration") return false;
  if (state.versions.some((v) => v.status === "processing")) return false;
  const total = state.quota.available_total;
  if (total !== undefined && total < proposal.cost) return false;
  const images = state.quota.usage?.photo_retouch;
  if (images && images.limit > 0 && images.limit - images.used < proposal.cost) return false;
  return true;
}
