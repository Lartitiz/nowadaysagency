// Chantier W élargi (18/10/2026) : la slide est la vedette, à 1440×900, 1280×720
// et sur téléphone. Avant, sa taille venait d'une réserve fixe de 456 px
// (`(100vh − 456px) × 0,8`, plancher 240 px) : 12 % de l'écran sur ordi, 7 % et
// coupée de 22 px sur un petit portable, coupée de 36 à 60 px sur téléphone.
// Maintenant, la page mesure la place réelle entre le haut de la grille de
// l'éditeur et la barre « Publier » collée en bas, et la slide la prend
// (plafond 540 px de large : la moitié des 1080 px exportés, toujours net).
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
// Flèches ‹ › sur les bords de la slide (19/11/2026), posées dans la boîte ci-dessous (relative).
export { SlideEdgeArrows } from "./SlideEdgeArrows";

export type SlideFit = { width: number; room: number };

// Éditeur facile (20/11/2026) : sous la slide, les points et le début de « Textes de
// cette slide » (téléphone) ou la rangée de toutes les vignettes (ordinateur) restent
// visibles à l'arrivée ; de chaque côté de la slide, la place d'une grosse flèche.
const PHONE_RESERVE = 84;
const DESKTOP_GAP = 12;
const STRIP_RESERVE = 96;
// Petit portable (moins de 800 px de haut) : l'aide sous les vignettes est cachée (SlideStrip.tsx), la slide reprend sa place.
const STRIP_RESERVE_SHORT = 78;
const ARROWS_RESERVE = 136;
const MAX_WIDTH = 540;
const MIN_WIDTH = 200;

/** Place libre (en px) pour la slide, mesurée sur la page telle qu'elle est en haut de défilement. */
export function measureSlideFit(grid: HTMLElement): SlideFit {
  const phone = !window.matchMedia?.("(min-width: 768px)").matches;
  const top = grid.getBoundingClientRect().top + window.scrollY;
  // La barre d'actions est collée en bas (au-dessus du menu du bas sur téléphone).
  const bar = window.document.querySelector<HTMLElement>('[data-testid="result-actions"]');
  let bottom = window.innerHeight;
  if (bar) bottom -= (parseFloat(getComputedStyle(bar).bottom) || 0) + bar.getBoundingClientRect().height;
  const room = Math.max(0, Math.round(bottom - top - (phone ? PHONE_RESERVE : DESKTOP_GAP)));
  const column = grid.querySelector<HTMLElement>("[data-canvas-sticky]")?.clientWidth || grid.clientWidth || MAX_WIDTH;
  // Mode « Plus d'outils » : les boutons de la slide sont sous les vignettes, la slide leur laisse leur hauteur.
  const tools = grid.querySelector<HTMLElement>('[data-canvas-sticky] [data-testid="slide-order-tools"]')?.offsetHeight ?? 0;
  const under = phone ? 0 : (window.innerHeight < 800 ? STRIP_RESERVE_SHORT : STRIP_RESERVE) + (tools ? tools + 4 : 0);
  const free = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, column - (phone ? 0 : ARROWS_RESERVE), (room - under) * 0.8));
  // Ordinateur : largeur par paliers de 16 px (…, 424, 440, 456, …). Quelques pixels de place en plus ou
  // en moins (hauteur du menu, d'une ligne de texte) ne changent plus la taille de la slide : les photos
  // de référence de la visite du matin restent comparables. Paliers calés pour que l'écran de référence
  // (1440 × 900 : 445 à 449 px de place mesurés le 20/11/2026, en local et en ligne) tombe au milieu de
  // son palier, pas au bord (un palier à 448 px donnait 440 en local et 448 en ligne).
  const fitted = phone ? Math.floor(free) : Math.floor((free - 8) / 16) * 16 + 8;
  // Slide centrée au pixel près : une marge d'un demi-pixel de chaque côté rendait l'image floue d'un passage à l'autre.
  const width = fitted - ((column - fitted) % 2 ? 1 : 0);
  return { width, room };
}

/** Recalcule la taille de la slide quand la fenêtre, la grille ou la barre du bas changent. */
export function useSlideFit(grid: RefObject<HTMLElement>): SlideFit | null {
  const [fit, setFit] = useState<SlideFit | null>(null);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      const next = measureSlideFit(el);
      setFit((f) => (f && f.width === next.width && f.room === next.room ? f : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(el);
    observer?.observe(window.document.body);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [grid]);
  return fit;
}

/** Variable CSS lue par la colonne des vignettes et le panneau (même hauteur que la slide). */
export const roomStyle = (fit: SlideFit | null): CSSProperties | undefined =>
  fit ? ({ "--editor-room": `${Math.max(fit.room, Math.round(fit.width * 1.25))}px` } as CSSProperties) : undefined;

/** Cadre de la slide : la largeur mesurée, sinon l'ancienne règle (avant la première mesure). */
export const slideBoxProps = (fit: SlideFit | null) =>
  fit
    ? { className: "relative mx-auto w-full", style: { maxWidth: fit.width } }
    : { className: "relative mx-auto w-full max-w-[min(540px,30vh)] md:max-w-[min(540px,max(240px,calc((100vh-456px)*0.8)))]", style: undefined };

/** Grille de l'éditeur : la slide et ses vignettes dessous, le panneau à droite (ordinateur) ; slide, points, puis panneau (téléphone). */
export const EDITOR_GRID =
  "flex flex-col gap-3 md:grid md:items-start md:grid-cols-[minmax(0,1fr)_300px] md:gap-5 lg:grid-cols-[minmax(0,1fr)_384px]";

/** Place libre au-dessus et au-dessous de la slide, entre le menu de l'app et la barre « Publier » (barre de l'élément hors de la slide). */
export function outsideRoom(slide: Element | null | undefined): { above: number; below: number } {
  if (!slide) return { above: 0, below: 0 };
  const r = slide.getBoundingClientRect();
  // La barre d'outils de l'éditeur est collée sous le menu : la place au-dessus commence sous elle.
  const header = Math.max(window.document.querySelector("header")?.getBoundingClientRect().bottom ?? 0, window.document.querySelector("[data-editor-toolbar]")?.getBoundingClientRect().bottom ?? 0);
  const bar = window.document.querySelector('[data-testid="result-actions"]')?.getBoundingClientRect().top ?? window.innerHeight;
  return { above: Math.max(0, r.top - Math.max(0, header)), below: Math.max(0, Math.min(bar, window.innerHeight) - r.bottom) };
}
