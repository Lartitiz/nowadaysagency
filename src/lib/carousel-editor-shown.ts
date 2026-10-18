// Chantier W élargi (18/10/2026) : vrai tant que l'éditeur de carrousel est à
// l'écran. Les étapes de /creer se replient en une ligne fine et la barre
// d'actions du bas passe sur une ligne, pour laisser la place à la slide.
// Les autres formats (post, reel, stories, newsletter) ne changent pas.
import { useEffect, useSyncExternalStore } from "react";

let shown = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Vrai tant qu'un éditeur de carrousel est affiché. */
export function useCarouselEditorShown() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => shown > 0,
    () => false,
  );
}

/** À appeler par l'éditeur : signale sa présence tant qu'il est affiché. */
export function useMarkCarouselEditorShown() {
  useEffect(() => {
    shown += 1;
    notify();
    return () => { shown -= 1; notify(); };
  }, []);
}
