// « Savoir sur quoi on clique » (26/11/2026) : à la souris, l'élément sous le pointeur est
// entouré d'un pointillé avec son nom, avant le clic. Rien sur écran tactile (pas de survol) :
// là, le nom s'affiche dans la barre une fois l'élément touché.
import { useEffect, useState, type RefObject } from "react";
import { isLockedEl, kindLabel, pickAt, type CanvasBox } from "@/components/creer/CarouselEditorParts/canvas-geometry";

export type HoverBox = CanvasBox & { id: string; label: string };

export function useHoverBox(frame: RefObject<HTMLIFrameElement>, ready: boolean, off: boolean, selected: string | null): HoverBox | null {
  const [hover, setHover] = useState<HoverBox | null>(null);
  useEffect(() => {
    const iframe = frame.current;
    if (!ready || !iframe) return;
    let doc: Document | null = null;
    const clear = () => setHover(null);
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.buttons) return clear();
      const el = doc ? pickAt(doc, e.target, e.clientX, e.clientY) : null;
      const id = el?.dataset.editorId;
      if (!el || !id || isLockedEl(el)) return clear();
      const r = el.getBoundingClientRect();
      setHover((prev) =>
        prev && prev.id === id && prev.left === r.left && prev.top === r.top && prev.width === r.width && prev.height === r.height
          ? prev
          : { id, label: kindLabel(el), left: r.left, top: r.top, width: r.width, height: r.height },
      );
    };
    const attach = () => {
      doc?.removeEventListener("pointermove", move);
      doc?.documentElement.removeEventListener("pointerleave", clear);
      doc = iframe.contentDocument;
      setHover(null);
      doc?.addEventListener("pointermove", move);
      doc?.documentElement.addEventListener("pointerleave", clear);
    };
    attach();
    iframe.addEventListener("load", attach);
    return () => {
      iframe.removeEventListener("load", attach);
      doc?.removeEventListener("pointermove", move);
      doc?.documentElement.removeEventListener("pointerleave", clear);
    };
  }, [frame, ready]);
  return off || !hover || hover.id === selected ? null : hover;
}
