// Glisser une vignette pour changer l'ordre, commun au carrousel et aux stories (27/11/2026).
// Le geste existait dans l'éditeur de carrousel (SlideStrip.tsx + CarouselEditor.tsx) ; les
// stories n'avaient que les flèches. Ici : le geste seul (où lâcher, quand c'est un glissé et
// pas un clic). Ce que « changer l'ordre » veut dire reste à chaque éditeur (`reorder`).
// Test : src/test/thumb-reorder.test.tsx.
import { useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";

export type ThumbDragState = { from: number; x: number; y: number; moved: boolean } | null;

/** En dessous de 6 px, le geste est un clic, pas un glissé. */
const DRAG_THRESHOLD = 6;

/**
 * Position d'insertion sous le pointeur, parmi les vignettes `selector` : avant la vignette
 * dont on passe la moitié, sinon à la fin.
 * - "row" : vignettes en rangées (on regarde d'abord la rangée, puis la moitié en largeur) ;
 * - "column" : vignettes en colonne (la moitié en hauteur) ;
 * - "auto" : colonne si la deuxième vignette est sous la première, rangée sinon.
 */
export function thumbIndexAt(selector: string, x: number, y: number, axis: "row" | "column" | "auto" = "row"): number {
  const rects = Array.from(window.document.querySelectorAll<HTMLElement>(selector)).map((t) => t.getBoundingClientRect());
  const column = axis === "column" || (axis === "auto" && rects.length > 1 && rects[1].top >= rects[0].bottom - 1);
  let index = rects.length;
  for (let k = 0; k < rects.length; k++) {
    const r = rects[k];
    if (column ? y < r.top + r.height / 2 : y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) {
      index = k;
      break;
    }
  }
  return index;
}

/** Ce dont le geste a besoin : où il en est, comment dire ce qui bouge, et comment changer l'ordre. */
export interface ThumbReorder {
  thumbDrag: MutableRefObject<ThumbDragState>;
  /** Vrai juste après un glissé : le clic qui suit ne doit pas ouvrir la vignette. */
  justDragged: MutableRefObject<boolean>;
  setDragSlide: (index: number | null) => void;
  setDropAt: (index: number | null) => void;
  thumbIndexAt: (x: number, y: number) => number;
  /** Nombre de vignettes au moment du geste. */
  count: () => number;
  /** `to` = la place d'arrivée dans la liste une fois la vignette retirée. */
  reorder: (from: number, to: number) => void;
}

/** Les quatre réactions à poser sur la vignette `i`. */
export function thumbDragHandlers(r: ThumbReorder, i: number) {
  const stop = () => {
    r.thumbDrag.current = null;
    r.setDragSlide(null);
    r.setDropAt(null);
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      r.thumbDrag.current = { from: i, x: e.clientX, y: e.clientY, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const d = r.thumbDrag.current;
      if (!d || (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD)) return;
      d.moved = true;
      r.setDragSlide(d.from);
      r.setDropAt(Math.min(r.thumbIndexAt(e.clientX, e.clientY), r.count() - 1));
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const d = r.thumbDrag.current;
      stop();
      if (d?.moved) {
        r.justDragged.current = true;
        // Le clic qui termine le glissé arrive juste après ce relâché, et remet le repère à zéro.
        // Mais il n'arrive pas toujours : quand la vignette glissée change de place dans la page
        // (carrousel, glissé vers la fin), le navigateur ne l'envoie pas, et le clic SUIVANT était
        // avalé (il fallait cliquer deux fois, vu en ligne le 27/11/2026). On le remet donc à zéro
        // nous-mêmes, juste après le tour où ce clic aurait dû passer.
        setTimeout(() => { r.justDragged.current = false; }, 0);
        const at = r.thumbIndexAt(e.clientX, e.clientY);
        r.reorder(d.from, at > d.from ? at - 1 : at);
      }
    },
    onPointerCancel: stop,
  };
}

/** Le clic d'une vignette : ignoré s'il termine un glissé, sinon il l'ouvre. */
export function thumbClick(r: Pick<ThumbReorder, "justDragged">, open: () => void) {
  return () => {
    if (r.justDragged.current) {
      r.justDragged.current = false;
      return;
    }
    open();
  };
}

/** Le geste avec son propre état, pour un éditeur qui ne le tenait pas encore (stories). */
export function useThumbReorder({ selector, axis = "auto", count, reorder }: {
  selector: string;
  axis?: "row" | "column" | "auto";
  count: number;
  reorder: (from: number, to: number) => void;
}) {
  const thumbDrag = useRef<ThumbDragState>(null);
  const justDragged = useRef(false);
  const [dragSlide, setDragSlide] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const latest = useRef({ count, reorder });
  latest.current = { count, reorder };
  const api: ThumbReorder = {
    thumbDrag, justDragged, setDragSlide, setDropAt,
    thumbIndexAt: (x, y) => thumbIndexAt(selector, x, y, axis),
    count: () => latest.current.count,
    reorder: (from, to) => latest.current.reorder(from, Math.min(to, latest.current.count - 1)),
  };
  return { api, dragSlide, dropAt };
}
