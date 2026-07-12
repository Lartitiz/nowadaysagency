import html2canvas from "html2canvas-pro";
import { fetchLogoAsBase64, buildLogoOverlayHtml } from "./export-logo";

interface VisualSlide {
  slide_number: number;
  html: string;
}

const SLIDE_W = 1080;
const SLIDE_H = 1350;

// Dimensions d'une story Instagram (9:16). Réutilisé par l'export stories.
const STORY_W = 1080;
const STORY_H = 1920;

interface SlideDims {
  w: number;
  h: number;
}

const CAROUSEL_DIMS: SlideDims = { w: SLIDE_W, h: SLIDE_H };
const STORY_DIMS: SlideDims = { w: STORY_W, h: STORY_H };

const sanitize = (s: string) =>
  s.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\-_.]/g, "-");

/**
 * Monte un iframe srcdoc isolé, identique au preview, avec les mêmes
 * Google Fonts que la page parente. Évite les conflits Tailwind/box-sizing
 * qui faisaient mal calculer `background-size: cover` à html2canvas.
 */
async function mountSlideIframe(html: string, logoOverlayHtml: string, dims: SlideDims): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${dims.w}px;height:${dims.h}px;border:0;z-index:-1;pointer-events:none;`;
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
  html, body { margin:0; padding:0; width:${dims.w}px; height:${dims.h}px; overflow:hidden; background:transparent; position:relative; }
  *, *::before, *::after { box-sizing: border-box; }
</style>
</head><body>${html}${logoOverlayHtml}</body></html>`;

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

  // Deux RAF + petit buffer pour laisser le layout se stabiliser.
  // ⚠️ Course avec un timeout : sur un onglet non visible (fenêtre recouverte,
  // onglet en arrière-plan), Chrome ne déclenche JAMAIS requestAnimationFrame
  // et l'export restait suspendu indéfiniment, spinner infini sans erreur.
  await Promise.race([
    new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    ),
    new Promise<void>((r) => setTimeout(r, 500)),
  ]);
  await new Promise((r) => setTimeout(r, 200));
}

/** Format de sortie d'une slide rasterisée. */
interface SlideOutput {
  /** Échelle html2canvas (2 = retina pour téléchargement, 1 = natif 1080px pour Instagram). */
  scale: number;
  /** Type MIME de l'image produite. */
  mime: "image/png" | "image/jpeg";
  /** Qualité (0–1) pour le JPEG ; ignoré en PNG. */
  quality?: number;
}

// Sortie par défaut : PNG retina (scale 2) pour téléchargement / Canva.
const PNG_RETINA: SlideOutput = { scale: 2, mime: "image/png" };
// Sortie Instagram : JPEG 1080×1350 (taille portrait exacte recommandée, sous les
// plafonds Meta de 1440px de large et 8 Mo) — un PNG retina photo plein cadre dépasse 8 Mo
// et Instagram rejette alors cette slide (« n'a pas pu traiter une image du carrousel »).
const JPEG_INSTAGRAM: SlideOutput = { scale: 1, mime: "image/jpeg", quality: 0.9 };

async function captureSlide(
  html: string,
  useCORS: boolean,
  logoOverlayHtml: string,
  output: SlideOutput,
  dims: SlideDims = CAROUSEL_DIMS,
): Promise<Blob> {
  const iframe = await mountSlideIframe(html, logoOverlayHtml, dims);
  try {
    await waitForIframeReady(iframe, html);

    const target = iframe.contentDocument!.body;
    const canvas = await html2canvas(target, {
      width: dims.w,
      height: dims.h,
      windowWidth: dims.w,
      windowHeight: dims.h,
      scale: output.scale,
      useCORS,
      allowTaint: !useCORS,
      // Un JPEG n'a pas d'alpha : fond blanc pour éviter le noir sur les zones transparentes.
      backgroundColor: output.mime === "image/jpeg" ? "#ffffff" : null,
      logging: false,
      imageTimeout: 8000,
    });

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), output.mime, output.quality);
    });
  } finally {
    iframe.remove();
  }
}

async function captureSlideWithRetry(
  html: string,
  logoOverlayHtml: string,
  output: SlideOutput = PNG_RETINA,
  dims: SlideDims = CAROUSEL_DIMS,
): Promise<Blob | null> {
  // 1er essai : sortie demandée + CORS strict
  try {
    return await captureSlide(html, true, logoOverlayHtml, output, dims);
  } catch (e) {
    console.warn("[exportCarouselPng] capture failed (CORS), retry", e);
  }
  // 2e essai : même sortie mais on tolère le taint (images sans CORS)
  try {
    return await captureSlide(html, false, logoOverlayHtml, output, dims);
  } catch (e) {
    console.warn("[exportCarouselPng] capture failed (taint), retry scale 1", e);
  }
  // 3e essai : scale 1 + taint, dernière chance
  try {
    return await captureSlide(html, false, logoOverlayHtml, { ...output, scale: 1 }, dims);
  } catch (e) {
    console.error("[exportCarouselPng] capture failed all retries", e);
    return null;
  }
}

/**
 * Rend les visualSlides en PNG (1080x1350) et renvoie les Blobs, SANS téléchargement.
 * Réutilisé par la publication directe Instagram (carrousel) : les Blobs sont ensuite
 * uploadés dans un bucket public pour qu'Instagram puisse les récupérer.
 */
export async function renderCarouselSlidesToBlobs(
  visualSlides: VisualSlide[],
  logoUrl?: string | null,
): Promise<{ slide_number: number; blob: Blob }[]> {
  if (!visualSlides || visualSlides.length === 0) return [];
  const logoBase64 = await fetchLogoAsBase64(logoUrl);
  const logoOverlayHtml = logoBase64 ? buildLogoOverlayHtml(logoBase64, SLIDE_W) : "";
  const out: { slide_number: number; blob: Blob }[] = [];
  const failed: number[] = [];
  for (const vs of visualSlides) {
    // JPEG 1080×1350 : reste sous les plafonds Instagram (1440px / 8 Mo). Un PNG retina
    // (2160px) d'une slide photo dépasse 8 Mo et Instagram rejette alors cette slide.
    const blob = await captureSlideWithRetry(vs.html, logoOverlayHtml, JPEG_INSTAGRAM);
    if (blob) out.push({ slide_number: vs.slide_number, blob });
    else failed.push(vs.slide_number);
  }
  // Publication tout-ou-rien : une slide ratée ne doit PAS partir en carrousel
  // amputé sur Instagram sans que l'utilisatrice le sache (avant : skip silencieux).
  if (failed.length > 0) {
    throw new Error(
      `Le rendu ${failed.length > 1 ? `des slides ${failed.join(", ")} a` : `de la slide ${failed[0]} a`} échoué. Réessaie la publication.`,
    );
  }
  return out;
}

/**
 * Capture les visualSlides HTML en PNG (1080x1350, scale 2 = ~2160x2700)
 * et les télécharge :
 * - 1 slide → PNG seul
 * - >1 slides → ZIP via JSZip (fallback : téléchargements séparés)
 *
 * Réutilisé par le calendrier (CalendarPostPreview) ET l'atelier (CreerUnifie).
 */
export interface CarouselExportResult {
  /** Nombre de slides demandées. */
  total: number;
  /** Nombre de slides effectivement exportées. */
  exported: number;
  /** Numéros des slides qui n'ont pas pu être rendues (ZIP amputé). */
  failed: number[];
}

export async function exportCarouselPng(
  visualSlides: VisualSlide[],
  fileName = "carrousel",
  logoUrl?: string | null,
): Promise<CarouselExportResult> {
  if (!visualSlides || visualSlides.length === 0) return { total: 0, exported: 0, failed: [] };

  // Pré-charge le logo une seule fois ; injecté dans chaque slide via overlay HTML.
  const logoBase64 = await fetchLogoAsBase64(logoUrl);
  const logoOverlayHtml = logoBase64 ? buildLogoOverlayHtml(logoBase64, SLIDE_W) : "";

  const images: { name: string; blob: Blob }[] = [];
  const failed: number[] = [];

  for (const vs of visualSlides) {
    const blob = await captureSlideWithRetry(vs.html, logoOverlayHtml);
    if (!blob) {
      console.warn(`[exportCarouselPng] slide ${vs.slide_number} skipped`);
      failed.push(vs.slide_number);
      continue;
    }
    images.push({ name: `slide-${vs.slide_number}.png`, blob });
  }

  const result: CarouselExportResult = { total: visualSlides.length, exported: images.length, failed };
  if (images.length === 0) return result;

  if (images.length === 1) {
    const url = URL.createObjectURL(images[0].blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = images[0].name;
    a.click();
    URL.revokeObjectURL(url);
    return result;
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
  return result;
}

interface StoryFrame {
  story_number: number;
  html: string;
}

// Sortie story : PNG 1080×1920 natif (la taille exacte d'une story Instagram,
// scale 1 — un retina 2160×3840 n'apporte rien et alourdit le fichier).
const PNG_STORY: SlideOutput = { scale: 1, mime: "image/png" };

/**
 * Rend les frames de stories en JPEG 1080×1920 et renvoie les Blobs, SANS téléchargement.
 * Prévu pour la publication directe Instagram (media_type STORIES) — mêmes plafonds
 * Meta que le feed (1440px / 8 Mo).
 */
export async function renderStoryFramesToBlobs(
  frames: StoryFrame[],
): Promise<{ story_number: number; blob: Blob }[]> {
  if (!frames || frames.length === 0) return [];
  const out: { story_number: number; blob: Blob }[] = [];
  for (const f of frames) {
    const blob = await captureSlideWithRetry(f.html, "", { scale: 1, mime: "image/jpeg", quality: 0.9 }, STORY_DIMS);
    if (blob) out.push({ story_number: f.story_number, blob });
  }
  return out;
}

/**
 * Capture les frames de stories (1080×1920) et les télécharge :
 * - 1 frame → PNG seul
 * - >1 frames → ZIP
 * Pas d'overlay logo : une story doit garder le look natif Instagram.
 */
export async function exportStoryPng(frames: StoryFrame[], fileName = "stories"): Promise<void> {
  if (!frames || frames.length === 0) return;

  const images: { name: string; blob: Blob }[] = [];
  for (const f of frames) {
    const blob = await captureSlideWithRetry(f.html, "", PNG_STORY, STORY_DIMS);
    if (!blob) {
      console.warn(`[exportStoryPng] story ${f.story_number} skipped`);
      continue;
    }
    images.push({ name: `story-${f.story_number}.png`, blob });
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
    a.download = sanitize(`stories-${fileName}.zip`);
    a.click();
    URL.revokeObjectURL(url);
  } catch {
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
