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

/** Make images self-contained for the Pinterest SVG renderer. Mutates only its export iframe. */
export async function embedExportImages(root: HTMLElement): Promise<void> {
  const doc = root.ownerDocument;
  const resources = new Map<string, Promise<string>>();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const embed = (source: string): Promise<string> => {
    if (source.startsWith("data:")) return Promise.resolve(source);
    const url = new URL(source, doc.baseURI).href;
    if (!resources.has(url)) resources.set(url, (async () => {
      const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
      if (!response.ok) throw new ExportImageError();
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new ExportImageError());
        reader.readAsDataURL(blob);
      });
    })());
    return resources.get(url)!;
  };
  try {
    await Promise.all(Array.from(root.querySelectorAll("img")).map(async (img) => {
      const source = img.currentSrc || img.getAttribute("src");
      if (!source) return;
      img.src = await embed(source);
      img.removeAttribute("srcset");
    }));
    await Promise.all([root, ...root.querySelectorAll<HTMLElement>("*")].map(async (element) => {
      let background = doc.defaultView?.getComputedStyle(element).backgroundImage || "";
      const matches = Array.from(background.matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g));
      for (const match of matches) {
        const source = (match[1] ?? match[2] ?? match[3]).trim();
        if (source) background = background.replace(match[0], `url("${await embed(source)}")`);
      }
      if (matches.length) element.style.backgroundImage = background;
    }));
  } catch {
    throw new ExportImageError();
  } finally {
    clearTimeout(timeout);
  }
}
