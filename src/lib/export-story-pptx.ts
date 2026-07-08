// Export PPTX des stories (1080×1920) — 100 % natif, zéro rasterisation.
//
// Contrairement au PPTX hybride des carrousels (HTML généré par l'IA → extraction
// + fond rasterisé), les frames de stories sortent d'un renderer déterministe :
// on monte le HTML dans une iframe, on MESURE les pastilles annotées
// [data-story-pptx] (position, taille, couleurs, typo calculées par le vrai
// moteur de rendu), et on écrit des formes/textes PPTX natifs — donc tout est
// éditable dans PowerPoint et dans Canva (pont social-canva-import).

import PptxGenJS from "pptxgenjs";
import {
  mapFontToPptx,
  normalizeHex,
  pxToInches,
  fontSizePxToPt,
} from "./pptx-font-mapping";

const W_PX = 1080;
const H_PX = 1920;
const PPTX_W_IN = 7.5;
const PPTX_H_IN = PPTX_W_IN * (H_PX / W_PX); // 13.333 — ratio 9:16 exact
const PX_PER_IN = W_PX / PPTX_W_IN; // 144

interface StoryFrame {
  story_number: number;
  html: string;
  /** Photo de fond DE CETTE story (data: ou https) — prioritaire sur opts.photoUrl. */
  photoUrl?: string | null;
}

export interface StoryPptxOptions {
  fileName?: string;
  /** Photo de fond globale (héritage : une seule photo pour toute la séquence). */
  photoUrl?: string | null;
  /** true : renvoie le Blob (pont Canva) au lieu de télécharger. */
  returnBlob?: boolean;
}

function rgbToHex(rgb: string, fallback: string): string {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return normalizeHex(rgb, fallback);
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return fallback;
  return [m[1], m[2], m[3]]
    .map((c) => parseInt(c, 10).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function mountFrame(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${W_PX}px;height:${H_PX}px;border:0;z-index:-1;pointer-events:none;`;
  iframe.setAttribute("aria-hidden", "true");
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8" />
<style>html,body{margin:0;padding:0;width:${W_PX}px;height:${H_PX}px;overflow:hidden}*,*::before,*::after{box-sizing:border-box}</style>
</head><body>${html}</body></html>`;
  document.body.appendChild(iframe);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("iframe load timeout")), 8000);
    iframe.addEventListener("load", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
  const doc = iframe.contentDocument;
  if (doc) {
    try {
      await Promise.race([
        (doc as any).fonts?.ready,
        new Promise((r) => setTimeout(r, 4000)),
      ]);
    } catch {
      /* noop */
    }
  }
  // Course rAF/timeout : un onglet caché ne déclenche jamais rAF (même piège
  // que l'export PNG, corrigé par #357).
  await Promise.race([
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    new Promise<void>((r) => setTimeout(r, 500)),
  ]);
  return iframe;
}

/** Écrit une frame dans une slide : fond (couleur ou photo) + pastilles natives. */
async function renderFrameToSlide(
  slide: PptxGenJS.Slide,
  html: string,
  photoUrl: string | null | undefined,
): Promise<void> {
  const iframe = await mountFrame(html);
  try {
    const doc = iframe.contentDocument!;
    const win = doc.defaultView!;
    const root = doc.querySelector("[data-story-frame]") as HTMLElement | null;

    // ── Fond ──
    const rootStyle = root ? win.getComputedStyle(root) : null;
    const hasPhotoBg = !!(rootStyle && rootStyle.backgroundImage && rootStyle.backgroundImage !== "none");
    if (hasPhotoBg && photoUrl) {
      const imgProps: Record<string, unknown> = {
        x: 0,
        y: 0,
        w: PPTX_W_IN,
        h: PPTX_H_IN,
        sizing: { type: "cover", w: PPTX_W_IN, h: PPTX_H_IN },
      };
      if (photoUrl.startsWith("data:")) imgProps.data = photoUrl;
      else imgProps.path = photoUrl;
      slide.addImage(imgProps as any);
    } else {
      slide.background = {
        color: rootStyle ? rgbToHex(rootStyle.backgroundColor, "FFFFFF") : "FFFFFF",
      };
    }

    // ── Pastilles ──
    const pills = Array.from(doc.querySelectorAll<HTMLElement>("[data-story-pptx]"));
    for (const el of pills) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      // Zone sticker export : les pastilles y sont en visibility:hidden — on les saute.
      if (el.closest("[data-story-sticker-zone]")) continue;

      const cs = win.getComputedStyle(el);
      let text = el.textContent || "";
      if (cs.textTransform === "uppercase") text = text.toUpperCase();

      const fontSizePx = parseFloat(cs.fontSize) || 44;
      // La pastille inline se découpe ligne à ligne dans le rendu HTML ; en PPTX
      // on pose UNE forme arrondie englobante — même encombrement, texte centré.
      slide.addText(text, {
        shape: "roundRect",
        rectRadius: 0.1,
        x: pxToInches(rect.x, PX_PER_IN),
        y: pxToInches(rect.y, PX_PER_IN),
        w: pxToInches(rect.width, PX_PER_IN),
        h: pxToInches(rect.height, PX_PER_IN),
        fill: { color: rgbToHex(cs.backgroundColor, "FFFFFF") },
        color: rgbToHex(cs.color, "2A2521"),
        fontFace: mapFontToPptx(cs.fontFamily),
        fontSize: fontSizePxToPt(fontSizePx, PX_PER_IN),
        bold: (parseInt(cs.fontWeight, 10) || 400) >= 600,
        italic: cs.fontStyle === "italic",
        align: "center",
        valign: "middle",
        margin: 6,
        line: { type: "none" },
      });
    }
  } finally {
    iframe.remove();
  }
}

/**
 * Exporte les frames de stories en PPTX natif éditable (9:16).
 * - returnBlob: false (défaut) → téléchargement direct
 * - returnBlob: true → Blob pour le pont Canva (useOpenInCanva)
 */
export async function exportStoryPptx(
  frames: StoryFrame[],
  opts: StoryPptxOptions = {},
): Promise<Blob | void> {
  if (!frames || frames.length === 0) return;

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "STORY_9_16", width: PPTX_W_IN, height: PPTX_H_IN });
  pptx.layout = "STORY_9_16";
  pptx.author = "L'Assistant Com'";

  for (const f of frames) {
    const slide = pptx.addSlide();
    await renderFrameToSlide(slide, f.html, f.photoUrl ?? opts.photoUrl);
  }

  if (opts.returnBlob) {
    return (await pptx.write({ outputType: "blob" })) as Blob;
  }
  const safe = (opts.fileName || "stories").replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\-_.]/g, "-");
  await pptx.writeFile({ fileName: `stories-${safe}.pptx` });
}
