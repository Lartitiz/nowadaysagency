export interface QualityIssue {
  slide: number;
  elementId: string;
  kind: "overflow" | "size" | "margin" | "contrast" | "manual" | "image";
  severity: "error" | "warning";
  message: string;
  fix?: Record<string, string>;
}
type RGB = [number, number, number];
function rgb(value: string): RGB | null {
  const parts = value.match(
    /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
  );
  if (!parts || (parts[4] !== undefined && Number(parts[4]) < 1)) return null;
  return [Number(parts[1]), Number(parts[2]), Number(parts[3])];
}
// WCAG contrast formula; this is not a claim of full WCAG conformance.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
export function contrastRatio(a: RGB, b: RGB): number {
  const luminance = (c: RGB) =>
    c
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1350;
/** Lisibilité : plancher bloquant et cible conseillée (px sur une slide 1080). */
export const ESSENTIAL_FLOOR_PX = 32;
export const ESSENTIAL_TARGET_PX = 38;
export const SECONDARY_FLOOR_PX = 30;

const PAGINATION_ROLE = /^(page|page_number|pagination|slide_number|number)$/;
const SECONDARY_ROLE =
  /^(caption|cta|legend|source|label|tag|note|mention|kicker|eyebrow|hashtag|handle|watermark)$/;
const PHOTO_SELECTOR = "img,[data-editor-photo],[data-pptx-photo]";

function roleOf(el: HTMLElement): string {
  return (el.dataset.pptxEditable || el.dataset.slideText || "").toLowerCase();
}
function isPhoto(el: HTMLElement): boolean {
  return el.matches(PHOTO_SELECTOR);
}
function isDecorative(el: HTMLElement): boolean {
  return (
    el.getAttribute("aria-hidden") === "true" ||
    el.hasAttribute("data-decorative") ||
    el.hasAttribute("data-slide-page") ||
    PAGINATION_ROLE.test(roleOf(el))
  );
}
/** Un fond plein cadre (ou plus grand) est volontairement à ras bord. */
function isFullBleed(rect: DOMRect): boolean {
  return (
    rect.left <= 2 &&
    rect.top <= 2 &&
    rect.right >= CANVAS_WIDTH - 2 &&
    rect.bottom >= CANVAS_HEIGHT - 2
  );
}
function isVisible(el: HTMLElement, view: Window): boolean {
  const s = view.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return !(
    s.display === "none" ||
    s.visibility === "hidden" ||
    Number(s.opacity || 1) === 0 ||
    !r.width ||
    !r.height
  );
}

export interface Inspectable {
  el: HTMLElement;
  id: string;
  role: string;
  kind: "text" | "shape";
}
/**
 * Liste unique d'éléments inspectables, partagée par l'aperçu de l'éditeur et
 * le contrôle qualité : textes ET formes structurelles, sans les photos, les
 * fonds plein cadre ni les décors volontairement coupés.
 */
export function collectInspectables(doc: Document): Inspectable[] {
  const view = doc.defaultView!;
  const out: Inspectable[] = [];
  for (const el of doc.querySelectorAll<HTMLElement>("[data-editor-id]")) {
    if (isPhoto(el) || isDecorative(el) || !isVisible(el, view)) continue;
    if (el.parentElement?.closest('[data-slide-text],[data-pptx-editable]')) continue;
    const hasText = !!el.textContent?.trim();
    const isShape = el.hasAttribute("data-pptx-shape") || el.hasAttribute("data-editor-shape");
    if (!hasText && !isShape) continue;
    if (!isShape && !el.hasAttribute("data-pptx-editable") && !el.hasAttribute("data-slide-text") &&
      !Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent?.trim())) continue;
    if (isShape && isFullBleed(el.getBoundingClientRect())) continue;
    out.push({
      el,
      id: el.dataset.editorId!,
      role: roleOf(el),
      kind: isShape ? "shape" : "text",
    });
  }
  return out;
}

function contentRect(doc: Document, item: Inspectable): DOMRect {
  if (item.kind !== "text") return item.el.getBoundingClientRect();
  const range = doc.createRange();
  range.selectNodeContents(item.el);
  const textRect = range.getBoundingClientRect();
  return textRect.width || textRect.height
    ? textRect
    : item.el.getBoundingClientRect();
}

/**
 * Géométrie partagée : retourne les identifiants réellement coupés (hors
 * canvas ou rognés par un ancêtre à overflow masqué), sans doublon
 * parent/enfant — seul l'élément le plus profond est signalé.
 */
export function findClippedIds(doc: Document): string[] {
  const view = doc.defaultView!;
  const items = collectInspectables(doc);
  const clipped: Inspectable[] = [];
  for (const item of items) {
    const rect = item.el.getBoundingClientRect();
    const box = contentRect(doc, item);
    let cut =
      Math.min(rect.left, box.left) < -2 ||
      Math.min(rect.top, box.top) < -2 ||
      Math.max(rect.right, box.right) > CANVAS_WIDTH + 2 ||
      Math.max(rect.bottom, box.bottom) > CANVAS_HEIGHT + 2;
    for (
      let p: HTMLElement | null = item.el;
      p && p !== doc.body && !cut;
      p = p.parentElement
    ) {
      const s = view.getComputedStyle(p),
        r = p.getBoundingClientRect();
      if (isFullBleed(r)) continue;
      if (
        /hidden|clip|scroll|auto/.test(s.overflowX) &&
        (box.left < r.left - 2 || box.right > r.right + 2)
      )
        cut = true;
      if (
        /hidden|clip|scroll|auto/.test(s.overflowY) &&
        (box.top < r.top - 2 || box.bottom > r.bottom + 2)
      )
        cut = true;
    }
    // Texte rogné à l'intérieur de son propre bloc (hauteur insuffisante).
    if (
      !cut &&
      item.kind === "text" &&
      item.el.clientHeight > 0 &&
      item.el.scrollHeight > item.el.clientHeight + 2 &&
      /hidden|clip/.test(view.getComputedStyle(item.el).overflowY)
    )
      cut = true;
    if (cut) clipped.push(item);
  }
  return clipped
    .filter((item) => !clipped.some((o) => o !== item && item.el.contains(o.el)))
    .map((item) => item.id);
}

/** Un élément dépasse-t-il ? Même verdict que le contrôle qualité global. */
export function hasClippedElement(doc: Document): boolean {
  return findClippedIds(doc).length > 0;
}

export function inspectSlide(doc: Document, slide: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const view = doc.defaultView!;
  const photos = [...doc.querySelectorAll<HTMLElement>(PHOTO_SELECTOR)];
  const clipped = new Set(findClippedIds(doc));
  for (const item of collectInspectables(doc)) {
    const el = item.el;
    const style = view.getComputedStyle(el),
      rect = el.getBoundingClientRect();
    const add = (
      kind: QualityIssue["kind"],
      message: string,
      severity: QualityIssue["severity"] = "warning",
      fix?: Record<string, string>,
    ) =>
      issues.push({
        slide,
        elementId: item.id,
        kind,
        message,
        severity,
        fix,
      });
    if (clipped.has(item.id)) {
      add(
        "overflow",
        item.kind === "shape"
          ? "Un bloc de mise en page sort de la slide : ajuste sa taille ou sa position."
          : "Texte coupé ou hors de la slide : ajuste sa position, sa largeur ou sa taille.",
        "error",
      );
      continue;
    }
    if (
      Math.min(
        rect.left,
        rect.top,
        CANVAS_WIDTH - rect.right,
        CANVAS_HEIGHT - rect.bottom,
      ) < 40
    )
      add("margin", "Texte proche du bord : laisse idéalement 40 px de marge.");
    if (item.kind !== "text") continue;
    const font = parseFloat(style.fontSize);
    const secondary = SECONDARY_ROLE.test(item.role);
    if (secondary) {
      if (font < SECONDARY_FLOOR_PX)
        add(
          "size",
          `Mention secondaire illisible sur mobile : passe à au moins ${SECONDARY_FLOOR_PX} px.`,
          "error",
          { "font-size": `${SECONDARY_FLOOR_PX}px` },
        );
    } else if (font < ESSENTIAL_FLOOR_PX)
      add(
        "size",
        `Texte essentiel trop petit pour être lu sur mobile : passe à au moins ${ESSENTIAL_TARGET_PX} px.`,
        "error",
        { "font-size": `${ESSENTIAL_TARGET_PX}px` },
      );
    else if (font < ESSENTIAL_TARGET_PX)
      add(
        "size",
        `Texte lisible mais juste : ${ESSENTIAL_TARGET_PX} px est plus confortable.`,
        "warning",
        { "font-size": `${ESSENTIAL_TARGET_PX}px` },
      );
    let background: RGB | null = null;
    let uncertain = false;
    for (let p: HTMLElement | null = el; p; p = p.parentElement) {
      const s = view.getComputedStyle(p);
      if (
        s.backgroundImage !== "none" ||
        Number(s.opacity) < 1 ||
        s.filter !== "none" ||
        s.mixBlendMode !== "normal"
      ) {
        uncertain = true;
        break;
      }
      background = rgb(s.backgroundColor);
      if (background) break;
      if (
        s.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        s.backgroundColor !== "transparent"
      ) {
        uncertain = true;
        break;
      }
    }
    // A photo can be a sibling layer, not an ancestor. Do not guess its pixels.
    if (
      !rgb(style.backgroundColor) &&
      photos.some((photo) => {
        const r = photo.getBoundingClientRect();
        return (
          r.left < rect.right &&
          r.right > rect.left &&
          r.top < rect.bottom &&
          r.bottom > rect.top
        );
      })
    )
      uncertain = true;
    const foreground = rgb(style.color);
    if (uncertain || !foreground)
      // Incertain reste un conseil : on ne bloque jamais sur une mesure
      // impossible (photo, transparence, dégradé).
      add(
        "manual",
        "Contraste sur photo, transparence ou effet : vérifie visuellement la lisibilité.",
      );
    else {
      background ||= [255, 255, 255];
      // 1080 px artwork shown at 360 px on mobile; evaluate apparent text size.
      const threshold =
        font / 3 >= 24 || (font / 3 >= 18.67 && Number(style.fontWeight) >= 700)
          ? 3
          : 4.5;
      if (contrastRatio(foreground, background) < threshold) {
        const color =
          contrastRatio([0, 0, 0], background) >
          contrastRatio([255, 255, 255], background)
            ? "#000000"
            : "#ffffff";
        add(
          "contrast",
          "Contraste insuffisant sur fond uni : renforce la couleur du texte.",
          "error",
          { color },
        );
      }
    }
  }
  // A single visual verification covers the photo/effects of this slide.
  // Keep measured defects element-specific, without a wall of identical advice.
  let manualReported = false;
  return issues.filter(issue => {
    if (issue.kind !== "manual") return true;
    if (manualReported) return false;
    manualReported = true;
    return true;
  });
}


function bounded(
  promise: Promise<unknown>,
  signal: AbortSignal,
  ms = 12_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new DOMException("Annulé", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Le contrôle n’a pas pu charger tous les éléments. Vérifie ta connexion puis relance-le.",
          ),
        ),
      ms,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else promise.then(() => finish(), finish);
  });
}
export async function checkCarouselQuality(
  slides: { html: string }[],
  signal: AbortSignal,
): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];
  for (let i = 0; i < slides.length; i++) {
    if (signal.aborted) throw new DOMException("Annulé", "AbortError");
    const frame = document.createElement("iframe");
    frame.title = `Contrôle qualité slide ${i + 1}`;
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.style.cssText =
      "position:fixed;left:-12000px;top:0;width:1080px;height:1350px;border:0;pointer-events:none";
    try {
      const loaded = new Promise<void>((resolve) => {
        frame.onload = () => resolve();
      });
      frame.srcdoc = `<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px;overflow:hidden}*{box-sizing:border-box}</style></head><body>${slides[i].html}</body></html>`;
      document.body.append(frame);
      await bounded(loaded, signal);
      const doc = frame.contentDocument!;
      await bounded(doc.fonts?.ready || Promise.resolve(), signal);
      // Mesurer APRÈS polices et images : une police ou une photo tardive
      // change la géométrie et produirait de faux débordements.
      const jobs = [

        ...doc.querySelectorAll<HTMLElement>(
          "img,[data-editor-photo],[data-pptx-photo]",
        ),
      ].map(async (el) => {
        let ok = true;
        if (el.tagName === "IMG")
          ok =
            (el as HTMLImageElement).complete &&
            (el as HTMLImageElement).naturalWidth > 0;
        else {
          const src = doc
            .defaultView!.getComputedStyle(el)
            .backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
          if (src) {
            const image = new Image();
            const loaded = new Promise<void>((resolve) => {
              image.onload = () => resolve();
              image.onerror = () => {
                ok = false;
                resolve();
              };
            });
            image.src = src;
            await bounded(loaded, signal);
          }
        }
        if (!ok)
          issues.push({
            slide: i,
            elementId: el.dataset.editorId || "",
            kind: "image",
            severity: "error",
            message:
              "Image impossible à charger : remplace-la ou vérifie sa disponibilité.",
          });
      });
      await Promise.all(jobs);
      issues.push(...inspectSlide(doc, i));

    } finally {
      frame.remove();
    }
  }
  return issues;
}
