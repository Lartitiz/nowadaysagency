// Filtres photo de l'éditeur de carrousel (luminosité, contraste, saturation,
// noir et blanc) : posés en CSS `filter` pour l'aperçu. html2canvas-pro, utilisé
// par l'export PNG (publication) et l'export PowerPoint/Canva, ignore `filter` :
// avant la capture, on remplace la photo par une copie aux pixels déjà corrigés.
// Aucune donnée ne quitte le navigateur ; en cas d'échec la photo reste nette.

const SELECTOR = "img[style*='filter'],[data-pptx-photo][style*='filter'],[data-editor-photo][style*='filter']";
const MAX_SIDE = 2160;

export interface PhotoFilter {
  brightness: number;
  contrast: number;
  saturate: number;
}

/** Lit `brightness() contrast() saturate() grayscale()` ; null si aucun réglage. */
export function parsePhotoFilter(value: string): PhotoFilter | null {
  const read = (name: string) => {
    const m = new RegExp(`${name}\\(\\s*([\\d.]+)(%?)\\s*\\)`).exec(value || "");
    return m ? Number(m[1]) / (m[2] ? 100 : 1) : null;
  };
  const brightness = read("brightness"), contrast = read("contrast"), saturate = read("saturate"), grayscale = read("grayscale");
  if (brightness === null && contrast === null && saturate === null && grayscale === null) return null;
  return {
    brightness: brightness ?? 1,
    contrast: contrast ?? 1,
    // grayscale(1) = saturation nulle.
    saturate: (saturate ?? 1) * (1 - Math.min(1, grayscale ?? 0)),
  };
}

/** Applique le filtre à des pixels RGBA (même formules que les filtres CSS). */
export function applyPhotoFilter(data: Uint8ClampedArray, f: PhotoFilter) {
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * f.brightness, g = data[i + 1] * f.brightness, b = data[i + 2] * f.brightness;
    r = (r - 127.5) * f.contrast + 127.5;
    g = (g - 127.5) * f.contrast + 127.5;
    b = (b - 127.5) * f.contrast + 127.5;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i] = gray + (r - gray) * f.saturate;
    data[i + 1] = gray + (g - gray) * f.saturate;
    data[i + 2] = gray + (b - gray) * f.saturate;
  }
}

function sourceUrl(el: HTMLElement): string | null {
  if (el.tagName === "IMG") return (el as HTMLImageElement).currentSrc || el.getAttribute("src");
  const raw = el.style.backgroundImage || el.ownerDocument.defaultView?.getComputedStyle(el).backgroundImage || "";
  return /url\((['"]?)(.*?)\1\)/.exec(raw)?.[2] || null;
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

/** Remplace chaque photo filtrée par sa version corrigée, sans bloquer l'export. */
export async function bakePhotoFilters(root: HTMLElement, timeoutMs = 8000): Promise<number> {
  let baked = 0;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) {
    const filter = parsePhotoFilter(el.style.filter);
    const url = filter && sourceUrl(el);
    if (!filter || !url) continue;
    const img = await loadImage(url, timeoutMs);
    if (!img) continue;
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = root.ownerDocument.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    try {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyPhotoFilter(pixels.data, filter);
      ctx.putImageData(pixels, 0, 0);
      const data = canvas.toDataURL("image/jpeg", 0.9);
      if (el.tagName === "IMG") el.setAttribute("src", data);
      else el.style.backgroundImage = `url("${data}")`;
      el.style.filter = "none";
      baked++;
    } catch {
      // Photo sans autorisation CORS : on la garde telle quelle.
    }
  }
  return baked;
}
