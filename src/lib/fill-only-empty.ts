// Helpers de fusion non-destructive pour l'auto-remplissage du branding.
// L'analyse du site doit COMPLÉTER les champs vides sans jamais écraser ce que
// l'utilisatrice a déjà rempli elle-même.

// Une valeur est « vide » si null/undefined, chaîne blanche, ou tableau vide.
export function isEmptyVal(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// Ne garde que les champs dont la valeur EXISTANTE est vide.
// (Avant : une simple description auto-générée verrouillait la section persona
//  et la cliente idéale fraîchement analysée était silencieusement jetée.)
export function fillOnlyEmpty(
  fields: Record<string, unknown>,
  existing: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!existing) return { ...fields };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (isEmptyVal(existing[k])) out[k] = v;
  }
  return out;
}
