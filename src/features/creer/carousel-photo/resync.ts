// Resynchronisation de l'écran « carrousel photo » (CarouselPhotoResult) quand
// /creer lui passe un nouveau `result`.
//
// La signature couvre TOUT le contenu des slides (textes compris) et la légende,
// comme CarouselResult (`JSON.stringify([rawSlides, rawCaption])`, test A3) :
// un nouveau résultat qui ne change que les textes est bien affiché (test A3 bis).
//
// Boucle /creer ↔ écran : chaque retouche remonte par onSlidesUpdate, puis /creer
// renvoie les MÊMES slides (même tableau) dans `result`. Cet écho ne doit rien
// réinitialiser : un changement des slides ne compte que s'il ne vient pas de
// l'écran lui-même. La légende garde sa règle d'avant (tout changement resynchronise).

export interface PhotoResultSignature {
  slides: string;
  caption: string;
}

export function photoResultSignature(slides: unknown, caption: unknown): PhotoResultSignature {
  return { slides: JSON.stringify(slides || []), caption: JSON.stringify(caption || {}) };
}

export function needsPhotoResultResync(
  prev: PhotoResultSignature,
  next: PhotoResultSignature,
  slidesAreLocalEcho: boolean,
): boolean {
  if (next.caption !== prev.caption) return true;
  return next.slides !== prev.slides && !slidesAreLocalEcho;
}
