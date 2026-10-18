import { useSyncExternalStore } from "react";

// Texte tapé directement sur la slide (double-clic, « Écrire ») : il est
// enregistré au fil de l'eau, à chaque mot ou après une courte pause, comme le
// champ « Texte » du panneau (chantier T, 18/10/2026). Avant, il ne partait
// qu'au clic ailleurs : un rechargement le perdait alors que l'encadré
// affichait « Tout est enregistré ».

/** Pause de frappe après laquelle le texte est enregistré. */
export const TYPING_PAUSE_MS = 600;

let pending: (() => void) | null = null;
const listeners = new Set<() => void>();
const setPending = (flush: (() => void) | null) => {
  if (pending === flush) return;
  pending = flush;
  listeners.forEach((l) => l());
};

/** Enregistre tout de suite le texte en cours d'écriture, s'il y en a un. */
export function flushTyping() {
  pending?.();
}

/** Vrai tant qu'un texte tapé sur la slide n'est pas encore parti dans le document. */
export function useTypingPending() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending !== null,
    () => false,
  );
}

let bound = false;
function bindWindow() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  // Quitter ou recharger pendant la frappe : le texte part, et le navigateur
  // prévient (« Quitter le site ? ») le temps que la sauvegarde se fasse.
  window.addEventListener("beforeunload", (event) => {
    if (!pending) return;
    flushTyping();
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("pagehide", flushTyping);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushTyping();
  });
}

/**
 * Suit un texte en cours d'écriture : `read` lit sa valeur, `save` l'enregistre.
 * Un espace ou une ponctuation enregistre aussitôt (un mot), sinon une pause.
 */
export function trackTyping(read: () => string, save: (value: string) => void) {
  bindWindow();
  let saved = read();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    if (pending === flush) setPending(null);
  };
  const flush = () => {
    stop();
    const value = read();
    if (value === saved) return;
    saved = value;
    save(value);
  };
  return {
    input(data?: string | null) {
      setPending(flush);
      clearTimeout(timer);
      timer = setTimeout(flush, data && /[\s.,;:!?…]/.test(data) ? 0 : TYPING_PAUSE_MS);
    },
    stop,
    /** Dernière valeur envoyée au document. */
    saved: () => saved,
  };
}

/** Curseur au point cliqué dans le texte, sinon à la fin (jamais tout sélectionné). */
export function caretRange(doc: Document, el: HTMLElement, at?: { x: number; y: number }): Range {
  const finder = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let range: Range | null = null;
  if (at && finder.caretRangeFromPoint) range = finder.caretRangeFromPoint(at.x, at.y);
  else if (at && finder.caretPositionFromPoint) {
    const p = finder.caretPositionFromPoint(at.x, at.y);
    if (p) {
      range = doc.createRange();
      range.setStart(p.offsetNode, p.offset);
    }
  }
  if (!range || !el.contains(range.startContainer)) {
    range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  range.collapse(true);
  return range;
}
