// Le Studio tient dans l'écran : la grille (ordinateur) ou la conversation
// (téléphone) prend la hauteur qui reste sous l'en-tête et les bandeaux, pour
// que « Envoyer » / « Créer la scène » se voie sans défiler en 1440×900 comme
// en 390×844. Avant, une hauteur fixe (100dvh - 110px) ignorait l'en-tête du
// Studio : le bouton finissait à 912 px sur un écran de 900.
import { useLayoutEffect, type RefObject } from "react";

function measure(grid: HTMLElement | null) {
  if (!grid) return;
  const value = `${Math.max(0, Math.round(grid.getBoundingClientRect().top + window.scrollY))}px`;
  if (grid.style.getPropertyValue("--studio-top") !== value) grid.style.setProperty("--studio-top", value);
}

export function useStudioFit(gridRef: RefObject<HTMLElement>) {
  // À chaque rendu : un bandeau (erreur, session archivée, retour carrousel)
  // peut apparaître au-dessus de la grille.
  useLayoutEffect(() => measure(gridRef.current));
  useLayoutEffect(() => {
    const update = () => measure(gridRef.current);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [gridRef]);
}
