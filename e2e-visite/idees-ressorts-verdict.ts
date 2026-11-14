/** Verdict de la sonde « Trouver une idée » (#1984) : 4 idées, 4 ressorts différents,
 * chacune avec « Pourquoi on l'enverra ». Pur, testable contre une réponse d'avant les ressorts. */
export const RESSORTS = ["geste", "clin_oeil", "position", "metier", "cause", "moment", "autres", "eclairer"];
export function verdictIdees(ideas: unknown): { niveau: "✅" | "🟠" | "🔴"; ressorts: string[]; avecRaison: number; motif: string } {
  const list = Array.isArray(ideas) ? ideas as Array<Record<string, unknown>> : [];
  const ressorts = list.map(i => String(i?.spring ?? "aucun"));
  const distincts = new Set(ressorts.filter(r => RESSORTS.includes(r))).size;
  const avecRaison = list.filter(i => typeof i?.share_reason === "string" && (i.share_reason as string).trim().length > 10).length;
  if (list.length !== 4) return { niveau: "🔴", ressorts, avecRaison, motif: `${list.length} idée(s) au lieu de 4` };
  if (distincts < 4) return { niveau: "🟠", ressorts, avecRaison, motif: `${distincts} ressort(s) différent(s) sur 4` };
  if (avecRaison < 4) return { niveau: "🟠", ressorts, avecRaison, motif: `« Pourquoi on l'enverra » sur ${avecRaison}/4` };
  return { niveau: "✅", ressorts, avecRaison, motif: "4 ressorts différents, 4 raisons de partage" };
}
