/** Date courte d'une actu (« 14 oct. 2026 ») depuis AAAA-MM-JJ ; vide si illisible. */
export function dateActu(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
