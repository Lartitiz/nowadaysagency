import { type EditableBlock } from "../pptx-font-mapping";
import { type BlockRender } from "./types";

// ---------------------------------------------------------------------------
// overlay slide (fallback) : photo + overlay_text court
// ---------------------------------------------------------------------------

/** Find the smallest element whose textContent contains the overlay text. */
export function findOverlayElement(doc: Document, overlayText: string): HTMLElement | null {
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

export function blockFromElement(el: HTMLElement, doc: Document, kind: EditableBlock["kind"]): BlockRender | null {
  const win = doc.defaultView;
  if (!win) return null;
  const cs = win.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (r.width < 20 || r.height < 10) return null;
  const fontSizePx = parseFloat(cs.fontSize) || 24;
  const weight = parseInt(cs.fontWeight, 10) || 400;
  return {
    el,
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

export function applyTextTransform(text: string, transform: string): string {
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
