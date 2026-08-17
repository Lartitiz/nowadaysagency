// Sélecteur pur extrait de CreerUnifie.tsx (aucun état React -> testable).

/**
 * Retourne `primary` si non vide, sinon `fallback`.
 * Sert de repli quand le state UI (ex: uploadedPhotos) a pu être reset
 * (changement d'onglet, re-render) alors qu'un snapshot pris au moment
 * de la génération (ex: generatedWithPhotos) tient encore les photos.
 */
export function pickNonEmpty<T>(primary: T[], fallback: T[]): T[] {
  return primary.length > 0 ? primary : fallback;
}
