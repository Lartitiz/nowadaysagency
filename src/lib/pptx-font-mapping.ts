/**
 * Mapping helpers for PowerPoint export.
 *
 * - mapFontToPptx : convert a Google Font (used in the brand charter) into a
 *   safe font that PowerPoint will render correctly on Win/Mac.
 * - getOverlayCoords : convert an `overlay_position` string into PPTX coords
 *   (in inches, based on a 7.5 × 9.375 INSTAGRAM layout).
 */

const SERIF_FONTS = [
  "playfair display",
  "playfair",
  "lora",
  "merriweather",
  "libre baskerville",
  "cormorant",
  "cormorant garamond",
  "eb garamond",
  "garamond",
  "crimson text",
  "crimson pro",
  "source serif pro",
  "ptserif",
  "pt serif",
];

const MONO_FONTS = [
  "ibm plex mono",
  "consolas",
  "fira mono",
  "fira code",
  "jetbrains mono",
  "source code pro",
  "roboto mono",
  "courier new",
  "courier",
  "menlo",
];

const VERDANA_FONTS = ["montserrat", "raleway", "oswald", "bebas neue"];
const TREBUCHET_FONTS = ["poppins", "nunito", "quicksand", "comfortaa"];

/**
 * Map a CSS font-family value to a PowerPoint-safe font name.
 * The input can be a font-family stack (e.g. `"Playfair Display", serif`) or a single name.
 */
export function mapFontToPptx(fontFamily?: string | null): string {
  if (!fontFamily) return "Calibri";

  // Take only the first font in the stack
  const first = fontFamily
    .split(",")[0]
    .trim()
    .replace(/['"]/g, "")
    .toLowerCase();

  if (!first) return "Calibri";

  if (SERIF_FONTS.some((f) => first.includes(f))) return "Georgia";
  if (MONO_FONTS.some((f) => first.includes(f))) return "Consolas";
  if (VERDANA_FONTS.some((f) => first.includes(f))) return "Verdana";
  if (TREBUCHET_FONTS.some((f) => first.includes(f))) return "Trebuchet MS";

  // Sans-serif default
  return "Calibri";
}

export type OverlayPosition =
  | "bottom_left"
  | "bottom_center"
  | "bottom_right"
  | "top_left"
  | "top_center"
  | "top_right"
  | "center"
  | "middle";

export interface OverlayCoords {
  x: number;
  y: number;
  w: number;
  h: number;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
}

/**
 * Convert an overlay_position into PPTX coords (inches) for the
 * 7.5 × 9.375 INSTAGRAM layout used everywhere in the app.
 */
export function getOverlayCoords(
  position?: string | null,
  W = 7.5,
  H = 9.375,
): OverlayCoords {
  const p = (position || "bottom_center").toLowerCase();
  const PAD = 0.5;
  const TEXT_W = W - PAD * 2;
  const TEXT_H = 3.0;

  switch (p) {
    case "top_left":
      return { x: PAD, y: PAD, w: TEXT_W, h: TEXT_H, align: "left", valign: "top" };
    case "top_center":
      return { x: PAD, y: PAD, w: TEXT_W, h: TEXT_H, align: "center", valign: "top" };
    case "top_right":
      return { x: PAD, y: PAD, w: TEXT_W, h: TEXT_H, align: "right", valign: "top" };
    case "center":
    case "middle":
      return {
        x: PAD,
        y: (H - TEXT_H) / 2,
        w: TEXT_W,
        h: TEXT_H,
        align: "center",
        valign: "middle",
      };
    case "bottom_left":
      return {
        x: PAD,
        y: H - TEXT_H - PAD,
        w: TEXT_W,
        h: TEXT_H,
        align: "left",
        valign: "bottom",
      };
    case "bottom_right":
      return {
        x: PAD,
        y: H - TEXT_H - PAD,
        w: TEXT_W,
        h: TEXT_H,
        align: "right",
        valign: "bottom",
      };
    case "bottom_center":
    default:
      return {
        x: PAD,
        y: H - TEXT_H - PAD,
        w: TEXT_W,
        h: TEXT_H,
        align: "center",
        valign: "bottom",
      };
  }
}

/**
 * Compute a reasonable font size based on text length.
 * Tuned for the 7.5 × 9.375 layout (~3-line overlays).
 */
export function computeOverlayFontSize(text: string): number {
  const len = (text || "").length;
  if (len < 30) return 36;
  if (len < 60) return 30;
  if (len < 100) return 26;
  if (len < 160) return 22;
  return 18;
}

/** Strip the leading "#" so PptxGenJS gets a 6-char hex string. */
export function normalizeHex(color?: string | null, fallback = "FFFFFF"): string {
  if (!color) return fallback;
  let c = color.trim();
  // rgb(r,g,b) or rgba(r,g,b,a)
  const rgbMatch = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)));
    return [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  c = c.replace("#", "");
  if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
  return c.padEnd(6, "0").slice(0, 6).toUpperCase();
}

/** Convert pixels (in the captured iframe coord system) to inches at the given ratio. */
export function pxToInches(px: number, pxPerInch: number): number {
  return Math.max(0, px / pxPerInch);
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Hex 6 chars sans `#` (déjà normalisé). Undefined = hérite du frame. */
  color?: string;
  /** Poids brut (info / debug). pptxgenjs utilise `bold`. */
  fontWeight?: number;
}

export interface EditableBlock {
  el: Element;
  text: string;
  /**
   * Runs typographiques inline (italic/bold/color via <span>, <em>, <strong>...).
   * Présent UNIQUEMENT si le bloc contient au moins un override par rapport au
   * style du frame. Sinon undefined → l'exporter utilise le chemin "texte plat".
   */
  runs?: TextRun[];
  rect: { x: number; y: number; w: number; h: number };
  style: {
    color: string;
    fontFamily: string;
    fontSizePx: number;
    fontWeight: number;
    fontStyle: string;
    textAlign: "left" | "center" | "right";
    textTransform: string;
    lineHeight: number;
    letterSpacingPx: number;
  };
  kind: "title" | "body" | "overlay" | "caption";
}

function parseAlign(v: string): "left" | "center" | "right" {
  if (v === "center" || v === "right" || v === "left") return v;
  if (v === "start") return "left";
  if (v === "end") return "right";
  return "left";
}

function parseFontWeight(v: string): number {
  const n = parseInt(v, 10);
  if (!isNaN(n)) return n;
  if (v === "bold" || v === "bolder") return 700;
  return 400;
}

/**
 * Walk the document and detect text blocks worth making editable in PPTX.
 * Heuristic: leaf-ish elements (no element children OR only inline children)
 * with non-trivial text, font-size >= minFontPx OR bold OR semantic (h1/h2/h3).
 */
export function extractEditableBlocks(
  doc: Document,
  opts: { minFontPx?: number; minTextLen?: number; maxBlocks?: number; skipAnnotated?: boolean } = {},
): EditableBlock[] {
  const minFontPx = opts.minFontPx ?? 18;
  const minTextLen = opts.minTextLen ?? 3;
  const maxBlocks = opts.maxBlocks ?? 12;
  const skipAnnotated = opts.skipAnnotated ?? true;
  const win = doc.defaultView;
  if (!win) return [];

  const candidates: EditableBlock[] = [];
  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));

  for (const el of all) {
    const text = (el.textContent || "").trim();
    if (text.length < minTextLen) continue;

    // Skip nodes already covered by an annotated ancestor (avoid double-render)
    if (skipAnnotated && el.closest("[data-pptx-editable]")) continue;

    // Skip if any child is itself a text-bearing element (we want leaf-ish blocks)
    const hasBlockChild = Array.from(el.children).some((c) => {
      const cd = win.getComputedStyle(c as HTMLElement).display;
      return cd && cd !== "inline" && cd !== "inline-block" && (c.textContent || "").trim().length > 0;
    });
    if (hasBlockChild) continue;

    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity || "1") < 0.05) continue;

    const fontSizePx = parseFloat(cs.fontSize) || 0;
    const weight = parseFontWeight(cs.fontWeight);
    const tag = el.tagName.toLowerCase();
    const isSemantic = ["h1", "h2", "h3", "h4"].includes(tag);
    const isBold = weight >= 600;

    if (!isSemantic && !isBold && fontSizePx < minFontPx) continue;

    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) continue;

    let kind: EditableBlock["kind"] = "body";
    if (isSemantic || fontSizePx >= 36) kind = "title";
    if (text.length < 60 && fontSizePx >= 28) kind = "overlay";

    candidates.push({
      el,
      text,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      style: {
        color: cs.color || "#FFFFFF",
        fontFamily: cs.fontFamily || "",
        fontSizePx,
        fontWeight: weight,
        fontStyle: cs.fontStyle || "normal",
        textAlign: parseAlign(cs.textAlign || "left"),
        textTransform: cs.textTransform || "none",
        lineHeight: parseFloat(cs.lineHeight) || fontSizePx * 1.25,
        letterSpacingPx: parseFloat(cs.letterSpacing) || 0,
      },
      kind,
    });
  }

  // Drop ancestors when a descendant is also a candidate (avoid double-rendering)
  const filtered = candidates.filter(
    (c) => !candidates.some((other) => other !== c && c.el.contains(other.el)),
  );

  // Sort by visual order (top to bottom) and cap
  filtered.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return filtered.slice(0, maxBlocks);
}

/**
 * Read explicit `[data-pptx-editable="title|body|overlay|caption"]` blocks.
 * This is the source of truth when the HTML generator opted in to annotation.
 */
export function extractAnnotatedBlocks(doc: Document): EditableBlock[] {
  const win = doc.defaultView;
  if (!win) return [];
  const nodes = Array.from(doc.body.querySelectorAll<HTMLElement>("[data-pptx-editable]"));
  const blocks: EditableBlock[] = [];
  for (const el of nodes) {
    const text = (el.textContent || "").trim();
    if (!text) continue;
    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) continue;
    const fontSizePx = parseFloat(cs.fontSize) || 16;
    const rawKind = (el.getAttribute("data-pptx-editable") || "body").toLowerCase();
    const kind: EditableBlock["kind"] =
      rawKind === "title" || rawKind === "overlay" || rawKind === "caption" ? rawKind : "body";
    blocks.push({
      el,
      text,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      style: {
        color: cs.color || "#FFFFFF",
        fontFamily: cs.fontFamily || "",
        fontSizePx,
        fontWeight: parseFontWeight(cs.fontWeight),
        fontStyle: cs.fontStyle || "normal",
        textAlign: parseAlign(cs.textAlign || "left"),
        textTransform: cs.textTransform || "none",
        lineHeight: parseFloat(cs.lineHeight) || fontSizePx * 1.25,
        letterSpacingPx: parseFloat(cs.letterSpacing) || 0,
      },
      kind,
    });
  }
  // Drop ancestors when a descendant is also annotated
  return blocks.filter(
    (b) => !blocks.some((other) => other !== b && b.el.contains(other.el)),
  );
}

/** Convert CSS px font-size into PPTX point size for a 1080px wide -> 7.5in slide. */
export function fontSizePxToPt(px: number, pxPerInch: number): number {
  // PPTX uses 72pt/inch. 0.94 factor matches the visual size of the captured background.
  const inches = px / pxPerInch;
  return Math.max(8, Math.round(inches * 72 * 0.94));
}

/** Convert CSS letter-spacing (px) to pptxgenjs `charSpacing` (integer points). */
export function letterSpacingPxToCharSpacing(px: number, pxPerInch: number): number {
  if (!px || Math.abs(px) < 0.1) return 0;
  const points = (px / pxPerInch) * 72;
  return Math.round(points);
}

