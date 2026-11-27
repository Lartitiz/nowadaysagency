// Volet de réglages du téléphone, commun à l'éditeur de carrousel et à celui des stories
// (27/11/2026 ; né le 26/11 dans l'éditeur de carrousel, EditorLayout.tsx).
// Sur téléphone, ouvrir un onglet du panneau (ou toucher une case) met la slide ou la story
// en petit en haut de l'écran ; les réglages défilent dessous dans leur propre zone ; les deux
// barres du bas (actions, menu de l'app) se cachent ; « Terminé » rend sa taille à l'aperçu.
// L'état est partagé (src/lib/carousel-editor-shown.ts) : ResultActions.tsx et AppSidebar.tsx
// le lisent pour cacher leurs barres, quel que soit l'éditeur affiché.
import { useEffect, type RefObject } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { setCarouselSheet, useCarouselSheet } from "@/lib/carousel-editor-shown";

export interface PhoneSheet { open: boolean; phone: boolean; set: (open: boolean) => void }

/** Carrousel : la grille prend la hauteur de l'écran sous la ligne d'outils de l'éditeur (2,75 rem). */
export const SHEET_GRID = " max-md:h-[calc(100dvh-var(--app-header-h,49px)-2.75rem)] max-md:scroll-mt-[calc(var(--app-header-h,49px)+2.75rem)] max-md:gap-2 max-md:overflow-hidden";

/** Stories : pas de ligne d'outils collée, la grille prend la hauteur de l'écran sous le menu de l'app. */
export const STORY_SHEET_GRID = " max-md:flex max-md:flex-col max-md:h-[calc(100dvh-var(--app-header-h,49px)-0.75rem)] max-md:scroll-mt-[calc(var(--app-header-h,49px)+0.5rem)] max-md:gap-2 max-md:overflow-hidden";

/** Cadre du panneau quand le volet est ouvert : il prend la place qui reste sous l'aperçu. */
export const SHEET_PANEL = "max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col";
/** Zone des réglages quand le volet est ouvert : elle défile seule. */
export const SHEET_SCROLL = "max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:pb-6";

/** Volet de réglages du téléphone : ouvert ou non, et de quoi l'ouvrir ou le fermer. Toujours fermé sur ordinateur. */
export function usePhoneSheet(grid: RefObject<HTMLElement>, off = false): PhoneSheet {
  const phone = useIsMobile();
  const open = useCarouselSheet() && phone && !off;
  useEffect(() => () => setCarouselSheet(false), []);
  useEffect(() => {
    if (open) grid.current?.scrollIntoView?.({ block: "start" });
    // Les barres du bas se cachent ou reviennent : l'aperçu se remesure.
    window.dispatchEvent(new Event("resize"));
  }, [open, grid]);
  return { open, phone, set: setCarouselSheet };
}

/** Téléphone : toucher une case des réglages ouvre le volet (l'aperçu reste visible au-dessus du clavier). */
export function openSheetOnFieldFocus(sheet: PhoneSheet | undefined, target: EventTarget | null) {
  const field = target as HTMLElement | null;
  if (!sheet?.phone || sheet.open || !field?.matches?.("input, textarea, select")) return;
  sheet.set(true);
  window.setTimeout(() => field.scrollIntoView?.({ block: "nearest" }), 80);
}
