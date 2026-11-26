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

// Volet téléphone (26/11/2026) : vrai tant qu'un onglet du panneau est ouvert « en volet »
// sur téléphone. La slide passe en petit, collée en haut, et les deux barres du bas
// (actions, menu de l'app) se cachent pour laisser la place aux réglages.
let sheet = false;

/** Vrai tant que le volet de réglages est ouvert sur téléphone. */
export function useCarouselSheet() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => sheet,
    () => false,
  );
}

/** Ouvre ou ferme le volet de réglages (éditeur de carrousel, téléphone). */
export function setCarouselSheet(open: boolean) {
  if (sheet === open) return;
  sheet = open;
  notify();
}

// Chantier X (18/10/2026) : « Modifier le texte » du menu « Plus d'options »
// ouvre la liste du texte de toutes les slides dans l'éditeur affiché.
const textListOpeners = new Set<() => void>();

/** Demande à l'éditeur affiché d'ouvrir « Modifier le texte ». */
export function requestCarouselTextList() {
  textListOpeners.forEach((open) => open());
}

/** À appeler par la fenêtre « Modifier le texte » de l'éditeur. */
export function useCarouselTextListRequest(open: () => void) {
  useEffect(() => {
    textListOpeners.add(open);
    return () => { textListOpeners.delete(open); };
  }, [open]);
}
