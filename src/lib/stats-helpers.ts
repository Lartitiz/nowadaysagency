export const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthLabel(dateStr: string) {
  const d = new Date(dateStr);
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthLabelShort(dateStr: string) {
  const d = new Date(dateStr);
  return `${MONTHS_FR[d.getMonth()].slice(0, 3)}. ${d.getFullYear()}`;
}

export function pctChange(cur: number | null, prev: number | null): { val: number; dir: "up" | "down" | "flat" } | null {
  if (cur == null || prev == null || prev === 0) return null;
  const val = ((cur - prev) / prev) * 100;
  return { val, dir: val > 5 ? "up" : val < -5 ? "down" : "flat" };
}

export function fmt(n: number | null | undefined): string {
  if (n == null) return "–";
  return n.toLocaleString("fr-FR");
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "–";
  return `${n.toFixed(1)}%`;
}

export function fmtEur(n: number | null | undefined): string {
  if (n == null) return "–";
  return `${Math.round(n).toLocaleString("fr-FR")}€`;
}

export function safeDivPct(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return (num / den) * 100;
}

export function safeDiv(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}
