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
// `overwrite` = la personne a explicitement dit « oui, remplace ma marque »
// (écran de reprise d'onboarding, espace nommé). Sans cette porte, valider une
// fiche relue ne changeait RIEN dès que l'ancienne valeur était non vide : le
// clic « Valider » repartait dans le vide et l'ancienne identité survivait.
// La protection reste entière pour tous les remplissages AUTOMATIQUES.
export function fillOnlyEmpty(
  fields: Record<string, unknown>,
  existing: Record<string, unknown> | null | undefined,
  overwrite = false,
): Record<string, unknown> {
  if (overwrite) return { ...fields };
  if (!existing) return { ...fields };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (isEmptyVal(existing[k])) out[k] = v;
  }
  return out;
}
