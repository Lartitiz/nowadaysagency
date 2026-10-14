// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 1, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Durées qui se contredisent entre les slides et la légende.

import { FRENCH_NUMERALS } from "./text-utils.ts";

// ── Cohérence des durées slides ↔ caption (bilan hebdo 17/08/2026) ──
// Trou trouvé au juge /5 : un carrousel « avant/après » notait « Trois semaines
// sans visite » en slide 2 et « Un mois entre les deux photos » en légende — deux
// chiffres qui décrivent le MÊME fait, et le gate lui a mis 100/100.
// Pourquoi ça passait : NUMBER_TOKEN ne voit que les CHIFFRES (\d), donc les
// nombres écrits EN LETTRES échappaient déjà à `findFabricatedNumbers` ; et rien
// ne relisait les slides CONTRE la caption (les deux textes n'étaient comparés
// que pour le CTA). Une contradiction interne est pourtant le défaut le plus
// coûteux : il décrédibilise la publication devant l'audience de la cliente.


/** Durée exprimée en JOURS, pour comparer « trois semaines » et « un mois ». */
export const DURATION_UNITS: Array<{ re: RegExp; days: number }> = [
  { re: /^secondes?$/, days: 1 / 86400 },
  { re: /^minutes?$/, days: 1 / 1440 },
  { re: /^heures?$/, days: 1 / 24 },
  { re: /^(?:jours?|journées?)$/, days: 1 },
  { re: /^semaines?$/, days: 7 },
  { re: /^mois$/, days: 30 },
  { re: /^trimestres?$/, days: 90 },
  { re: /^(?:ans?|années?)$/, days: 365 },
];

export interface Duration { raw: string; days: number }

/** Durées d'un texte, chiffrées (« 3 semaines ») ou en lettres (« trois semaines »). */
export function extractDurations(text: string): Duration[] {
  const out: Duration[] = [];
  const words = "(?:" + Object.keys(FRENCH_NUMERALS).join("|") + ")";
  const re = new RegExp(`(\\d+(?:[.,]\\d+)?|${words})\\s+(\\p{L}+)`, "giu");
  for (const m of (text || "").matchAll(re)) {
    const qty = /^\d/.test(m[1]) ? parseFloat(m[1].replace(",", ".")) : FRENCH_NUMERALS[m[1].toLowerCase()];
    if (!qty || !Number.isFinite(qty)) continue;
    const unit = DURATION_UNITS.find((u) => u.re.test(m[2].toLowerCase()));
    if (!unit) continue;
    out.push({ raw: `${m[1]} ${m[2]}`, days: qty * unit.days });
  }
  return out;
}

/**
 * Durées PROCHES mais DIFFÉRENTES entre les slides et la caption = très
 * probablement le même fait raconté deux fois avec deux chiffres.
 *
 * Volontairement étroit pour ne pas crier à tort :
 *  - il faut une durée de CHAQUE côté ;
 *  - une durée commune aux deux côtés désamorce tout (le fait est cohérent) ;
 *  - on ne retient que les écarts du même ORDRE DE GRANDEUR (rapport ≤ 3) —
 *    « 2 minutes » côté slide et « 10 ans » côté caption parlent d'autre chose.
 */
export function findDurationConflicts(slidesText: string, captionText: string): string[] {
  const a = extractDurations(slidesText);
  const b = extractDurations(captionText);
  if (!a.length || !b.length) return [];
  const same = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  if (a.some((x) => b.some((y) => same(x.days, y.days)))) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of a) {
    for (const y of b) {
      const ratio = Math.max(x.days, y.days) / Math.min(x.days, y.days);
      if (ratio > 3) continue;
      const key = `${x.raw}|${y.raw}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`slides « ${x.raw} » vs légende « ${y.raw} »`);
    }
  }
  return out;
}
