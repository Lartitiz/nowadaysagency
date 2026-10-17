// Fil d'Ariane du haut (« Accueil › Créer ») masqué pendant que l'éditeur de
// carrousel est affiché : la place va à la slide, qui tient alors en entier
// au-dessus de la barre « Publier » (plan simplicité, choix de Laetitia du 17/10/2026).
// L'accueil reste à un clic (logo, bouton « Créer » du haut).
import { useEffect, useSyncExternalStore } from "react";

let hiders = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Vrai tant qu'un écran a demandé de masquer le fil d'Ariane. */
export function useAppBreadcrumbHidden() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => hiders > 0,
    () => false,
  );
}

/** Masque le fil d'Ariane tant que le composant qui l'appelle est affiché. */
export function useHideAppBreadcrumb() {
  useEffect(() => {
    hiders += 1;
    notify();
    return () => { hiders -= 1; notify(); };
  }, []);
}
