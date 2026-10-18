// Chantier AB (18/10/2026) : icônes ajoutées sur une slide, en mode simple.
// Une icône est un dessin (`data-editor-shape="dessin"`) : un bloc qui porte un SVG
// à 100 %. Elle se déplace, s'agrandit et se retire comme un élément, et part dans
// l'image de la slide à l'export (PNG et fond du PowerPoint). Le bloc est
// nécessaire : un <svg> posé lui-même en absolu n'est pas dessiné par html2canvas
// dans l'iframe d'export (vérifié le 18/10/2026). Sa couleur est écrite en dur dans
// le trait (jamais `currentColor`).
import { prepareSlideHtml, type EditorSlide } from "@/lib/carousel-editor";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const serialize = (doc: Document) => doc.head.innerHTML + doc.body.innerHTML;
const ICON_SIZE = 200;

/**
 * Couleur de marque pour un élément ajouté : la plus vive de la palette, assez
 * foncée pour se lire sur un fond clair (le fond rose pâle est souvent la plus
 * fréquente).
 */
export function brandInk(palette: string[]): string {
  const score = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), light = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
    return light > 0.12 && light < 0.6 ? sat : -1;
  };
  return [...palette].sort((a, b) => score(b) - score(a)).find((c) => score(c) > 0.2) || "#1a1a1a";
}

const paint = (svg: Element, color: string) => {
  [svg, ...Array.from(svg.querySelectorAll("*"))].forEach((node) => {
    if (node.getAttribute("stroke") && node.getAttribute("stroke") !== "none") node.setAttribute("stroke", color);
    if (node.getAttribute("fill") && !["none", "transparent"].includes(node.getAttribute("fill")!)) node.setAttribute("fill", color);
  });
  (svg as SVGElement).style.color = color;
};

/** Pose une icône (le SVG affiché dans le choix d'icônes) au centre de la slide. */
export function addIcon(slide: EditorSlide, name: string, svgMarkup: string, color: string): { slide: EditorSlide; id: string | null } {
  if (slide.locked) return { slide, id: null };
  const doc = parse(slide.html);
  const root = doc.body.firstElementChild as HTMLElement | null;
  const svg = parse(`<div>${svgMarkup}</div>`).querySelector("svg");
  if (!root || !svg) return { slide, id: null };
  const icon = doc.importNode(svg, true) as SVGSVGElement;
  ["class", "aria-hidden", "focusable"].forEach((a) => icon.removeAttribute(a));
  icon.setAttribute("width", "100%");
  icon.setAttribute("height", "100%");
  icon.setAttribute("style", "display:block;width:100%;height:100%;overflow:visible");
  paint(icon, color);
  const box = doc.createElement("div");
  box.setAttribute("data-editor-shape", "dessin");
  box.setAttribute("data-editor-icon", name);
  box.setAttribute("data-decorative", "true");
  box.setAttribute("data-editor-new", "true");
  box.style.cssText = `position:absolute;left:${(1080 - ICON_SIZE) / 2}px;top:${(1350 - ICON_SIZE) / 2}px;width:${ICON_SIZE}px;height:${ICON_SIZE}px;z-index:20`;
  box.append(icon);
  root.append(box);
  const html = prepareSlideHtml(serialize(doc));
  const id = parse(html).querySelector<HTMLElement>("[data-editor-new]")?.dataset.editorId || null;
  return { slide: { ...slide, html: html.replace(/ data-editor-new="true"/, "") }, id };
}

const findIcon = (doc: Document, id: string) =>
  Array.from(doc.querySelectorAll<HTMLElement>("[data-editor-icon]")).find((el) => el.dataset.editorId === id)?.querySelector("svg") || undefined;

/** L'élément choisi est-il une icône ajoutée ? */
export function isIcon(slide: EditorSlide, id: string | null | undefined): boolean {
  return !!id && slide.html.includes("data-editor-icon") && !!findIcon(parse(slide.html), id);
}

/** Couleur actuelle d'une icône (son trait). */
export function iconColor(slide: EditorSlide, id: string): string {
  const icon = findIcon(parse(slide.html), id);
  return icon?.getAttribute("stroke") || icon?.style.color || "#1a1a1a";
}

/** Change la couleur d'une icône, comme celle d'un texte. */
export function setIconColor(slide: EditorSlide, id: string, color: string): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const icon = findIcon(doc, id);
  if (!icon) return slide;
  paint(icon, color);
  return { ...slide, html: serialize(doc) };
}

/**
 * « Centrer sur la slide » : les styles qui mettent la boîte affichée de
 * l'élément au centre de la slide (1080 × 1350), comme l'alignement des calques.
 */
export function centerOnSlide(el: Element, view: Window): Record<string, string> {
  const r = el.getBoundingClientRect();
  const cs = view.getComputedStyle(el);
  const abs = cs.position === "absolute";
  const dx = (1080 - r.width) / 2 - r.left;
  const dy = (1350 - r.height) / 2 - r.top;
  return {
    position: abs ? "absolute" : "relative",
    left: `${Math.round((parseFloat(cs.left) || 0) + dx)}px`,
    top: `${Math.round((parseFloat(cs.top) || 0) + dy)}px`,
    // Un bloc tenu par « right » sans largeur s'étirerait : il garde sa largeur.
    ...(abs && (el as HTMLElement).style?.right && !(el as HTMLElement).style.width ? { width: `${Math.round(r.width)}px`, right: "auto" } : {}),
  };
}
