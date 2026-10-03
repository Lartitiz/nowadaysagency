// Verre dépoli des carrousels photo (habillage « verre », 02/10/2026).
//
// La slide floute une copie de la photo avec `filter: blur()`. html2canvas-pro,
// utilisé par l'export PNG (publication Instagram) et par l'export PowerPoint/
// Canva, ignore les filtres CSS : la carte sortait nette. Avant la capture, on
// remplace donc la copie par une image DÉJÀ floutée, calculée sur un canvas en
// réduisant puis réagrandissant la photo avec lissage (flou sans `ctx.filter`,
// qui manque encore à certains Safari). Aucune donnée ne quitte le navigateur.

import { applyPhotoFilter, parsePhotoFilter, type PhotoFilter } from "./export-photo-filters";

const SELECTOR = "[data-photo-glass-blur]";

/** Facteurs de réduction successifs : plus le dernier est petit, plus le flou est fort. */
const STEPS = [0.25, 0.1, 0.045];

function backgroundUrl(el: HTMLElement): string | null {
  const raw = el.style.backgroundImage || el.ownerDocument.defaultView?.getComputedStyle(el).backgroundImage || "";
  const m = /url\((['"]?)(.*?)\1\)/.exec(raw);
  return m ? m[2] : null;
}

function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok && img.naturalWidth > 0 ? img : null);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.crossOrigin = "anonymous";
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

/** Photo recadrée en « cover » sur width×height, puis floutée par paliers. */
function blurredCoverDataUrl(img: HTMLImageElement, width: number, height: number, doc: Document = document, tone: PhotoFilter | null = null): string | null {
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const sw = width / scale, sh = height / scale;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  let source: CanvasImageSource = img;
  let srcRect = [sx, sy, sw, sh];
  for (const factor of STEPS) {
    const canvas = doc.createElement("canvas");
    canvas.width = Math.max(2, Math.round(width * factor));
    canvas.height = Math.max(2, Math.round(height * factor));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, srcRect[0], srcRect[1], srcRect[2], srcRect[3], 0, 0, canvas.width, canvas.height);
    source = canvas;
    srcRect = [0, 0, canvas.width, canvas.height];
  }
  const out = doc.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, srcRect[2], srcRect[3], 0, 0, width, height);
  try {
    // Même retouche que la photo de fond (noir et blanc, luminosité…).
    if (tone) {
      const pixels = ctx.getImageData(0, 0, width, height);
      applyPhotoFilter(pixels.data, tone);
      ctx.putImageData(pixels, 0, 0);
    }
    return out.toDataURL("image/jpeg", 0.88);
  } catch {
    return null; // canvas « tainted » (image sans CORS) : on garde la copie nette
  }
}

/**
 * Remplace chaque copie floutée par CSS par une image déjà floutée, pour les
 * rastériseurs qui ignorent `filter`. Sans effet s'il n'y a pas de verre dépoli.
 * Ne bloque jamais l'export : en cas d'échec, la carte reste lisible (voile clair).
 */
export async function bakeGlassBlur(root: HTMLElement, timeoutMs = 8000): Promise<number> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
  let baked = 0;
  for (const el of nodes) {
    const url = backgroundUrl(el);
    if (!url) continue;
    const img = await loadImage(url, timeoutMs);
    if (!img) continue;
    const width = el.offsetWidth || 1080, height = el.offsetHeight || 1350;
    const data = blurredCoverDataUrl(img, width, height, root.ownerDocument, parsePhotoFilter(el.getAttribute("data-photo-filter") || ""));
    if (!data) continue;
    el.style.backgroundImage = `url("${data}")`;
    el.style.backgroundSize = "100% 100%";
    el.style.filter = "none";
    baked++;
  }
  return baked;
}
