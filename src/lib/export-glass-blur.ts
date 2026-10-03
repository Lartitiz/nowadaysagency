// Verre dépoli des carrousels photo (habillage « verre », 02/10/2026).
//
// La slide floute une copie de la photo avec `filter: blur()`. html2canvas-pro,
// utilisé par l'export PNG (publication Instagram) et par l'export PowerPoint/
// Canva, ignore les filtres CSS : la carte sortait nette. Avant la capture, on
// remplace donc la copie par une image DÉJÀ floutée, calculée sur un canvas :
// flou gaussien natif (`ctx.filter`) quand le navigateur le permet, sinon
// réduction puis remontée par paliers. Aucune donnée ne quitte le navigateur.

import { applyPhotoFilter, parsePhotoFilter, type PhotoFilter } from "./export-photo-filters";

const SELECTOR = "[data-photo-glass-blur]";

/** Repli sans flou natif : facteurs de réduction successifs. Mesuré le 03/10/2026
 * dans Chrome : avec la remontée par paliers, [.25, .1, .05, .025] donne la même
 * douceur que le flou natif de 28 px (écart moyen entre pixels voisins 0,60). */
const STEPS = [0.25, 0.1, 0.05, 0.025];

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

/** Rayon du flou CSS de la copie (photo-overlay-templates.ts : filter:blur(28px)). */
const BLUR_PX = 28;

/** Le navigateur sait-il flouter un canvas (ctx.filter) ? Chrome, Firefox et
 * Safari récents oui ; sinon on retombe sur le flou par paliers. */
function canvasFilterSupported(doc: Document): boolean {
  try {
    const ctx = doc.createElement("canvas").getContext("2d");
    if (!ctx || !("filter" in ctx)) return false;
    ctx.filter = "blur(2px)";
    return ctx.filter === "blur(2px)";
  } catch {
    return false;
  }
}

/** Photo recadrée en « cover » sur width×height, puis floutée.
 * Flou gaussien natif quand il existe (lisse, comme à l'écran) ; sinon
 * réduction par paliers puis REMONTÉE par paliers (03/10/2026 : une remontée
 * d'un seul coup depuis 4,5 % donnait un flou pixelisé dans l'export). */
function blurredCoverDataUrl(img: HTMLImageElement, width: number, height: number, doc: Document = document, tone: PhotoFilter | null = null): string | null {
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const sw = width / scale, sh = height / scale;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  const out = doc.createElement("canvas");
  out.width = width;
  out.height = height;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  if (canvasFilterSupported(doc)) {
    // Débord de deux rayons : sans lui, les bords du flou tirent vers le transparent.
    const pad = BLUR_PX * 2;
    octx.filter = `blur(${BLUR_PX}px)`;
    octx.drawImage(img, sx, sy, sw, sh, -pad, -pad, width + 2 * pad, height + 2 * pad);
    octx.filter = "none";
  } else {
    const canvases: HTMLCanvasElement[] = [];
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
      canvases.push(canvas);
      source = canvas;
      srcRect = [0, 0, canvas.width, canvas.height];
    }
    // Remontée par paliers (inverse de la descente), puis à la taille finale.
    for (let i = canvases.length - 2; i >= 0; i--) {
      const up = canvases[i];
      const ctx = up.getContext("2d");
      if (!ctx) return null;
      ctx.clearRect(0, 0, up.width, up.height);
      ctx.drawImage(source, 0, 0, srcRect[2], srcRect[3], 0, 0, up.width, up.height);
      source = up;
      srcRect = [0, 0, up.width, up.height];
    }
    octx.drawImage(source, 0, 0, srcRect[2], srcRect[3], 0, 0, width, height);
  }
  try {
    // Même retouche que la photo de fond (noir et blanc, luminosité…).
    if (tone) {
      const pixels = octx.getImageData(0, 0, width, height);
      applyPhotoFilter(pixels.data, tone);
      octx.putImageData(pixels, 0, 0);
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
