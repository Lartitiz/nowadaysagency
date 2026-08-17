/**
 * Reset de l'état post-génération partagé entre `useDoGenerate` (nouvelle
 * génération) et `useUserSlidesGenerate` (flux « Mes slides »). Si un state
 * post-génération s'ajoute un jour, il se reset ici pour les deux flux —
 * les setters propres à un seul flux (Pinterest…) restent chez l'appelant.
 */
export function resetPostGenerationState({
  setSavedId,
  setVisualSlides,
  setCarouselColors,
}: {
  setSavedId: (id: string | null) => void;
  setVisualSlides: (slides: any) => void;
  setCarouselColors: (colors: any) => void;
}) {
  setSavedId(null);
  setVisualSlides([]);
  setCarouselColors(null);
}
