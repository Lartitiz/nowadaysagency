// Glisser une vignette pour changer l'ordre, commun au carrousel et aux stories (27/11/2026).
// Le geste existait dans l'éditeur de carrousel (SlideStrip.tsx + CarouselEditor.tsx) ; les
// stories n'avaient que les flèches. Ici : le geste seul (où lâcher, quand c'est un glissé et
// pas un clic). Ce que « changer l'ordre » veut dire reste à chaque éditeur (`reorder`).
// Test : src/test/thumb-reorder.test.tsx.
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";

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

/** Bandes du haut et du bas de l'écran où la page défile pendant un glissé (en-tête et barre du bas comprises). */
const EDGE_TOP = 120;
const EDGE_BOTTOM = 130;
const EDGE_MAX_SPEED = 16;

/**
 * De combien de pixels faire défiler la page à cette image, pour un pointeur à la hauteur `y` :
 * négatif près du haut, positif près du bas, 0 ailleurs. Plus on est près du bord, plus ça va vite.
 */
export function edgeScrollSpeed(y: number, viewportHeight: number, ends?: { top: number; bottom: number } | null): number {
  // `ends` = le haut de la première vignette et le bas de la dernière. Une fois la vignette du
  // bout entièrement sortie de la bande, il n'y a plus rien à aller chercher : on s'arrête là
  // (sans ça, la page descendait jusqu'à sa toute fin, vu en ligne le 27/11/2026).
  if (ends && y < EDGE_TOP && ends.top >= EDGE_TOP) return 0;
  if (ends && viewportHeight - y < EDGE_BOTTOM && ends.bottom <= viewportHeight - EDGE_BOTTOM) return 0;
  if (y < EDGE_TOP) return -Math.ceil((Math.min(EDGE_TOP - y, EDGE_TOP) / EDGE_TOP) * EDGE_MAX_SPEED);
  const fromBottom = viewportHeight - y;
  if (fromBottom < EDGE_BOTTOM) return Math.ceil((Math.min(EDGE_BOTTOM - fromBottom, EDGE_BOTTOM) / EDGE_BOTTOM) * EDGE_MAX_SPEED);
  return 0;
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
  /**
   * Présent = la page défile toute seule quand on glisse près du haut ou du bas de l'écran
   * (colonne de vignettes plus haute que l'écran : les stories). Absent = pas de défilement
   * (la rangée du carrousel tient à l'écran).
   */
  edgeScroll?: MutableRefObject<{ raf: number; x: number; y: number }>;
  /** Haut de la première vignette et bas de la dernière, à l'écran : le défilement s'arrête quand le bout est visible. */
  thumbEnds?: () => { top: number; bottom: number } | null;
}

/** Les quatre réactions à poser sur la vignette `i`. */
export function thumbDragHandlers(r: ThumbReorder, i: number) {
  const stop = () => {
    if (r.edgeScroll) {
      cancelAnimationFrame(r.edgeScroll.current.raf);
      r.edgeScroll.current.raf = 0;
    }
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
      const edge = r.edgeScroll?.current;
      if (edge) {
        edge.x = e.clientX;
        edge.y = e.clientY;
        if (!edge.raf) {
          // Une boucle par glissé : tant que le pointeur reste dans une bande, la page défile
          // et la place d'arrivée suit (le pointeur ne bouge pas, ce sont les vignettes qui passent).
          const tick = () => {
            if (!r.thumbDrag.current) { edge.raf = 0; return; }
            const speed = edgeScrollSpeed(edge.y, window.innerHeight, r.thumbEnds?.());
            if (speed) {
              window.scrollBy(0, speed);
              r.setDropAt(Math.min(r.thumbIndexAt(edge.x, edge.y), r.count() - 1));
            }
            edge.raf = requestAnimationFrame(tick);
          };
          edge.raf = requestAnimationFrame(tick);
        }
      }
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
export function useThumbReorder({ selector, axis = "auto", count, reorder, scrollAtEdges = false }: {
  selector: string;
  axis?: "row" | "column" | "auto";
  count: number;
  reorder: (from: number, to: number) => void;
  /** La page défile quand on glisse près du haut ou du bas de l'écran. */
  scrollAtEdges?: boolean;
}) {
  const edgeScroll = useRef({ raf: 0, x: 0, y: 0 });
  // L'écran se ferme en plein glissé : le défilement s'arrête avec lui.
  useEffect(() => () => { cancelAnimationFrame(edgeScroll.current.raf); edgeScroll.current.raf = 0; }, []);
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
    edgeScroll: scrollAtEdges ? edgeScroll : undefined,
    thumbEnds: () => {
      const thumbs = window.document.querySelectorAll<HTMLElement>(selector);
      if (!thumbs.length) return null;
      return { top: thumbs[0].getBoundingClientRect().top, bottom: thumbs[thumbs.length - 1].getBoundingClientRect().bottom };
    },
  };
  return { api, dragSlide, dropAt };
}
