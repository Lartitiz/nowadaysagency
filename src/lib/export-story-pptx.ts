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

/**
 * Fragments LIGNE d'un span inline (box-decoration-break:clone) : le rect de
 * chaque ligne (getClientRects, padding inclus) apparié au TEXTE de la ligne
 * (marche caractère par caractère, rupture détectée au changement de `top`).
 * Rend [] si l'appariement échoue → l'appelant retombe sur le pavé englobant.
 */
function lineFragmentsOf(el: HTMLElement, doc: Document): { rect: DOMRect; text: string }[] {
  const rects = Array.from(el.getClientRects()).filter((r) => r.width >= 2 && r.height >= 2);
  if (rects.length <= 1) return [];
  const range = doc.createRange();
  const walker = doc.createTreeWalker(el, 4 /* SHOW_TEXT */);
  const lines: { top: number; text: string }[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const data = (node as Text).data;
    for (let i = 0; i < data.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) continue;
      const last = lines[lines.length - 1];
      if (last && Math.abs(r.top - last.top) < r.height * 0.6) last.text += data[i];
      else lines.push({ top: r.top, text: data[i] });
    }
  }
  if (lines.length !== rects.length) return [];
  return rects.map((rect, i) => ({ rect, text: lines[i].text.trim() }));
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
      const fill = rgbToHex(cs.backgroundColor, "FFFFFF");
      const textProps = {
        color: rgbToHex(cs.color, "2A2521"),
        fontFace: mapFontToPptx(cs.fontFamily),
        fontSize: fontSizePxToPt(fontSizePx, PX_PER_IN),
        bold: (parseInt(cs.fontWeight, 10) || 400) >= 600,
        italic: cs.fontStyle === "italic",
        align: "center" as const,
        valign: "middle" as const,
        margin: 6,
      };

      // La pastille inline se découpe ligne à ligne dans le rendu HTML
      // (box-decoration-break:clone). getClientRects() rend UN rect par ligne :
      // une seule ligne → forme+texte d'un tenant (comportement historique) ;
      // multi-lignes → une pilule NATIVE PAR LIGNE (le style Instagram était
      // perdu, remplacé par un pavé englobant — audit 10/07 CR-3) + le texte en
      // un bloc unique transparent par-dessus (éditable d'un tenant).
      const lineRects = Array.from(el.getClientRects()).filter((r) => r.width >= 2 && r.height >= 2);
      if (lineRects.length <= 1) {
        slide.addText(text, {
          shape: "roundRect",
          rectRadius: 0.1,
          x: pxToInches(rect.x, PX_PER_IN),
          y: pxToInches(rect.y, PX_PER_IN),
          w: pxToInches(rect.width, PX_PER_IN),
          h: pxToInches(rect.height, PX_PER_IN),
          fill: { color: fill },
          line: { type: "none" },
          ...textProps,
        });
      } else {
        const radiusPx = parseFloat(cs.borderRadius) || 18;
        const frags = lineFragmentsOf(el, doc);
        const centered = lineRects.every(
          (r) => Math.abs(r.x + r.width / 2 - (rect.x + rect.width / 2)) < 6,
        );
        if (frags.length === lineRects.length && frags.length > 0) {
          // UNE pilule + UN texte PAR LIGNE (wrap:false) : le texte suit sa
          // pilule quel que soit le wrap PowerPoint (une substitution de police
          // désalignait un bloc texte unique re-wrappé sur les pilules HTML —
          // mesuré à l'itération 1 du lot C). Pilule élargie de 12 % pour
          // absorber les métriques plus larges (esprit #420).
          for (let li = 0; li < frags.length; li++) {
            const r = frags[li].rect;
            const wMul = 1.12;
            const wIn = pxToInches(r.width, PX_PER_IN) * wMul;
            const xIn = pxToInches(r.x, PX_PER_IN) - (centered ? (wIn - pxToInches(r.width, PX_PER_IN)) / 2 : 0);
            const yIn = pxToInches(r.y, PX_PER_IN);
            const hIn = pxToInches(r.height, PX_PER_IN);
            let lineText = frags[li].text;
            if (cs.textTransform === "uppercase") lineText = lineText.toUpperCase();
            slide.addText(lineText, {
              shape: "roundRect",
              rectRadius: Math.min(pxToInches(radiusPx, PX_PER_IN), Math.min(wIn, hIn) / 2),
              x: Math.max(0, xIn),
              y: yIn,
              w: Math.min(wIn, PPTX_W_IN - Math.max(0, xIn)),
              h: hIn,
              fill: { color: fill },
              line: { type: "none" },
              ...textProps,
              wrap: false,
            });
          }
        } else {
          // Repli sûr (appariement lignes/texte impossible) : pavé englobant.
          slide.addText(text, {
            shape: "roundRect",
            rectRadius: 0.1,
            x: pxToInches(rect.x, PX_PER_IN),
            y: pxToInches(rect.y, PX_PER_IN),
            w: pxToInches(rect.width, PX_PER_IN),
            h: pxToInches(rect.height, PX_PER_IN),
            fill: { color: fill },
            line: { type: "none" },
            ...textProps,
            align: centered ? "center" : "left",
            lineSpacingMultiple: Math.max(
              0.9,
              Math.min(1.9, (parseFloat(cs.lineHeight) || fontSizePx * 1.72) / fontSizePx),
            ),
          });
        }
      }
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
