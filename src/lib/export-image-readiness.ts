/** A successful raster export must contain every image in its source. */
export class ExportImageError extends Error {
  constructor() {
    super("Une image du visuel n’a pas pu être chargée. Réessaie quand elle est disponible.");
    this.name = "ExportImageError";
  }
}

function decodeImage(url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (ok) resolve(); else reject(new ExportImageError());
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    image.crossOrigin = "anonymous";
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") await image.decode();
        finish(image.naturalWidth > 0 && image.naturalHeight > 0);
      } catch { finish(false); }
    };
    image.onerror = () => finish(false);
    image.src = url;
  });
}

/** Check img and CSS background resources, including relative/blob/data URLs.
 * Load with the same CORS requirements as the rasterizer, with a bounded wait.
 */
export async function waitForExportImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  const urls = new Set<string>();
  const doc = root.ownerDocument;
  for (const img of root.querySelectorAll("img")) {
    const src = img.currentSrc || img.getAttribute("src");
    if (src) urls.add(new URL(src, doc.baseURI).href);
  }
  for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
    const background = doc.defaultView?.getComputedStyle(el).backgroundImage || "";
    const pattern = /url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g;
    for (const match of background.matchAll(pattern)) {
      const src = (match[1] ?? match[2] ?? match[3]).trim();
      if (src) urls.add(new URL(src, doc.baseURI).href);
    }
  }
  await Promise.all([...urls].map(url => decodeImage(url, timeoutMs)));
}
