// Cadre de sélection (lasso) de l'éditeur de carrousel.
//
// Dans la slide, le lasso part du vide, du fond ou d'un appui long
// (canvas-events.ts). Loom du 28/11/2026 : Laetitia a glissé depuis la zone
// grise AUTOUR de la slide, comme dans Canva ; le navigateur a surligné en bleu
// le texte de la page (onglets, vignettes) et rien n'a été choisi. Ce fichier
// ajoute le lasso qui part d'autour de la slide et bloque ce surlignage.

import { useEffect, useRef, useState, type RefObject } from "react";
import { isPassiveShape } from "@/lib/carousel-editor";
import { VEIL, isFullBleed, isLockedEl, isPhotoEl } from "@/components/creer/CarouselEditorParts/canvas-geometry";

/** Éléments de la slide touchés par le rectangle (coordonnées du document de la slide, 1080 × 1350). */
export function lassoHits(doc: Document, x1: number, y1: number, x2: number, y2: number): string[] {
  const left = Math.min(x1, x2), right = Math.max(x1, x2), top = Math.min(y1, y2), bottom = Math.max(y1, y2);
  const ok = (el: HTMLElement) =>
    !el.matches(VEIL) && !isPassiveShape(el) && !isLockedEl(el) && !(isPhotoEl(el) && isFullBleed(el));
  return Array.from(doc.querySelectorAll<HTMLElement>("[data-editor-id]"))
    .filter((el) => {
      if (!ok(el)) return false;
      // Un élément rangé dans un cadre choisissable vient avec son cadre.
      for (let p = el.parentElement?.closest<HTMLElement>("[data-editor-id]"); p; p = p.parentElement?.closest<HTMLElement>("[data-editor-id]"))
        if (ok(p)) return false;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return false;
      return r.left < right && r.right > left && r.top < bottom && r.bottom > top;
    })
    .map((el) => el.dataset.editorId!);
}

/** Ce qu'on peut cliquer normalement : là, le glissé ne lance pas de lasso. */
const INTERACTIVE = "button,a,input,textarea,select,label,[role=button],[role=slider],[role=tab],[role=menuitem],[contenteditable=true],[draggable=true]";

export type PageRect = { left: number; top: number; width: number; height: number };

/** Départ du glissé accepté pour un lasso « d'autour de la slide » ? */
export function startsOuterLasso(
  e: Pick<PointerEvent, "button" | "pointerType" | "target">,
  slideArea: Element | null,
): boolean {
  if (e.button !== 0 || e.pointerType === "touch") return false; // au doigt, glisser fait défiler
  const target = e.target as Element | null;
  if (!target || typeof target.closest !== "function") return false;
  if (slideArea?.contains(target)) return false; // la slide gère son propre lasso
  return !target.closest(INTERACTIVE);
}

/**
 * Lasso qui part de la zone autour de la slide (colonne de l'aperçu).
 * Renvoie le rectangle à dessiner, en coordonnées de la page.
 */
export function useOuterLasso({
  slideArea,
  frame,
  scale,
  locked,
  onSelectMany,
}: {
  /** Bloc de la slide (aperçu + barre de l'élément) : on n'y démarre pas. */
  slideArea: RefObject<HTMLElement | null>;
  frame: RefObject<HTMLIFrameElement | null>;
  scale: number;
  locked: boolean;
  onSelectMany?: (ids: string[], add: boolean) => void;
}): PageRect | null {
  const [rect, setRect] = useState<PageRect | null>(null);
  // Relu au lâcher : un nouveau rendu de l'éditeur ne coupe pas un glissé en cours.
  const select = useRef(onSelectMany);
  select.current = onSelectMany;
  const enabled = !locked && !!onSelectMany;
  useEffect(() => {
    const zone = slideArea.current?.closest<HTMLElement>("[data-canvas-sticky]");
    if (!zone || !enabled) return;
    let start: { x: number; y: number; shift: boolean; moved: boolean } | null = null;
    const move = (e: PointerEvent) => {
      if (!start) return;
      if (!start.moved && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 5) return;
      start.moved = true;
      setRect({ left: Math.min(start.x, e.clientX), top: Math.min(start.y, e.clientY), width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y) });
    };
    const up = (e: PointerEvent) => {
      const s = start;
      start = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setRect(null);
      const doc = frame.current?.contentDocument;
      const box = frame.current?.getBoundingClientRect();
      if (!s?.moved || !doc || !box || !scale) return;
      const toSlide = (x: number, y: number) => [(x - box.left) / scale, (y - box.top) / scale] as const;
      const [x1, y1] = toSlide(s.x, s.y);
      const [x2, y2] = toSlide(e.clientX, e.clientY);
      select.current?.(lassoHits(doc, x1, y1, x2, y2), s.shift);
    };
    const down = (e: PointerEvent) => {
      if (!startsOuterLasso(e, slideArea.current)) return;
      e.preventDefault(); // pas de surlignage bleu du texte de la page
      // Sans capture, la slide (iframe) avale le glissé quand on passe dessus.
      zone.setPointerCapture?.(e.pointerId);
      start = { x: e.clientX, y: e.clientY, shift: e.shiftKey, moved: false };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
    zone.addEventListener("pointerdown", down);
    return () => {
      zone.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [slideArea, frame, scale, enabled]);
  return rect;
}
