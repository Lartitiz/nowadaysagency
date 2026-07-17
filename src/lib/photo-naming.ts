/**
 * photo-naming — noms et descriptions des photos dérivées (packshot, mise en
 * scène, portrait pro, variantes saisonnières).
 *
 * Sans garde, chaque dérivation empile son suffixe sur celui de la source :
 * « bureau-bois — packshot — Noël — packshot », et les descriptions cumulent
 * leurs préfixes (« Packshot fond blanc — Version Noël — … »). Ces textes sont
 * affichés (survol de carte, titre du détail) ET servent de matière au matching
 * photo ↔ contenu : on repart donc toujours de la racine avant de suffixer.
 */

import { MARRONNIERS } from "@/lib/marronniers";

// Suffixes posés par les outils de dérivation (libellés saisonniers inclus).
const DERIVATION_SUFFIXES = new Set(
  ["packshot", "mise en scène", "portrait pro", ...MARRONNIERS.map((m) => m.label)].map((s) =>
    s.toLowerCase(),
  ),
);

// Préfixes de description posés par ces mêmes outils. « Version X — » couvre
// les variantes saisonnières (X = libellé de marronnier, borné pour ne pas
// avaler une vraie description contenant un tiret cadratin).
const DESCRIPTION_PREFIXES = [
  /^packshot fond blanc\s+—\s+/i,
  /^mise en scène ia\s+—\s+/i,
  /^portrait pro\s+—\s+/i,
  /^version [^—]{1,40}—\s+/i,
];

/** Nom de la photo sans ses suffixes de dérivation (« a — packshot — Noël » → « a »). */
export function rootPhotoName(name: string | null | undefined, fallback = "Photo"): string {
  const base = (name ?? "").trim() || fallback;
  const parts = base.split(" — ");
  while (parts.length > 1 && DERIVATION_SUFFIXES.has(parts[parts.length - 1].trim().toLowerCase())) {
    parts.pop();
  }
  return parts.join(" — ").trim() || fallback;
}

/** Nom d'une photo dérivée : racine de la source + un seul suffixe. */
export function derivedPhotoName(
  sourceName: string | null | undefined,
  suffix: string,
  fallback = "Photo",
): string {
  // 120 = plafond de la colonne name (cf. uploadPhotoOriginal)
  return `${rootPhotoName(sourceName, fallback)} — ${suffix}`.slice(0, 120);
}

/** Description sans ses préfixes de dérivation empilés (null si vide). */
export function rootPhotoDescription(description: string | null | undefined): string | null {
  let d = (description ?? "").trim();
  let changed = true;
  while (changed && d) {
    changed = false;
    for (const re of DESCRIPTION_PREFIXES) {
      const next = d.replace(re, "");
      if (next !== d) {
        d = next.trim();
        changed = true;
      }
    }
  }
  return d || null;
}

/** Description d'une photo dérivée : un seul préfixe devant la description racine. */
export function derivedPhotoDescription(
  prefix: string,
  sourceDescription: string | null | undefined,
  fallback: string,
): string {
  const root = rootPhotoDescription(sourceDescription);
  return root ? `${prefix} — ${root}` : fallback;
}
