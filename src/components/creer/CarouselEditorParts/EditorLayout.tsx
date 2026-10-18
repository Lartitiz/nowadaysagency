// Chantier W élargi (18/10/2026) : la slide est la vedette, à 1440×900, 1280×720
// et sur téléphone. Avant, sa taille venait d'une réserve fixe de 456 px
// (`(100vh − 456px) × 0,8`, plancher 240 px) : 12 % de l'écran sur ordi, 7 % et
// coupée de 22 px sur un petit portable, coupée de 36 à 60 px sur téléphone.
// Maintenant, la page mesure la place réelle entre le haut de la grille de
// l'éditeur et la barre « Publier » collée en bas, et la slide la prend
// (plafond 540 px de large : la moitié des 1080 px exportés, toujours net).
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export type SlideFit = { width: number; room: number };

// Téléphone : sous la slide, la rangée des vignettes ou les 4 gros boutons
// « Texte · Photo · Couleur · Police » doivent rester visibles à l'arrivée.
const PHONE_RESERVE = 84;
const DESKTOP_GAP = 12;
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
  const width = Math.floor(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, column, room * 0.8)));
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
    ? { className: "mx-auto w-full", style: { maxWidth: fit.width } }
    : { className: "mx-auto w-full max-w-[min(540px,30vh)] md:max-w-[min(540px,max(240px,calc((100vh-456px)*0.8)))]", style: undefined };

/** Grille de l'éditeur : vignettes en colonne à gauche, slide, panneau (ordinateur) ; slide, puis vignettes ou réglages (téléphone). */
export const EDITOR_GRID =
  "flex flex-col gap-3 md:grid md:items-start md:grid-cols-[88px_minmax(0,1fr)_280px] md:gap-5 lg:grid-cols-[96px_minmax(0,1fr)_320px]";

/** Place libre au-dessus et au-dessous de la slide, entre le menu de l'app et la barre « Publier » (barre de l'élément hors de la slide). */
export function outsideRoom(slide: Element | null | undefined): { above: number; below: number } {
  if (!slide) return { above: 0, below: 0 };
  const r = slide.getBoundingClientRect();
  const header = window.document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  const bar = window.document.querySelector('[data-testid="result-actions"]')?.getBoundingClientRect().top ?? window.innerHeight;
  return { above: Math.max(0, r.top - Math.max(0, header)), below: Math.max(0, Math.min(bar, window.innerHeight) - r.bottom) };
}
