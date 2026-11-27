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

/** Longueur au-delà de laquelle un titre d'idée n'est plus « une phrase qu'on dit » (règle de `_shared/ideas/title.ts`). */
export const TITRE_MAX = 110;
/** Lecture des 4 titres (#2158, 27/11/2026) : un titre trop long ou coupé par un deux-points qui
 * annonce une explication est le signe que la règle « compris de tous » n'est plus appliquée
 * (consigne réécrite, fonction redéployée d'une vieille version). Ne juge pas le fond : les titres
 * sont imprimés pour être lus. Jamais 🔴 : c'est une lecture, pas une panne. */
export function verdictTitres(ideas: unknown): { niveau: "✅" | "🟠"; titres: string[]; hors: number; motif: string } {
  const titres = (Array.isArray(ideas) ? ideas as Array<Record<string, unknown>> : []).map(i => String(i?.subject ?? "").trim()).filter(Boolean);
  const hors = titres.filter(t => t.length > TITRE_MAX || /:\s/.test(t)).length;
  return { niveau: hors ? "🟠" : "✅", titres, hors, motif: hors ? `${hors} titre(s) sur ${titres.length} de plus de ${TITRE_MAX} caractères ou avec un deux-points` : `${titres.length} titres courts, sans deux-points` };
}
