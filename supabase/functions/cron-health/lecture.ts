// cron-health : unités de temps et lecture paginée, communes aux deux scopes
// (sorties d'index.ts, fiche 18 lot 1, à l'identique).
export const HOUR = 3600000;
export const DAY = 24 * HOUR;

// PostgREST plafonne silencieusement chaque select à 1000 lignes (leçon PR #456 :
// ai_usage avait dépassé le seuil et les stats étaient fausses sans aucune erreur).
// Toute lecture de table qui grossit passe donc par cette boucle paginée — même
// pattern que activation-funnel / admin-users. content_quality_events est écrite à
// CHAQUE génération (PR #593) : c'est la première à franchir 1000 lignes sur 35 j.
export async function fetchAllRows(
  supabase: any,
  table: string,
  columns: string,
  modify?: (q: any) => any,
): Promise<any[]> {
  const PAGE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns);
    if (modify) q = modify(q);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}
