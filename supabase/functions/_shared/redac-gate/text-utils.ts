// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 1, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Outils de texte partagés par toutes les familles du gate : aucune dépendance.

// Nombres écrits en lettres : chiffres inventés (numbers.ts), recherche et durées.
export const FRENCH_NUMERALS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20,
  trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100,
};

export const wordCount = (s: string) => (s || "").trim().split(/\s+/).filter(Boolean).length;

/** Phrases d'un texte (coupe sur . ! ? … suivis d'un blanc, et sur les retours à la ligne). */
export function sentencesOf(text: string): string[] {
  return (text || "").split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** Mots normalisés (accents gardés, ponctuation ignorée) pour comparer deux textes. */
export function normalizeWordsForOverlap(text: string): string[] {
  return (text || "").toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
}

export interface OffsetWord { word: string; start: number; end: number }

/** Comme normalizeWordsForOverlap, mais garde la position dans le texte source. */
export function wordsWithOffsets(text: string): OffsetWord[] {
  const out: OffsetWord[] = [];
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) {
    out.push({ word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Similarité lexicale grossière (Jaccard sur tokens > 3 lettres). */
export function tokenSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set((s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3));
  const ta = tok(a);
  const tb = tok(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.min(ta.size, tb.size);
}
