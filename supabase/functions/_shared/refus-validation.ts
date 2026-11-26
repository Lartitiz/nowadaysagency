// Trace d'une génération REFUSÉE par la validation des entrées (« Données
// invalides »). Posé le 26/11/2026 : le 25/11, un champ abîmé écrit par l'IA à
// l'étape du plan puis renvoyé tel quel par l'écran bloquait le carrousel
// photo, Réessayer compris (#2053) ; même famille le 21/07 (narrative_thread),
// le 04/10 (slide_type) et le 09/10 (image_role). Aucune routine ne le voyait :
// le refus n'était écrit nulle part. Il l'est maintenant dans le journal
// technique `frontend_debug_logs` (table existante, aucune migration), lu par
// le bilan du lundi (cron-health/generations-refusees.ts, ligne « 🚫 »).
// Jamais bloquant : une trace qui échoue ne change rien à la réponse.
import { getServiceClient } from "./auth.ts";

export const EVENEMENT_REFUS = "generation_refusee";

export function refusPayload(fonction: string, message: string, body?: any) {
  return {
    fonction,
    message: String(message || "").slice(0, 300),
    type: typeof body?.type === "string" ? body.type.slice(0, 60) : null,
    carousel_type: typeof body?.carousel_type === "string" ? body.carousel_type.slice(0, 30) : null,
  };
}

export async function noterRefusValidation(userId: string | null | undefined, fonction: string, message: string, body?: any, client?: any): Promise<void> {
  try {
    const { error } = await (client ?? getServiceClient()).from("frontend_debug_logs").insert({
      user_id: userId ?? null, event: EVENEMENT_REFUS, payload: refusPayload(fonction, message, body),
    });
    if (error) console.warn("[refus-validation] trace non écrite :", error.message);
  } catch (e) {
    console.warn("[refus-validation] trace non écrite :", (e as any)?.message || e);
  }
}
