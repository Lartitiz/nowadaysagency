/**
 * @deprecated Plus utilisé dans l'UI depuis l'unification "Télécharger" (PNG + PPTX éditable).
 * Conservé temporairement au cas où on voudrait rebrancher l'export "image fidèle".
 */
import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas-pro";

interface VisualSlide {
  slide_number: number;
  html: string;
}

const SLIDE_W_PX = 1080;
const SLIDE_H_PX = 1350;
const PPTX_W_IN = 7.5;
const PPTX_H_IN = 9.375;

/**
 * Build an isolated iframe (srcdoc) containing the slide HTML + the same
 * Google Fonts links as the parent app. This avoids Tailwind/parent CSS
 * conflicts and gives html2canvas a clean document to capture.
 */
async function mountSlideIframe(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${SLIDE_W_PX}px;height:${SLIDE_H_PX}px;border:0;z-index:-1;pointer-events:none;`;
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");

  // Replicate the parent's <link rel="stylesheet"> to keep Google Fonts
  // available inside the iframe as well.
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
  html, body { margin:0; padding:0; width:${SLIDE_W_PX}px; height:${SLIDE_H_PX}px; overflow:hidden; background:transparent; }
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

async function waitForIframeReady(iframe: HTMLIFrameElement, timeoutMs = 5000): Promise<void> {
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

  // Images
  const imgs = Array.from(doc.querySelectorAll("img"));
  if (imgs.length > 0) {
    await Promise.race([
      Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((res) => {
              if (img.complete && img.naturalWidth > 0) return res();
              img.addEventListener("load", () => res(), { once: true });
              img.addEventListener("error", () => res(), { once: true });
            }),
        ),
      ),
      new Promise((r) => setTimeout(r, timeoutMs)),
    ]);
  }

  // Two RAFs + small buffer to make sure layout settled
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise((r) => setTimeout(r, 200));
}

async function captureSlide(html: string, scale = 3): Promise<string> {
  const iframe = await mountSlideIframe(html);
  try {
    await waitForIframeReady(iframe);

    const target = iframe.contentDocument!.body;
    const canvas = await html2canvas(target, {
      width: SLIDE_W_PX,
      height: SLIDE_H_PX,
      windowWidth: SLIDE_W_PX,
      windowHeight: SLIDE_H_PX,
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      imageTimeout: 8000,
    });

    return canvas.toDataURL("image/png");
  } finally {
    iframe.remove();
  }
}

async function captureSlideWithRetry(html: string): Promise<string | null> {
  try {
    return await captureSlide(html, 3);
  } catch (e) {
    console.warn("[exportCarouselVisualPptx] capture failed, retrying at scale 2", e);
    try {
      return await captureSlide(html, 2);
    } catch (e2) {
      console.error("[exportCarouselVisualPptx] capture failed twice", e2);
      return null;
    }
  }
}

export async function exportCarouselVisualPptx(
  visualSlides: VisualSlide[],
  fileName = "carrousel-visuels",
) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "INSTAGRAM", width: PPTX_W_IN, height: PPTX_H_IN });
  pptx.layout = "INSTAGRAM";
  pptx.author = "L'Assistant Com'";

  for (const vs of visualSlides) {
    const dataUrl = await captureSlideWithRetry(vs.html);
    const slide = pptx.addSlide();

    if (dataUrl) {
      slide.addImage({ data: dataUrl, x: 0, y: 0, w: PPTX_W_IN, h: PPTX_H_IN });
    } else {
      // Fallback : red error slide so the user knows something failed
      slide.background = { color: "FEE2E2" };
      slide.addText(`Slide ${vs.slide_number} non rendue.\nRelance l'export.`, {
        x: 0.5,
        y: 4,
        w: PPTX_W_IN - 1,
        h: 1.5,
        fontSize: 22,
        bold: true,
        color: "991B1B",
        align: "center",
        valign: "middle",
        wrap: true,
      });
    }
  }

  await pptx.writeFile({ fileName: fileName + ".pptx" });
}
