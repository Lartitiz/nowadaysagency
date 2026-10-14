// Lot E3-1 (14/10/2026) : outils de calcul sur la slide affichée dans l'aperçu,
// déplacés à l'identique depuis CarouselEditor.tsx.
import { isPassiveShape, type ClipboardElement, type ElementRect } from "@/lib/carousel-editor";

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const numberOr = (value: string | undefined, fallback: number) =>
  Number.isFinite(parseFloat(value || "")) ? parseFloat(value!) : fallback;

export const VEIL = "[data-injected-scrim]";
export const isPhotoEl = (el: HTMLElement) =>
  el.tagName === "IMG" ||
  el.hasAttribute("data-pptx-photo") ||
  el.hasAttribute("data-editor-photo");
/** Photo qui couvre toute la slide : on la recadre, on ne déplace pas son cadre. */
export const isFullBleed = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width >= 1075 && r.height >= 1345;
};
/** Élément choisi sous le pointeur : le plus proche, sinon le premier calque
 * en dessous (la photo est souvent recouverte par le calque de mise en page). */
export function pickAt(doc: Document, target: EventTarget | null, x: number, y: number) {
  let found: HTMLElement | null = null;
  const direct = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-editor-id]");
  if (direct && !direct.matches(VEIL)) found = direct;
  else
    for (const node of doc.elementsFromPoint?.(x, y) || []) {
      const hit = node.closest<HTMLElement>("[data-editor-id]");
      if (hit && !hit.matches(VEIL)) {
        found = hit;
        break;
      }
    }
  if (found && !isPassiveShape(found)) return found;
  // Sur le fond : un élément fin (ligne, filet) tout proche est visé, à
  // 12 px près, comme dans Canva. Le plus petit l'emporte.
  let best: HTMLElement | null = null,
    area = Infinity;
  doc.querySelectorAll<HTMLElement>("[data-editor-id]").forEach((el) => {
    if (el.matches(VEIL) || isPassiveShape(el)) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    if (x < r.left - 12 || x > r.right + 12 || y < r.top - 12 || y > r.bottom + 12) return;
    if (r.width * r.height < area) {
      best = el;
      area = r.width * r.height;
    }
  });
  return best || found;
}
/** Cadre le plus large qui contient l'élément (carte, verre, colonne) : on le
 * déplace avec ses textes, comme un groupe dans Canva. */
export function frameOf(el: HTMLElement): HTMLElement {
  let frame = el;
  for (
    let p = el.parentElement?.closest<HTMLElement>("[data-editor-id]");
    p;
    p = p.parentElement?.closest<HTMLElement>("[data-editor-id]")
  )
    if (p.matches("[data-pptx-shape],[data-editor-shape]") && !isPassiveShape(p)) frame = p;
  return frame;
}
/** La copie floue du verre suit le cadre pendant qu'on le glisse. */
export function followGlass(el: HTMLElement) {
  const blur = el.matches("[data-photo-glass]")
    ? el.querySelector<HTMLElement>("[data-photo-glass-blur]")
    : null;
  if (!blur) return;
  blur.style.left = `${-numberOr(el.style.left, 0)}px`;
  blur.style.top = `${-numberOr(el.style.top, 0)}px`;
  blur.style.removeProperty("bottom");
}
export type Handle = "e" | "w" | "s" | "se";
export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom" | "spread-x" | "spread-y";
export interface CanvasApi {
  align: (mode: AlignMode) => void;
  copy: (ids: string[]) => ClipboardElement[];
  /** Boîtes affichées (repère de la slide), pour grouper / dégrouper sans rien décaler. */
  rects: (ids: string[]) => Record<string, ElementRect>;
  /** Zoom dans la photo (recadrage), sans agrandir son cadre. */
  zoomPhoto: (id: string, zoom: number) => void;
}
/** Élément verrouillé (lui ou le groupe qui le contient). */
export const isLockedEl = (el: HTMLElement) => !!el.closest("[data-editor-locked]");
const SNAP = 8;
/**
 * Repères d'alignement : bords et centre de la slide, bords et centres des
 * autres éléments. Renvoie la correction à appliquer et les lignes à dessiner.
 */
export function snapTo(doc: Document, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const xs = [0, 540, 1080],
    ys = [0, 675, 1350];
  doc.querySelectorAll<HTMLElement>("[data-editor-id]").forEach((o) => {
    if (o === el || o.contains(el) || el.contains(o) || o.matches(VEIL) || isPassiveShape(o)) return;
    const b = o.getBoundingClientRect();
    if (!b.width || !b.height) return;
    xs.push(b.left, b.left + b.width / 2, b.right);
    ys.push(b.top, b.top + b.height / 2, b.bottom);
  });
  const best = (values: number[], targets: number[]) => {
    let out: { delta: number; line: number } | null = null;
    for (const v of values)
      for (const t of targets) {
        const delta = t - v;
        if (Math.abs(delta) <= SNAP && (!out || Math.abs(delta) < Math.abs(out.delta))) out = { delta, line: t };
      }
    return out;
  };
  return {
    x: best([r.left, r.left + r.width / 2, r.right], xs),
    y: best([r.top, r.top + r.height / 2, r.bottom], ys),
  };
}
/** Texte modifiable directement sur la slide (pas une photo ni un cadre). */
export const isInlineText = (el: HTMLElement) =>
  !isPhotoEl(el) && !el.matches(VEIL) && !el.querySelector("[data-editor-id]") && !!el.textContent?.trim() &&
  !el.closest("svg");
export interface CanvasBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Une photo plein écran n'a pas de cadre à mettre en forme. */
export const isFullBleedBox = (b: { width: number; height: number }) => b.width >= 1075 && b.height >= 1345;
