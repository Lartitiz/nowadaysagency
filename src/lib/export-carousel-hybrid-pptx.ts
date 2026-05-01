import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas-pro";
import * as Sentry from "@sentry/react";
import {
  mapFontToPptx,
  normalizeHex,
  pxToInches,
  fontSizePxToPt,
  letterSpacingPxToCharSpacing,
  extractEditableBlocks,
  extractAnnotatedBlocks,
  type EditableBlock,
} from "./pptx-font-mapping";

interface VisualSlide {
  slide_number: number;
  html: string;
}

export interface OriginalPhoto {
  base64: string;
  mimeType?: string;
}

interface PhotoZone {
  el: HTMLElement;
  photoIndex: number; // 1-indexé
  rect: { x: number; y: number; w: number; h: number };
  type: "img" | "background";
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
const PX_PER_IN = SLIDE_W_PX / PPTX_W_IN; // 144

// ---------------------------------------------------------------------------
// iframe mounting + readiness
// ---------------------------------------------------------------------------

async function mountIframe(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${SLIDE_W_PX}px;height:${SLIDE_H_PX}px;border:0;z-index:-1;pointer-events:none;`;
  iframe.setAttribute("aria-hidden", "true");

  const fontLinks = Array.from(document.head.querySelectorAll("link"))
    .filter((l) => /fonts\.(googleapis|gstatic|bunny)/i.test(l.getAttribute("href") || ""))
    .map((l) => l.outerHTML)
    .join("\n");

  // NB: tous les descendants d'un bloc annoté sont masqués pour éviter le double-rendu
  // dans la rasterisation html2canvas (sinon les spans avec couleur explicite restent visibles
  // sous le bloc éditable PPTX rajouté par-dessus).
  // Si un descendant doit rester visible (badge, sticker, illustration), ne pas annoter le
  // parent en data-pptx-editable — annoter chaque sous-bloc texte individuellement.
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8" />${fontLinks}
<style>
  html, body { margin:0; padding:0; width:${SLIDE_W_PX}px; height:${SLIDE_H_PX}px; overflow:hidden; background:transparent; }
  *, *::before, *::after { box-sizing: border-box; }
  [data-pptx-hide="true"],
  [data-pptx-hide="true"] * {
    color: transparent !important;
    text-shadow: none !important;
    -webkit-text-fill-color: transparent !important;
    background-clip: text !important;
    -webkit-background-clip: text !important;
    background-image: none !important;
  }
  [data-pptx-hide="true"]::before,
  [data-pptx-hide="true"]::after,
  [data-pptx-hide="true"] *::before,
  [data-pptx-hide="true"] *::after {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    text-shadow: none !important;
  }
  /* Masquage des zones photo : visibility (pas display) pour préserver le layout
     et garder getBoundingClientRect valide. Le background-image est traité
     en JS pour conserver les gradients overlay (cf. extractPhotoZones). */
  [data-pptx-photo-hide="true"] img,
  [data-pptx-photo-hide="true"] picture,
  [data-pptx-photo-hide="true"] svg image {
    visibility: hidden !important;
  }
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

// ---------------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------------

async function captureBody(doc: Document): Promise<string> {
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
}

// ---------------------------------------------------------------------------
// overlay slide (fallback) : photo + overlay_text court
// ---------------------------------------------------------------------------

/** Find the smallest element whose textContent contains the overlay text. */
function findOverlayElement(doc: Document, overlayText: string): HTMLElement | null {
  const target = overlayText.trim().toLowerCase();
  if (!target || target.length < 3) return null;

  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));
  let best: HTMLElement | null = null;
  let bestLen = Infinity;

  for (const el of all) {
    const txt = (el.textContent || "").trim().toLowerCase();
    if (!txt) continue;
    const matches = txt === target || txt.includes(target);
    if (!matches) continue;
    if (txt.length < bestLen) {
      best = el;
      bestLen = txt.length;
    }
  }
  return best;
}

interface BlockRender {
  text: string;
  rect: { x: number; y: number; w: number; h: number };
  style: EditableBlock["style"];
  kind: EditableBlock["kind"];
}

function blockFromElement(el: HTMLElement, doc: Document, kind: EditableBlock["kind"]): BlockRender | null {
  const win = doc.defaultView;
  if (!win) return null;
  const cs = win.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (r.width < 20 || r.height < 10) return null;
  const fontSizePx = parseFloat(cs.fontSize) || 24;
  const weight = parseInt(cs.fontWeight, 10) || 400;
  return {
    text: (el.textContent || "").trim(),
    rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    style: {
      color: cs.color || "#FFFFFF",
      fontFamily: cs.fontFamily || "",
      fontSizePx,
      fontWeight: weight,
      fontStyle: cs.fontStyle || "normal",
      textAlign:
        cs.textAlign === "center" || cs.textAlign === "right" || cs.textAlign === "left"
          ? (cs.textAlign as "left" | "center" | "right")
          : "left",
      textTransform: cs.textTransform || "none",
      lineHeight: parseFloat(cs.lineHeight) || fontSizePx * 1.25,
      letterSpacingPx: parseFloat(cs.letterSpacing) || 0,
    },
    kind,
  };
}

function applyTextTransform(text: string, transform: string): string {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}

/**
 * Détecte les zones photo dans le HTML d'une slide.
 *
 * Strategy A (priorité) : éléments annotés [data-pptx-photo="N"] par Sonnet.
 * Strategy B (fallback) : détection défensive sur <img src="data:image/..."> et
 *   éléments avec background-image: url(data:image/...). photoIndex = ordre
 *   d'apparition (1-indexé).
 *
 * Ne masque PAS les éléments — c'est à l'appelant de gérer le cycle
 * masquage / capture / unmask en fonction de la disponibilité des
 * originalPhotos correspondants.
 */
function extractPhotoZones(doc: Document): PhotoZone[] {
  const win = doc.defaultView;
  if (!win) return [];

  const zones: PhotoZone[] = [];
  const seen = new Set<HTMLElement>();

  const pushZone = (el: HTMLElement, photoIndex: number, type: "img" | "background") => {
    if (seen.has(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    if (r.y > SLIDE_H_PX || r.x > SLIDE_W_PX) return;
    if (r.y + r.height < 0 || r.x + r.width < 0) return;
    seen.add(el);
    zones.push({
      el,
      photoIndex,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      type,
    });
  };

  // Strategy A — annotations explicites Sonnet
  const annotated = Array.from(doc.querySelectorAll<HTMLElement>("[data-pptx-photo]"));
  if (annotated.length > 0) {
    // Garde-fou P3 : warn si même photoIndex apparaît 2× sur la même slide
    const indexCounts = new Map<number, number>();
    for (const el of annotated) {
      const raw = el.getAttribute("data-pptx-photo");
      const idx = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isInteger(idx) || idx < 1) {
        console.warn(`[hybrid] data-pptx-photo invalide: "${raw}", ignoré`);
        continue;
      }
      indexCounts.set(idx, (indexCounts.get(idx) || 0) + 1);
      const isImg = el.tagName === "IMG";
      pushZone(el, idx, isImg ? "img" : "background");
    }
    for (const [idx, count] of indexCounts) {
      if (count > 1) {
        console.warn(
          `[hybrid] photoIndex ${idx} annoté ${count} fois sur la même slide — la photo sera insérée plusieurs fois`,
        );
      }
    }
    return zones;
  }

  // Strategy B (fallback) — détection défensive
  let autoIndex = 1;

  // <img> base64
  const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imgs) {
    const src = img.getAttribute("src") || "";
    if (!src.startsWith("data:image/")) continue;
    pushZone(img, autoIndex++, "img");
  }

  // background-image: url(data:image/...)
  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));
  for (const el of all) {
    if (seen.has(el)) continue;
    const cs = win.getComputedStyle(el);
    const bg = cs.backgroundImage || "";
    if (!/url\(["']?data:image\//i.test(bg)) continue;
    pushZone(el, autoIndex++, "background");
  }

  return zones;
}

function addBlockToSlide(
  slide: PptxGenJS.Slide,
  block: BlockRender,
  charter: HybridCharter | null | undefined,
) {
  const x = pxToInches(block.rect.x, PX_PER_IN);
  const y = pxToInches(block.rect.y, PX_PER_IN);
  const w = pxToInches(block.rect.w, PX_PER_IN);
  // Marge de sécurité proportionnelle à la taille de police (≈ demi-ligne),
  // plancher 0.15" — absorbe les écarts de wrapping HTML vs PowerPoint
  // (métriques de fonts, kerning, arrondis lineSpacing/charSpacing).
  const safetyMargin = Math.max(
    0.15,
    pxToInches(block.style.fontSizePx, PX_PER_IN) * 0.5,
  );
  const h = Math.min(
    PPTX_H_IN - y,
    pxToInches(block.rect.h, PX_PER_IN) + safetyMargin,
  );

  const isTitleish = block.kind === "title" || block.kind === "overlay";
  const fontFace = mapFontToPptx(
    block.style.fontFamily || (isTitleish ? charter?.font_title : charter?.font_body),
  );
  const fontSize = fontSizePxToPt(block.style.fontSizePx, PX_PER_IN);
  const charterTextFallback = normalizeHex(charter?.color_text, "FFFFFF");
  const color = normalizeHex(block.style.color, charterTextFallback);
  const charSpacing = letterSpacingPxToCharSpacing(block.style.letterSpacingPx, PX_PER_IN);

  slide.addText(applyTextTransform(block.text, block.style.textTransform), {
    x,
    y,
    w,
    h,
    fontFace,
    fontSize,
    bold: block.style.fontWeight >= 600,
    italic: block.style.fontStyle === "italic",
    color,
    align: block.style.textAlign,
    valign: "top",
    wrap: true,
    margin: 0,
    charSpacing: charSpacing || undefined,
    lineSpacingMultiple: Math.max(0.9, Math.min(1.6, block.style.lineHeight / Math.max(1, block.style.fontSizePx))),
  });
}

// ---------------------------------------------------------------------------
// main export
// ---------------------------------------------------------------------------

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

  for (let i = 0; i < visualSlides.length; i++) {
    const vs = visualSlides[i];
    const data = slidesData?.find((s) => s.slide_number === vs.slide_number) || slidesData?.[i];
    const slide = pptx.addSlide();

    const iframe = await mountIframe(vs.html);
    try {
      await waitReady(iframe);
      const doc = iframe.contentDocument!;
      const win = doc.defaultView!;

      const blocks: BlockRender[] = [];

      // ---- Strategy A (priority): explicit [data-pptx-editable] annotations
      const annotated = extractAnnotatedBlocks(doc);
      if (annotated.length > 0) {
        for (const ab of annotated) {
          if (ab.rect.y > SLIDE_H_PX || ab.rect.x > SLIDE_W_PX) continue;
          if (ab.rect.y + ab.rect.h < 0) continue;
          blocks.push({ text: ab.text, rect: ab.rect, style: ab.style, kind: ab.kind });
          (ab.el as HTMLElement).setAttribute("data-pptx-hide", "true");
        }
      } else {
        // ---- Strategy B (fallback) : short overlay_text on photo slides
        const overlayText = (data?.overlay_text || "").trim();
        if (overlayText && overlayText.length <= 200) {
          const el = findOverlayElement(doc, overlayText);
          if (el) {
            const blk = blockFromElement(el, doc, "overlay");
            if (blk) {
              blk.text = overlayText;
              blocks.push(blk);
              el.setAttribute("data-pptx-hide", "true");
            }
          }
        } else {
          // ---- Strategy C (fallback) : heuristic detection
          const detected = extractEditableBlocks(doc, {
            minFontPx: 20,
            minTextLen: 3,
            maxBlocks: 8,
          });
          for (const eb of detected) {
            if (eb.rect.y > SLIDE_H_PX || eb.rect.x > SLIDE_W_PX) continue;
            if (eb.rect.y + eb.rect.h < 0) continue;
            blocks.push({ text: eb.text, rect: eb.rect, style: eb.style, kind: eb.kind });
            (eb.el as HTMLElement).setAttribute("data-pptx-hide", "true");
          }
        }
      }

      // Force layout flush after hiding
      void win.document.body.offsetHeight;
      await new Promise((r) => setTimeout(r, 50));

      const bg = await captureBody(doc);
      slide.addImage({ data: bg, x: 0, y: 0, w: PPTX_W_IN, h: PPTX_H_IN });

      for (const b of blocks) {
        try {
          addBlockToSlide(slide, b, charter);
        } catch (e) {
          console.warn("[hybrid] addBlockToSlide failed", e);
        }
      }
    } catch (e) {
      console.error("[hybrid] slide capture failed", e);
      slide.background = { color: normalizeHex(charter?.color_background, "FFFFFF") };
    } finally {
      iframe.remove();
    }
  }

  await pptx.writeFile({ fileName: fileName + ".pptx" });
}
