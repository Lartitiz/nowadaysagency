// Ombre posée sur une photo pour lire le texte (26/11/2026, vidéo de Laetitia : « l'ombre
// est trop forte, on ne voit pas la photo, pouvoir cliquer sur l'ombre »). Le réglage
// existait, mais seulement en choisissant le calque « Voile sur la photo » puis
// « Réglages avancés ». Ici : UNE valeur par slide, de 0 (aucune) à 1 (forte), réglée
// dans l'onglet Photo et sur la barre posée sur la slide.
// Trois formes d'ombre existent dans les slides : le dégradé ou l'aplat `data-injected-scrim`
// (mises en page, carrousel mixte, garde de lisibilité) et le voile du texte éditorial
// (`style[data-photo-editorial-veil]`). Toutes suivent le même curseur, ainsi que le cartouche de
// lecture (`data-photo-reading-panel`, le « bloc bleu » derrière le texte, vu sur le compte démo).
import {
  editorialVeilAlpha,
  getEditorElements,
  patchElement,
  setEditorialVeilAlpha,
  setVeilAlpha,
  veilAlpha,
  type CarouselDocument,
  type EditorSlide,
} from "@/lib/carousel-editor";

/** Sous cette force, un texte clair reçoit un fin contour pour rester lisible. */
export const SHADE_CONTOUR_BELOW = 0.35;
const AUTO_CONTOUR = "0 2px 14px rgba(0,0,0,0.6)";
const sameShadow = (a: string | undefined, b: string) => (a || "").replace(/\s+/g, "") === b.replace(/\s+/g, "");

function scrims(html: string): { id: string; alpha: number }[] {
  if (!html.includes("data-injected-scrim") && !html.includes("data-photo-reading-panel")) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll<HTMLElement>("[data-injected-scrim][data-editor-id],[data-photo-reading-panel][data-editor-id]"))
    .map((el) => ({ id: el.dataset.editorId!, alpha: veilAlpha(el.getAttribute("style") || "") }))
    .filter((s): s is { id: string; alpha: number } => s.alpha !== null);
}

/** Force de l'ombre de la slide (0 à 1), ou null si la slide n'en a pas. */
export function photoShade(html: string): number | null {
  const values = scrims(html).map((s) => s.alpha);
  if (html.includes("data-photo-editorial-veil")) {
    const editorial = editorialVeilAlpha(html);
    if (editorial !== null) values.push(editorial);
  }
  if (!values.length) return null;
  const peak = Math.max(...values);
  return peak <= 0.015 ? 0 : peak;
}

/** Vrai pour une couleur claire (texte blanc ou presque), seule concernée par le contour. */
function isLight(color: string | undefined): boolean {
  const value = (color || "").trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1];
  const rgb = hex
    ? [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
    : /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value)?.slice(1, 4).map(Number);
  return !!rgb && (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 170;
}

/** Règle l'ombre de la slide. 0 = aucune (elle reste réglable ensuite). */
export function setPhotoShade(slide: EditorSlide, value: number): EditorSlide {
  if (slide.locked || photoShade(slide.html) === null) return slide;
  const alpha = Math.min(1, Math.max(0.01, value));
  let next = slide;
  scrims(slide.html).forEach((s) => (next = setVeilAlpha(next, s.id, alpha)));
  if (next.html.includes("data-photo-editorial-veil")) next = setEditorialVeilAlpha(next, alpha);
  // Ombre légère : le texte clair reçoit un contour ; ombre remontée : on retire celui qu'on a posé.
  getEditorElements(next.html)
    .filter((e) => e.kind === "text")
    .forEach((e) => {
      const shadow = e.style?.["text-shadow"];
      if (alpha < SHADE_CONTOUR_BELOW && isLight(e.style?.color) && (!shadow || shadow === "none"))
        next = patchElement(next, e.id, { styles: { "text-shadow": AUTO_CONTOUR } });
      else if (alpha >= SHADE_CONTOUR_BELOW && sameShadow(shadow, AUTO_CONTOUR))
        next = patchElement(next, e.id, { styles: { "text-shadow": "" } });
    });
  return next;
}

/** Même ombre sur toutes les slides qui en ont une (les slides verrouillées gardent la leur). */
export function setDocumentShade(document: CarouselDocument, value: number): { document: CarouselDocument; changed: number } {
  let changed = 0;
  const slides = document.slides.map((slide) => {
    const next = setPhotoShade(slide, value);
    if (next !== slide) changed++;
    return next;
  });
  return { document: { ...document, slides }, changed };
}
