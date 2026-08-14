/**
 * photo-tags — garde déterministe des tags de photo.
 *
 * Audit du 14/08 : une photo « packshot fond blanc » portait les tags
 * « noel, saisonnier, atelier, coulisses, workspace ». Aucun n'était une
 * hallucination : ils venaient de la photo SOURCE et avaient été recopiés tels
 * quels, alors que le détourage venait de remplacer le fond qu'ils décrivaient.
 *
 * Règle, en une phrase : quand les pixels changent, seuls les tags de
 * PROVENANCE survivent — tout ce qui décrit l'image est re-déduit de l'image.
 *
 * Provenance = posé par le code, invisible sur l'image (« ce fichier est un
 * packshot généré »). L'IA ne peut pas le deviner en regardant, donc on le
 * réinjecte. Tout le reste décrit la scène : si c'est encore vrai, l'IA vient
 * de le retrouver ; sinon, ça devait disparaître.
 */

/** Tags posés par le code au moment de générer une photo dérivée. */
export const PROVENANCE_TAGS = new Set([
  "packshot",
  "mise-en-scene",
  "portrait-pro",
  "mockup",
  "avant-après",
  "avant-apres",
]);

export const MAX_PHOTO_TAGS = 6;
const MAX_TAG_LENGTH = 30;

/**
 * Fusionne les tags de provenance déjà posés sur la ligne avec ceux que
 * l'IA vient de lire sur l'image.
 *
 * @param previousTags tags actuellement en base (peuvent décrire l'ANCIENNE image)
 * @param aiTags tags renvoyés par la vision pour l'image ACTUELLE
 */
export function mergePhotoTags(
  previousTags: readonly unknown[] | null | undefined,
  aiTags: readonly unknown[] | null | undefined,
): string[] {
  const clean = (list: readonly unknown[] | null | undefined) =>
    (Array.isArray(list) ? list : [])
      .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
      .filter((t) => t.length > 0 && t.length <= MAX_TAG_LENGTH);

  const provenance = clean(previousTags).filter((t) => PROVENANCE_TAGS.has(t));
  return Array.from(new Set([...provenance, ...clean(aiTags)])).slice(0, MAX_PHOTO_TAGS);
}
