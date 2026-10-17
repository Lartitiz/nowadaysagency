import { useEffect, useRef } from "react";

/** Alerte « il faut au moins une photo » des carrousels photo : ses photos d'abord (choix de Laetitia du 17/10/2026), puis banque d'images ou mode Texte. */
export default function CarouselPhotoWarning({ libraryCount, onLibrary, onStock, onText }: { libraryCount: number; onLibrary: () => void; onStock: () => void; onText: () => void }) {
  const link = "text-sm font-medium text-primary hover:underline text-left";
  // L'alerte naît sous la zone photos, hors de l'écran (mesuré le 17/10/2026 : 913 px pour
  // un écran de 900 sur ordi, 1061 pour 844 sur téléphone) : on l'amène au milieu, au-dessus de la barre « Suivant ».
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView?.({ block: "center", behavior: doux ? "smooth" : "auto" });
  }, []);
  return (
    <div ref={ref} className="mt-3 p-3 rounded-lg bg-warning-bg border border-warning/30 space-y-2 animate-fade-in" data-testid="carousel-photo-warning">
      <p className="text-sm text-warning">
        📸 Pour ce mode, il faut au moins une photo.{libraryCount > 0 ? "" : " Pas de photos sous la main ?"}
      </p>
      <div className="flex flex-col gap-1.5">
        {libraryCount > 0 && <button type="button" onClick={onLibrary} className={link}>→ Choisir dans mes photos ({libraryCount})</button>}
        <button type="button" onClick={onStock} className={link}>→ Trouver des photos libres de droit</button>
        <button type="button" onClick={onText} className={link}>→ Passer en mode Texte (tu pourras toujours ajouter tes photos plus tard)</button>
      </div>
    </div>
  );
}
