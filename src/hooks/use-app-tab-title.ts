import { useEffect } from "react";

/** Titre d'onglet une fois connectée : le nom de l'outil, sans la phrase d'accroche. */
export const APP_TAB_TITLE = "L'Assistant Com' | Nowadays";

/**
 * Le titre de `index.html` (« Communication éthique pour créatrices ») sert au
 * référencement des pages publiques : on n'y touche pas. Dans l'outil, il
 * restait affiché sur l'onglet de tout le monde, y compris d'un compte du
 * parcours immobilier (répétition du 25/11/2026). Ici on le remplace le temps
 * d'une page connectée, puis on le rend en sortant.
 */
export function useAppTabTitle(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.title;
    document.title = APP_TAB_TITLE;
    return () => { document.title = previous; };
  }, [active]);
}
