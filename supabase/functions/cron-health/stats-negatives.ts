// Relevés de stats LinkedIn avec un chiffre NÉGATIF (25/11/2026).
// Le 24/11/2026, la carte « Mes stats LinkedIn » affichait « -1 Reposts » : un
// repost retiré pendant les 30 jours, LinkedIn compte en moins. Depuis #2045
// l'écran et la lecture de LinkedIn ramènent ces chiffres à 0 ; cette ligne
// surveille que plus aucun relevé négatif n'arrive en base. On ne regarde que
// les relevés pris depuis 48 h (monthly_stats.custom_data.li_stats.fetchedAt) :
// un vieux relevé déjà vu ne doit pas rester en alerte chaque matin.
// `followersGained30d` n'est pas compté : perdre des abonnés est un vrai chiffre.
// Seuil > 0 = 🟠.
import { fetchAllRows, HOUR } from "./lecture.ts";

// deno-lint-ignore no-explicit-any
type Client = any;
export interface StatsRow { month_date?: string | null; custom_data?: unknown }
export interface ChiffreNegatif { mois: string | null; champ: string; valeur: number }

export function chiffresNegatifs(rows: StatsRow[], now: number): ChiffreNegatif[] {
  const out: ChiffreNegatif[] = [];
  for (const row of rows) {
    // deno-lint-ignore no-explicit-any
    const li = (row.custom_data as any)?.li_stats;
    if (!li || typeof li !== "object") continue;
    const pris = Date.parse(li.fetchedAt ?? "");
    if (!Number.isFinite(pris) || now - pris > 48 * HOUR) continue;
    const champs: [string, unknown][] = [["followers", li.followers], ...Object.entries(li.postAnalytics30d ?? {})];
    for (const [champ, valeur] of champs) {
      if (typeof valeur === "number" && valeur < 0) out.push({ mois: row.month_date ?? null, champ, valeur });
    }
  }
  return out;
}

export async function statsLinkedInNegatives(
  supabase: Client,
  now: number,
): Promise<{ count: number; items: ChiffreNegatif[] } | { erreur: string }> {
  try {
    // Un relevé est rangé dans le mois en cours : la ligne vient d'être modifiée.
    const rows = await fetchAllRows(supabase, "monthly_stats", "month_date, custom_data, updated_at",
      (q) => q.gte("updated_at", new Date(now - 48 * HOUR).toISOString()));
    const items = chiffresNegatifs(rows, now);
    return { count: items.length, items: items.slice(0, 10) };
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    return { erreur: String((e as any)?.message ?? e) };
  }
}
