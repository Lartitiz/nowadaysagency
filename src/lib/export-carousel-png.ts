import html2canvas from "html2canvas-pro";

interface VisualSlide {
  slide_number: number;
  html: string;
}

const SLIDE_W = 1080;
const SLIDE_H = 1350;

const sanitize = (s: string) =>
  s.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\-_.]/g, "-");

/**
 * Monte un iframe srcdoc isolé, identique au preview, avec les mêmes
 * Google Fonts que la page parente. Évite les conflits Tailwind/box-sizing
 * qui faisaient mal calculer `background-size: cover` à html2canvas.
 */
async function mountSlideIframe(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${SLIDE_W}px;height:${SLIDE_H}px;border:0;z-index:-1;pointer-events:none;`;
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");

  const fontLinks = Array.from(document.head.querySelectorAll("link"))
    .filter((l) => {
      const href = l.getAttribute("href") || "";
      return /fonts\.googleapis|fonts\.gstatic|fonts\.bunny/i.test(href);
    })
    .map((l) => l.outerHTML)
    .join("\n");

  const srcdoc = `<!doctype html><html><head>
<meta charset="utf-8" />
${fontLinks}
<style>
  html, body { margin:0; padding:0; width:${SLIDE_W}px; height:${SLIDE_H}px; overflow:hidden; background:transparent; }
  *, *::before, *::after { box-sizing: border-box; }
</style>
</head><body>${html}</body></html>`;

  iframe.srcdoc = srcdoc;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("iframe load timeout")), 8000);
    iframe.addEventListener(
      "load",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

  return iframe;
}

/** Extrait toutes les URLs `url(...)` (data: ou http) depuis un HTML brut. */
function extractBackgroundUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /url\(\s*(['"]?)(data:[^'")]+|https?:[^'")]+)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    urls.push(m[2]);
  }
  return Array.from(new Set(urls));
}

/** Précharge + decode une URL image (timeout 8s). */
async function preloadImage(url: string, timeoutMs = 8000): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const t = setTimeout(() => {
      console.warn("[exportCarouselPng] image preload timeout", url.slice(0, 80));
      finish();
    }, timeoutMs);
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      try {
        if ((img as any).decode) await (img as any).decode();
      } catch {
        /* noop */
      }
      clearTimeout(t);
      finish();
    };
    img.onerror = () => {
      clearTimeout(t);
      finish();
    };
    img.src = url;
  });
}

async function waitForIframeReady(
  iframe: HTMLIFrameElement,
  rawHtml: string,
  timeoutMs = 8000,
): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc) return;

  // Fonts
  try {
    if ((doc as any).fonts?.ready) {
      await Promise.race([
        (doc as any).fonts.ready,
        new Promise((r) => setTimeout(r, timeoutMs)),
      ]);
    }
  } catch {
    /* noop */
  }

  // <img> tags : attendre complete + naturalWidth, puis decode()
  const imgs = Array.from(doc.querySelectorAll("img"));
  if (imgs.length > 0) {
    await Promise.race([
      Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>(async (res) => {
              if (!(img.complete && img.naturalWidth > 0)) {
                await new Promise<void>((r) => {
                  img.addEventListener("load", () => r(), { once: true });
                  img.addEventListener("error", () => r(), { once: true });
                });
              }
              try {
                if ((img as any).decode) await (img as any).decode();
              } catch {
                /* noop */
              }
              res();
            }),
        ),
      ),
      new Promise((r) => setTimeout(r, timeoutMs)),
    ]);
  }

  // background-image url(...) : précharger + decode toutes les URLs trouvées
  // dans le HTML brut. C'est l'étape qui manquait et qui causait les "photos
  // mal cadrées / compressées" pour les carrousels photo.
  const bgUrls = extractBackgroundUrls(rawHtml);
  if (bgUrls.length > 0) {
    await Promise.all(bgUrls.map((u) => preloadImage(u, timeoutMs)));
  }

  // Deux RAF + petit buffer pour laisser le layout se stabiliser
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );
  await new Promise((r) => setTimeout(r, 200));
}

async function captureSlide(
  html: string,
  scale: number,
  useCORS: boolean,
): Promise<Blob> {
  const iframe = await mountSlideIframe(html);
  try {
    await waitForIframeReady(iframe, html);

    const target = iframe.contentDocument!.body;
    const canvas = await html2canvas(target, {
      width: SLIDE_W,
      height: SLIDE_H,
      windowWidth: SLIDE_W,
      windowHeight: SLIDE_H,
      scale,
      useCORS,
      allowTaint: !useCORS,
      backgroundColor: null,
      logging: false,
      imageTimeout: 8000,
    });

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), "image/png");
    });
  } finally {
    iframe.remove();
  }
}

async function captureSlideWithRetry(html: string): Promise<Blob | null> {
  // 1er essai : qualité retina (scale 2) + CORS strict
  try {
    return await captureSlide(html, 2, true);
  } catch (e) {
    console.warn("[exportCarouselPng] capture failed (scale 2, CORS), retry", e);
  }
  // 2e essai : scale 2 mais on tolère le taint (images sans CORS)
  try {
    return await captureSlide(html, 2, false);
  } catch (e) {
    console.warn("[exportCarouselPng] capture failed (scale 2, taint), retry scale 1", e);
  }
  // 3e essai : scale 1 + taint, dernière chance
  try {
    return await captureSlide(html, 1, false);
  } catch (e) {
    console.error("[exportCarouselPng] capture failed all retries", e);
    return null;
  }
}

/**
 * Capture les visualSlides HTML en PNG (1080x1350, scale 2 = ~2160x2700)
 * et les télécharge :
 * - 1 slide → PNG seul
 * - >1 slides → ZIP via JSZip (fallback : téléchargements séparés)
 *
 * Réutilisé par le calendrier (CalendarPostPreview) ET l'atelier (CreerUnifie).
 */
export async function exportCarouselPng(
  visualSlides: VisualSlide[],
  fileName = "carrousel",
): Promise<void> {
  if (!visualSlides || visualSlides.length === 0) return;

  const images: { name: string; blob: Blob }[] = [];

  for (const vs of visualSlides) {
    const blob = await captureSlideWithRetry(vs.html);
    if (!blob) {
      console.warn(`[exportCarouselPng] slide ${vs.slide_number} skipped`);
      continue;
    }
    images.push({ name: `slide-${vs.slide_number}.png`, blob });
  }

  if (images.length === 0) return;

  if (images.length === 1) {
    const url = URL.createObjectURL(images[0].blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = images[0].name;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const img of images) zip.file(img.name, img.blob);
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitize(`visuels-${fileName}.zip`);
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // Fallback : téléchargements séparés
    for (const img of images) {
      const url = URL.createObjectURL(img.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = img.name;
      a.click();
      URL.revokeObjectURL(url);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}
