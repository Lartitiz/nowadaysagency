// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 1, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Chiffres inventés : liste blanche des chiffres du brief, des réponses, du
// branding et de l'actu ; tout autre chiffre est signalé.

import { FRENCH_NUMERALS } from "./text-utils.ts";

// ── Chiffres inventés (lot 3) ──
// Politique (arbitrage 10/07) : aucun chiffre précis qui ne vient pas de
// l'utilisatrice (brief, réponses, branding) ou de l'actu fournie. L'audit a
// montré des stats fabriquées ET contradictoires entre contenus (pertes
// « 10-20 % » vs « 20-30 % » vs « une sur trois » dans le même carrousel).

export const NUMBER_TOKEN = /\d+(?:[.,]\d+)?/g;

/** Multipliers/ratios need their own source: « deux usages » does not prove « deux fois plus ». */
export function measuredMultipliers(text: string): Array<{ raw: string; key: string; value: string; index: number }> {
  const number = "(?:\\d+(?:[.,]\\d+)?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|vingt|cent)";
  const re = new RegExp(`(?<!\\p{L})(${number})\\s+fois\\s+(plus|moins|sur\\s+(${number}))(?!\\p{L})`, "giu");
  const valueOf = (word: string) => String(FRENCH_NUMERALS[word.toLowerCase()] ?? Number(word.replace(",", ".")));
  return [...text.matchAll(re)].map(m => ({ raw: m[0], value: valueOf(m[1]),
    key: m[3] ? `ratio:${valueOf(m[1])}/${valueOf(m[3])}` : `multiplier:${valueOf(m[1])}:${m[2].toLowerCase()}`,
    index: m.index!,
  }));
}


/**
 * Durées écrites en lettres (« trois semaines », « six mois ») : NUMBER_TOKEN ne
 * voit que les chiffres, et un vécu inventé passait avec ses durées (« J'ai mis
 * trois semaines… », re-test réel 04/10/2026). « un / une » ne comptent pas.
 */
export function letterDurations(text: string): Array<{ raw: string; value: string; index: number }> {
  const re = /(?<!\p{L})(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|soixante|cent)\s+(secondes|minutes|heures|jours|journées|semaines|mois|ans|années)(?!\p{L})/giu;
  return [...text.matchAll(re)].map((m) => ({ raw: m[0], value: String(FRENCH_NUMERALS[m[1].toLowerCase()]), index: m.index! }));
}

/** Tokens numériques d'un texte (pour construire la liste blanche d'entrée). */
// Pourcentage : la valeur seule ne suffit pas (« depuis 21 ans » dans le
// branding n'autorise pas « +21 % », vu en test réel LinkedIn le 04/10/2026).
export const PERCENT_AFTER = /^\s?(?:%|pour\s?cent\b)/i;
export const pctKey = (value: string) => `pct:${value}`;

export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of (text || "").matchAll(NUMBER_TOKEN)) {
    const value = m[0].replace(",", ".");
    out.add(value);
    if (PERCENT_AFTER.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 10))) out.add(pctKey(value));
  }
  for (const m of letterDurations(text || "")) out.add(m.value);
  for (const m of measuredMultipliers(text || "")) {
    out.add(m.key);
    out.add(m.value);
    if (m.key.startsWith("ratio:")) out.add(m.key.split("/")[1]);
  }
  return out;
}

/** Chiffres du texte absents de la liste blanche, avec un extrait de contexte. */
export function findFabricatedNumbers(text: string, allowed: Set<string>): string[] {
  const found: string[] = [];
  const seenValues = new Set<string>();
  for (const m of (text || "").matchAll(NUMBER_TOKEN)) {
    const tok = m[0].replace(",", ".");
    const isPercent = PERCENT_AFTER.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 10));
    if (allowed.has(tok) && (!isPercent || allowed.has(pctKey(tok)))) continue;
    // Ordinaux (« 1er », « 2e », « 1ʳᵉ ») : pas des statistiques.
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 3);
    if (/^(?:er|re|e\b|ᵉ|ʳ)/.test(after)) continue;
    // Dédup par VALEUR : « 35 » relevé trois fois = un seul chiffre à traiter.
    if (seenValues.has(tok)) continue;
    seenValues.add(tok);
    const ctx = text.slice(Math.max(0, m.index! - 30), m.index! + m[0].length + 30).replace(/\s+/g, " ").trim();
    found.push(`${m[0]} (« …${ctx}… »)`);
  }
  for (const m of letterDurations(text || "")) {
    if (allowed.has(m.value) || seenValues.has(m.value)) continue;
    seenValues.add(m.value);
    const ctx = text.slice(Math.max(0, m.index - 30), m.index + m.raw.length + 30).replace(/\s+/g, " ").trim();
    found.push(`${m.raw} (« …${ctx}… »)`);
  }
  for (const m of measuredMultipliers(text || "")) {
    if (allowed.has(m.key) || seenValues.has(m.value)) continue;
    seenValues.add(m.value);
    const ctx = text.slice(Math.max(0, m.index - 30), m.index + m.raw.length + 40).replace(/\s+/g, " ").trim();
    found.push(`${m.raw} (« …${ctx}… »)`);
  }
  return found;
}
