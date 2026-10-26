// cron-health, scope weekly : fiches de marque restées « à relire » alors que
// la relecture est faite (26/10/2026).
// Jusqu'à #1809, « Je valide tout » n'écrivait le statut « completed » qu'au clic
// sur la carte de fin : 4 inscrites du 01/10 sont restées bloquées 25 jours sur
// « Ta fiche de marque t'attend » (page Créer), sans qu'aucune sonde le voie.
// Ligne du bilan du lundi : « 🪪 Fiches coincées ». Seuil : 0 attendu ; ≥ 1 = la
// relecture n'écrit plus son statut, à regarder.
// Une fiche compte quand : statut pending_review, au moins 6 cartes relues sur 7
// (une carte vide laissée « pour plus tard » ne compte pas comme relue), et plus
// de 24 h sans mouvement. Clientes seulement (comptes internes et de recette exclus).
import { DAY } from "./lecture.ts";

export const CARTES_MIN = 6;

export function fichesCoincees(rows: any[], { isClient, now }: { isClient: (userId: string) => boolean; now: number }) {
  const clientes = rows.filter((r) => r?.user_id && isClient(r.user_id));
  const coincees = clientes.filter((r) => {
    const relues = Array.isArray(r.reviewed) ? r.reviewed.length : 0;
    const t = Date.parse(r.updated_at);
    return relues >= CARTES_MIN && Number.isFinite(t) && now - t > DAY;
  });
  const plusAncienne = coincees.map((r) => r.updated_at).sort()[0] ?? null;
  return { a_relire: clientes.length, coincees: coincees.length, plus_ancienne: plusAncienne ? String(plusAncienne).slice(0, 10) : null };
}

export async function lireFichesCoincees(supabase: any, fetchAllRows: (s: any, t: string, c: string, m?: (q: any) => any) => Promise<any[]>) {
  return fetchAllRows(supabase, "branding_autofill", "user_id, updated_at, reviewed:analysis_result->reviewed_sections", (q) => q.eq("autofill_status", "pending_review"));
}
