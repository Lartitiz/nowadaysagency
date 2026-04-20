import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas-pro";
import {
  mapFontToPptx,
  getOverlayCoords,
  computeOverlayFontSize,
  normalizeHex,
} from "./pptx-font-mapping";

interface VisualSlide {
  slide_number: number;
  html: string;
}

interface SlideData {
  slide_number: number;
  overlay_text?: string | null;
  overlay_position?: string | null;
  overlay_style?: string | null;
  title?: string | null;
  body?: string | null;
}

export interface HybridCharter {
  color_text?: string | null;
  color_primary?: string | null;
  color_background?: string | null;
  font_title?: string | null;
  font_body?: string | null;
}

const SLIDE_W_PX = 1080;
const SLIDE_H_PX = 1350;
const PPTX_W_IN = 7.5;
const PPTX_H_IN = 9.375;

async function mountIframe(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${SLIDE_W_PX}px;height:${SLIDE_H_PX}px;border:0;z-index:-1;pointer-events:none;`;
  iframe.setAttribute("aria-hidden", "true");

  const fontLinks = Array.from(document.head.querySelectorAll("link"))
    .filter((l) => /fonts\.(googleapis|gstatic|bunny)/i.test(l.getAttribute("href") || ""))
    .map((l) => l.outerHTML)
    .join("\n");

  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8" />${fontLinks}
<style>
  html, body { margin:0; padding:0; width:${SLIDE_W_PX}px; height:${SLIDE_H_PX}px; overflow:hidden; background:transparent; }
  *, *::before, *::after { box-sizing: border-box; }
  /* When we want to hide overlays for the hybrid mode */
  [data-pptx-hide="true"] { visibility: hidden !important; }
</style></head><body>${html}</body></html>`;

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

async function waitReady(iframe: HTMLIFrameElement): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc) return;
  try {
    if ((doc as any).fonts?.ready) {
      await Promise.race([(doc as any).fonts.ready, new Promise((r) => setTimeout(r, 5000))]);
    }
  } catch {
    /* noop */
  }
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
      new Promise((r) => setTimeout(r, 5000)),
    ]);
  }
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise((r) => setTimeout(r, 200));
}

function hideOverlayInDoc(doc: Document, overlayText: string): boolean {
  const target = (overlayText || "").trim();
  if (!target || target.length < 3) return false;

  let best: Element | null = null;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as Element | null;
  while (node) {
    const txt = (node.textContent || "").trim();
    if (txt && (txt === target || txt.includes(target)) && txt.length < target.length * 3) {
      if (!best || (node.contains(best) === false && best.contains(node))) {
        best = node;
      } else if (!best) {
        best = node;
      } else {
        if ((node.textContent || "").length < (best.textContent || "").length) best = node;
      }
    }
    node = walker.nextNode() as Element | null;
  }

  if (best) {
    best.setAttribute("data-pptx-hide", "true");
    return true;
  }
  return false;
}

async function captureBackground(html: string, overlayText: string | null): Promise<string | null> {
  const iframe = await mountIframe(html);
  try {
    await waitReady(iframe);
    const doc = iframe.contentDocument!;
    if (overlayText) hideOverlayInDoc(doc, overlayText);
    await new Promise((r) => setTimeout(r, 50));

    const canvas = await html2canvas(doc.body, {
      width: SLIDE_W_PX,
      height: SLIDE_H_PX,
      windowWidth: SLIDE_W_PX,
      windowHeight: SLIDE_H_PX,
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      imageTimeout: 8000,
    });
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.error("[hybrid] background capture failed", e);
    return null;
  } finally {
    iframe.remove();
  }
}

export async function exportCarouselHybridPptx(
  visualSlides: VisualSlide[],
  slidesData: SlideData[] | null | undefined,
  charter: HybridCharter | null | undefined,
  fileName = "carrousel-editable",
) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "INSTAGRAM", width: PPTX_W_IN, height: PPTX_H_IN });
  pptx.layout = "INSTAGRAM";
  pptx.author = "L'Assistant Com'";

  const titleFont = mapFontToPptx(charter?.font_title);
  const bodyFont = mapFontToPptx(charter?.font_body);
  const textColor = normalizeHex(charter?.color_text, "FFFFFF");

  for (let i = 0; i < visualSlides.length; i++) {
    const vs = visualSlides[i];
    const data = slidesData?.find((s) => s.slide_number === vs.slide_number) || slidesData?.[i];
    const overlayText =
      (data?.overlay_text || data?.title || data?.body || "").trim() || null;

    const bg = await captureBackground(vs.html, overlayText);
    const slide = pptx.addSlide();

    if (bg) {
      slide.addImage({ data: bg, x: 0, y: 0, w: PPTX_W_IN, h: PPTX_H_IN });
    } else {
      slide.background = { color: normalizeHex(charter?.color_background, "FFFFFF") };
    }

    if (overlayText) {
      const coords = getOverlayCoords(data?.overlay_position);
      const fontSize = computeOverlayFontSize(overlayText);
      const style = (data?.overlay_style || "sensoriel").toLowerCase();
      const isSerifVibe = style === "sensoriel" || style === "narratif";
      const isMinimal = style === "minimal";

      const needsScrim = !isMinimal;
      if (needsScrim) {
        slide.addShape("rect", {
          x: 0,
          y: coords.valign === "bottom" ? PPTX_H_IN - coords.h - 0.7 : coords.y - 0.3,
          w: PPTX_W_IN,
          h: coords.h + 1.0,
          fill: { color: "000000", transparency: 55 },
          line: { type: "none" },
        });
      }

      slide.addText(overlayText, {
        x: coords.x,
        y: coords.y,
        w: coords.w,
        h: coords.h,
        fontFace: isSerifVibe ? titleFont : bodyFont,
        fontSize,
        bold: isMinimal,
        italic: style === "sensoriel",
        color: textColor,
        align: coords.align,
        valign: coords.valign,
        wrap: true,
        lineSpacingMultiple: 1.25,
      });
    }
  }

  await pptx.writeFile({ fileName: fileName + ".pptx" });
}
