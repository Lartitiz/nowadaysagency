// cron-health, scope weekly : générations refusées par la validation des
// entrées (« Données invalides »), 26/11/2026.
// Le 25/11, un champ abîmé écrit par l'IA dans le plan d'un carrousel photo
// était refusé par carousel-ai, Réessayer compris (#2053) : la cliente voyait
// « Quelque chose n'a pas fonctionné » et aucune routine ne le voyait.
// Depuis, chaque refus laisse une ligne dans `frontend_debug_logs`
// (`_shared/refus-validation.ts`). Ligne du bilan du lundi : « 🚫 Générations
// refusées ». Seuil : 0 attendu sur 7 jours ; ≥ 1 = lire le message du dernier
// refus (il nomme le champ) et corriger le garde qui laisse passer ce champ.
// TOUS les comptes comptent, internes compris : le refus du 25/11 est arrivé
// sur un compte de démonstration. Le nombre de clientes touchées est donné à part.
import { DAY } from "./lecture.ts";

export const EVENEMENT_REFUS = "generation_refusee";

export function generationsRefusees(rows: any[], { isClient, now }: { isClient: (userId: string) => boolean; now: number }) {
  const sept = rows.filter((r) => {
    const t = Date.parse(r?.created_at);
    return Number.isFinite(t) && now - t <= 7 * DAY && now - t >= 0;
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const dernier = sept[0];
  return {
    refus: sept.length,
    comptes: new Set(sept.map((r) => r.user_id || "inconnu")).size,
    clientes: new Set(sept.filter((r) => r.user_id && isClient(r.user_id)).map((r) => r.user_id)).size,
    dernier: dernier ? {
      date: String(dernier.created_at).slice(0, 10),
      fonction: String(dernier.payload?.fonction || "?").slice(0, 40),
      message: String(dernier.payload?.message || "").slice(0, 160),
    } : null,
  };
}

export async function lireGenerationsRefusees(supabase: any, fetchAllRows: (s: any, t: string, c: string, m?: (q: any) => any) => Promise<any[]>, now: number) {
  return fetchAllRows(supabase, "frontend_debug_logs", "user_id, created_at, payload", (q) => q.eq("event", EVENEMENT_REFUS).gte("created_at", new Date(now - 7 * DAY).toISOString()));
}
