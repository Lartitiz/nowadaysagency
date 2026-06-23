// Normalise le photo_index de chaque slide d'un carrousel photo/mix avant export/rendu.
//
// Pourquoi : l'IA (carousel-ai) décide seule du photo_index, sans filet. Quand elle
// l'omet, le met hors plage, ou le met à 1 partout, l'export retombe sur une seule
// photo répétée sur tous les slides. Ce helper rétablit une répartition déterministe.
//
// Règle :
//  - respecte une assignation IA valide ET variée (ne touche à rien) ;
//  - sinon (photo_index invalide, ou "dégénéré" = toutes les slides-photo sur une seule
//    photo alors qu'il y en a plusieurs) → réassigne séquentiellement, en clampant à la
//    dernière photo s'il y a moins de photos que de slides-photo.
//
// Fonction pure : ne mute pas l'entrée, renvoie de nouveaux objets.

export function resolvePhotoIndexes<T extends Record<string, any>>(
  slides: T[],
  totalPhotos: number,
): T[] {
  if (!Array.isArray(slides) || totalPhotos <= 0) return slides;

  const isPhotoSlide = (s: T) =>
    s?.slide_type === "photo_full" || s?.slide_type === "photo_integrated";

  const photoSlides = slides.filter(isPhotoSlide);
  if (photoSlides.length === 0) return slides;

  const allValid = photoSlides.every(
    (s) =>
      Number.isInteger(s.photo_index) &&
      (s.photo_index as number) >= 1 &&
      (s.photo_index as number) <= totalPhotos,
  );

  // Dégénéré : plusieurs photos disponibles + plusieurs slides-photo, mais toutes
  // pointent la même photo (ex. l'IA a mis photo_index = 1 partout).
  const distinct = new Set(photoSlides.map((s) => s.photo_index));
  const degenerate =
    totalPhotos > 1 && photoSlides.length > 1 && distinct.size === 1;

  if (allValid && !degenerate) return slides;

  let cursor = 0;
  return slides.map((s) => {
    if (!isPhotoSlide(s)) return s;
    const idx = Math.min(cursor + 1, totalPhotos); // 1-based, clampé à la dernière photo
    cursor++;
    return { ...s, photo_index: idx };
  });
}
