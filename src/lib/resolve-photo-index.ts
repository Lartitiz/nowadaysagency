// Preserve every valid photo/text association, including intentional repetitions.
// Only missing or out-of-range indexes receive a deterministic fallback.
export function resolvePhotoIndexes<T extends Record<string, any>>(
  slides: T[], totalPhotos: number,
): T[] {
  if (!Array.isArray(slides) || totalPhotos <= 0) return slides;
  let cursor = 0;
  return slides.map(s => {
    if (s?.slide_type !== "photo_full" && s?.slide_type !== "photo_integrated") return s;
    const fallback = Math.min(++cursor, totalPhotos);
    return Number.isInteger(s.photo_index) && s.photo_index >= 1 && s.photo_index <= totalPhotos
      ? s : { ...s, photo_index: fallback };
  });
}
