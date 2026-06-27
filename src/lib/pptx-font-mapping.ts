/**
 * Mapping helpers for PowerPoint export.
 *
 * - mapFontToPptx : convert a Google Font (used in the brand charter) into a
 *   safe font that PowerPoint will render correctly on Win/Mac.
 * - getOverlayCoords : convert an `overlay_position` string into PPTX coords
 *   (in inches, based on a 7.5 × 9.375 INSTAGRAM layout).
 */

const GENERIC_FONT_MAP: Record<string, string> = {
  "serif": "Georgia",
  "sans-serif": "Calibri",
  "system-ui": "Calibri",
  "ui-sans-serif": "Calibri",
  "monospace": "Consolas",
  "ui-monospace": "Consolas",
  "cursive": "Calibri",
  "fantasy": "Calibri",
};

/**
 * Retourne le vrai nom de la première police de la stack CSS, casse préservée,
 * pour que Canva le matche dans sa bibliothèque à l'import du PPTX (Canva
 * contient quasi toutes les Google Fonts). PowerPoint desktop substituera
 * silencieusement si la police n'est pas installée localement.
 *
 * - Stack vide / null → "Calibri" (fallback).
 * - Mot-clé CSS générique (serif, sans-serif, monospace, …) → police système
 *   équivalente, car un mot-clé générique n'est pas un nom de police PPTX valide.
 * - Sinon → premier nom de la stack, quotes retirées, casse préservée.
 */
export function mapFontToPptx(fontFamily?: string | null): string {
  if (!fontFamily) return "Calibri";

  const first = fontFamily
    .split(",")[0]
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();

  if (!first) return "Calibri";

  const generic = GENERIC_FONT_MAP[first.toLowerCase()];
  if (generic) return generic;

  return first;
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

/**
 * Rect du content-box d'un élément (border-box moins le padding computed).
 * C'est la zone réelle du texte dans le navigateur — l'utiliser pour les
 * frames texte PPTX évite que le texte se cale dans le padding (pilules, badges).
 */
function contentBoxRect(el: HTMLElement, cs: CSSStyleDeclaration) {
  const r = el.getBoundingClientRect();
  const pl = parseFloat(cs.paddingLeft) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const pt = parseFloat(cs.paddingTop) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  return {
    x: r.left + pl,
    y: r.top + pt,
    w: Math.max(1, r.width - pl - pr),
    h: Math.max(1, r.height - pt - pb),
  };
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
    const text = textContentWithBreaks(el).trim();
    if (text.length < minTextLen) continue;

    // Emoji ISOLÉ (le texte n'est QUE des emojis) : ne pas l'exporter en texte natif.
    // Canva rastérise un texte-emoji isolé à l'import (= image non éditable). Ces
    // éléments sont gérés à part par extractStandaloneEmojiZones → image détourée
    // déplaçable. Les emojis COLLÉS à du texte ("❌ Marque lisse") ne sont PAS isolés
    // → ils restent ici en texte éditable (Canva les conserve).
    if (isEmojiOnly(text)) continue;

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
    const rect = contentBoxRect(el, cs);

    let kind: EditableBlock["kind"] = "body";
    if (isSemantic || fontSizePx >= 36) kind = "title";
    if (text.length < 60 && fontSizePx >= 28) kind = "overlay";

    candidates.push({
      el,
      text,
      rect,
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
    const text = textContentWithBreaks(el).trim();
    if (!text) continue;
    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) continue;
    const fontSizePx = parseFloat(cs.fontSize) || 16;
    const rawKind = (el.getAttribute("data-pptx-editable") || "body").toLowerCase();
    const kind: EditableBlock["kind"] =
      rawKind === "title" || rawKind === "overlay" || rawKind === "caption" ? rawKind : "body";

    const frameColor = normalizeHex(cs.color, "FFFFFF");
    const frameWeight = parseFontWeight(cs.fontWeight);
    const frameItalic = (cs.fontStyle || "normal") === "italic";
    const frameBold = frameWeight >= 600;

    const runs = extractRunsFromElement(el, win, {
      frameColor,
      frameBold,
      frameItalic,
    });

    blocks.push({
      el,
      text,
      runs,
      rect: contentBoxRect(el, cs),
      style: {
        color: cs.color || "#FFFFFF",
        fontFamily: cs.fontFamily || "",
        fontSizePx,
        fontWeight: frameWeight,
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

const MAX_RUNS_PER_BLOCK = 12;

interface FrameStyle {
  frameColor: string;
  frameBold: boolean;
  frameItalic: boolean;
}

/**
 * Walk all text descendants of `root` and produce typographic runs.
 * Returns `undefined` if all runs are uniform with the frame style
 * (so the exporter can keep its fast "flat text" path) or if the
 * extraction safety cap is hit.
 */
function extractRunsFromElement(
  root: HTMLElement,
  win: Window,
  frame: FrameStyle,
): TextRun[] | undefined {
  const walker = doc_treeWalker(root);
  if (!walker) {
    // Fallback flat path: still honour <br> as newlines
    const flat = textContentWithBreaks(root).trim().replace(/\n+$/g, "");
    if (!flat) return undefined;
    return undefined;
  }

  const raw: TextRun[] = [];
  let node: Node | null = walker.nextNode();
  while (node) {
    // <br> → append "\n" to the last collected run (ignore if leading)
    if (node.nodeType === 1 /* ELEMENT_NODE */) {
      const el = node as Element;
      if (el.tagName === "BR" && raw.length > 0) {
        const last = raw[raw.length - 1];
        last.text = last.text + "\n";
      }
      node = walker.nextNode();
      continue;
    }

    const txt = node.nodeValue || "";
    if (txt.length > 0) {
      const parent = node.parentElement;
      if (parent) {
        const cs = win.getComputedStyle(parent);
        // Skip hidden parents
        if (cs.visibility !== "hidden" && cs.display !== "none") {
          const weight = parseFontWeight(cs.fontWeight);
          const isBold =
            weight >= 600 ||
            !!parent.closest("strong,b");
          const isItalic =
            (cs.fontStyle || "normal") === "italic" ||
            !!parent.closest("em,i");
          const color = normalizeHex(cs.color, frame.frameColor);

          raw.push({
            text: txt,
            bold: isBold,
            italic: isItalic,
            color,
            fontWeight: weight,
          });
        }
      }
    }
    node = walker.nextNode();
  }

  if (raw.length === 0) return undefined;

  // 1. Trim leading/trailing whitespace-only runs
  while (raw.length > 0 && raw[0].text.trim() === "") raw.shift();
  while (raw.length > 0 && raw[raw.length - 1].text.trim() === "") raw.pop();
  if (raw.length === 0) return undefined;

  // 1b. Strip trailing "\n" from last run (trailing <br>)
  if (raw.length > 0) {
    raw[raw.length - 1].text = raw[raw.length - 1].text.replace(/\n+$/g, "");
  }

  // 2. Normalize internal whitespace runs: merge whitespace-only run with
  //    its previous neighbor (so its style doesn't matter visually).
  const cleaned: TextRun[] = [];
  for (const r of raw) {
    if (r.text.trim() === "" && cleaned.length > 0) {
      cleaned[cleaned.length - 1] = {
        ...cleaned[cleaned.length - 1],
        text: cleaned[cleaned.length - 1].text + r.text,
      };
    } else {
      cleaned.push(r);
    }
  }

  // 3. Coalesce adjacent runs with identical style
  const coalesced: TextRun[] = [];
  for (const r of cleaned) {
    const prev = coalesced[coalesced.length - 1];
    if (
      prev &&
      !!prev.bold === !!r.bold &&
      !!prev.italic === !!r.italic &&
      (prev.color || "") === (r.color || "")
    ) {
      prev.text += r.text;
    } else {
      coalesced.push({ ...r });
    }
  }

  // 4. Safety cap → fallback to flat text path
  if (coalesced.length > MAX_RUNS_PER_BLOCK) {
    console.warn(
      `[pptx] extractRunsFromElement: ${coalesced.length} runs (>${MAX_RUNS_PER_BLOCK}), fallback to flat text`,
    );
    return undefined;
  }

  // 5. If everything matches the frame style → no runs needed
  const allMatchFrame = coalesced.every(
    (r) =>
      !!r.bold === frame.frameBold &&
      !!r.italic === frame.frameItalic &&
      (r.color || "") === frame.frameColor,
  );
  if (allMatchFrame) return undefined;

  // 6. Strip redundant attrs vs frame so addText only overrides what differs
  return coalesced.map((r) => {
    const out: TextRun = { text: r.text };
    if (!!r.bold !== frame.frameBold) out.bold = !!r.bold;
    if (!!r.italic !== frame.frameItalic) out.italic = !!r.italic;
    if ((r.color || "") !== frame.frameColor) out.color = r.color;
    if (r.fontWeight !== undefined) out.fontWeight = r.fontWeight;
    return out;
  });
}

function doc_treeWalker(root: HTMLElement): TreeWalker | null {
  const ownerDoc = root.ownerDocument;
  if (!ownerDoc || typeof ownerDoc.createTreeWalker !== "function") return null;
  // NodeFilter.SHOW_ELEMENT (1) | SHOW_TEXT (4) = 5
  return ownerDoc.createTreeWalker(root, 5);
}

/**
 * Like `el.textContent`, but converts `<br>` into a literal "\n" so that
 * intentional line breaks survive into the PPTX text path.
 */
function textContentWithBreaks(el: Element): string {
  let out = "";
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1 /* ELEMENT_NODE */) {
        const ce = child as Element;
        if (ce.tagName === "BR") {
          out += "\n";
        } else {
          walk(ce);
        }
      } else if (child.nodeType === 3 /* TEXT_NODE */) {
        out += child.nodeValue || "";
      }
    }
  };
  walk(el);
  return out;
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

// ---------------------------------------------------------------------------
// Structural shapes extraction (Strategy D — for editable PPTX shapes)
// ---------------------------------------------------------------------------

/**
 * Bloc structurel à rendre comme shape pptxgenjs natif (roundRect)
 * dans le pipeline hybride C2. Annoté par Sonnet via data-pptx-shape="...".
 */
export interface ShapeBlock {
  el: Element;
  type: "background" | "card" | "pill" | "highlight";
  rect: { x: number; y: number; w: number; h: number };
  /** Hex 6 chars normalisé sans `#`. */
  fill: string;
  /** Border-radius en px (top-left si shorthand asymétrique). */
  borderRadiusPx: number;
  /**
   * Ombre native pptxgenjs si la box-shadow CSS est convertible.
   * Si absent → pas d'ombre (ou ombre complexe non supportée).
   */
  shadow?: {
    blurPt: number;
    offsetPt: number;
    angle: number;
    color: string;
    opacity: number;
  };
  /**
   * Bordure native pptxgenjs si la bordure CSS est uniforme sur les 4 côtés
   * et de style solid/dashed/dotted. Absent → pas de bordure native.
   */
  border?: {
    widthPt: number;
    color: string;
    dashType: "solid" | "dash" | "sysDot";
  };
}


/**
 * Parse une box-shadow CSS simple en paramètres pptxgenjs.
 * Retourne null si l'ombre est inset, multiple, a un spread non nul, ou si
 * la couleur n'est pas extractible.
 *
 * Conversions : px → pt via 0.75 (96 px/in ÷ 72 pt/in). Angle = atan2(oy, ox)
 * en degrés normalisés 0-359. Blur plafonné à 100pt (limite pptxgenjs).
 */
function parseSimpleBoxShadow(raw: string): ShapeBlock["shadow"] | null {
  const value = raw.trim();
  if (!value || value === "none") return null;
  if (/\binset\b/i.test(value)) return null;

  // Rejeter les ombres multiples : une virgule HORS parenthèses sépare deux ombres.
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) return null;
  }

  // Extraire la couleur d'abord (rgba/rgb/hex) puis travailler sur le reste.
  let colorHex = "000000";
  let opacity = 1;
  let rest = value;

  const rgbaMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  const hexMatch = !rgbaMatch ? value.match(/#([0-9a-f]{3,8})\b/i) : null;
  if (rgbaMatch) {
    const r = Math.max(0, Math.min(255, parseInt(rgbaMatch[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgbaMatch[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgbaMatch[3], 10)));
    colorHex = [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    opacity = rgbaMatch[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(rgbaMatch[4]))) : 1;
    rest = value.replace(rgbaMatch[0], "").trim();
  } else if (hexMatch) {
    colorHex = normalizeHex(hexMatch[0], "000000");
    rest = value.replace(hexMatch[0], "").trim();
  } else {
    return null;
  }

  // Le reste doit être 2-4 longueurs en px : offsetX offsetY [blur [spread]]
  const lengths = rest.match(/-?\d*\.?\d+px/g);
  if (!lengths || lengths.length < 2 || lengths.length > 4) return null;
  const nums = lengths.map((s) => parseFloat(s));
  const [ox, oy, blur = 0, spread = 0] = nums;
  if (spread !== 0) return null;

  const PX_TO_PT = 0.75;
  const blurPt = Math.min(blur * PX_TO_PT, 100);
  const offsetPt = Math.hypot(ox, oy) * PX_TO_PT;
  let angle = 0;
  if (offsetPt >= 0.1) {
    angle = (Math.atan2(oy, ox) * 180) / Math.PI;
    angle = ((angle % 360) + 360) % 360;
  }

  return { blurPt, offsetPt, angle, color: colorHex, opacity };
}

/**
 * Parse une bordure CSS uniforme sur les 4 côtés en line pptxgenjs.
 *
 * - Retourne `undefined` si pas de bordure (les 4 widths à 0).
 * - Retourne `null` si bordure présente mais non convertible (asymétrique,
 *   style non supporté, couleur non extractible) → skip défensif.
 * - Retourne l'objet sinon. Style : solid → "solid", dashed → "dash",
 *   dotted → "sysDot". px → pt via 0.75.
 */
function parseUniformBorder(
  cs: CSSStyleDeclaration,
): ShapeBlock["border"] | null | undefined {
  const wT = parseFloat(cs.borderTopWidth || "0") || 0;
  const wR = parseFloat(cs.borderRightWidth || "0") || 0;
  const wB = parseFloat(cs.borderBottomWidth || "0") || 0;
  const wL = parseFloat(cs.borderLeftWidth || "0") || 0;
  if (wT === 0 && wR === 0 && wB === 0 && wL === 0) return undefined;

  // Uniformité width
  if (!(wT === wR && wR === wB && wB === wL)) return null;

  // Uniformité style + style supporté
  const sT = (cs.borderTopStyle || "none").toLowerCase();
  const sR = (cs.borderRightStyle || "none").toLowerCase();
  const sB = (cs.borderBottomStyle || "none").toLowerCase();
  const sL = (cs.borderLeftStyle || "none").toLowerCase();
  if (!(sT === sR && sR === sB && sB === sL)) return null;
  if (sT === "none" || sT === "hidden") return undefined;

  let dashType: "solid" | "dash" | "sysDot";
  if (sT === "solid") dashType = "solid";
  else if (sT === "dashed") dashType = "dash";
  else if (sT === "dotted") dashType = "sysDot";
  else return null;

  // Uniformité couleur
  const cT = cs.borderTopColor || "";
  const cR = cs.borderRightColor || "";
  const cB = cs.borderBottomColor || "";
  const cL = cs.borderLeftColor || "";
  if (!(cT === cR && cR === cB && cB === cL)) return null;
  if (!cT || cT === "transparent" || cT === "rgba(0, 0, 0, 0)") return null;

  const color = normalizeHex(cT, "000000");
  const widthPt = wT * 0.75;
  if (widthPt <= 0) return null;

  return { widthPt, color, dashType };
}

/**
 * Extrait les éléments annotés `data-pptx-shape` du document iframe rendu.
 * Skip silencieusement les cas non supportés par les shapes natifs (gradient,
 * transform, ombre complexe, fond transparent, élément trop petit).
 *
 * Les ombres CSS simples sont converties en ombres pptxgenjs natives.
 * Console.debug en cas de skip pour diagnostiquer le respect des règles par Opus.
 */
export function extractShapeBlocks(doc: Document): ShapeBlock[] {
  const win = doc.defaultView;
  if (!win) return [];
  const nodes = Array.from(doc.body.querySelectorAll<HTMLElement>("[data-pptx-shape]"));
  const blocks: ShapeBlock[] = [];
  for (const el of nodes) {

    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) continue;

    const rawType = (el.getAttribute("data-pptx-shape") || "card").toLowerCase();
    const type: ShapeBlock["type"] =
      rawType === "background" || rawType === "card" ||
      rawType === "pill" || rawType === "highlight" ? rawType : "card";

    // Skip défensif : conditions interdites par le prompt mais on ne fait pas confiance.
    const bgImage = cs.backgroundImage || "none";
    const hasGradient = /gradient\(/i.test(bgImage);
    const hasTransform = (cs.transform || "none") !== "none";
    if (hasGradient || hasTransform) {
      console.debug("[hybrid] shape skipped (unsupported style)", {
        type,
        reason: hasGradient ? "gradient" : "transform",
      });
      continue;
    }

    // Box-shadow : tenter la conversion native. Skip uniquement si non convertible.
    const rawShadow = cs.boxShadow || "none";
    let shadow: ShapeBlock["shadow"] | undefined = undefined;
    if (rawShadow !== "none") {
      const parsed = parseSimpleBoxShadow(rawShadow);
      if (!parsed) {
        console.debug("[hybrid] shape skipped (unsupported shadow)", { type, raw: rawShadow });
        continue;
      }
      shadow = parsed;
    }

    // Bordure : tenter la conversion native uniforme. Skip si non convertible.
    const borderParsed = parseUniformBorder(cs);
    if (borderParsed === null) {
      console.debug("[hybrid] shape skipped (unsupported border)", { type });
      continue;
    }
    const border = borderParsed; // undefined si pas de bordure, sinon objet

    const bgColor = cs.backgroundColor || "transparent";
    if (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") {
      console.debug("[hybrid] shape skipped (transparent fill)", { type });
      continue;
    }

    // borderTopLeftRadius est toujours défini en computed style (même si shorthand asymétrique).
    const borderRadiusStr = cs.borderTopLeftRadius || cs.borderRadius || "0px";
    const borderRadiusPx = parseFloat(borderRadiusStr) || 0;

    blocks.push({
      el,
      type,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      fill: normalizeHex(bgColor, "FFFFFF"),
      borderRadiusPx,
      shadow,
      border,
    });

  }
  return blocks;
}

/**
 * FILET (Strategy heuristique) : récupère en formes natives des éléments décoratifs
 * NON annotés `data-pptx-shape` que l'IA a oublié de marquer — typiquement les
 * traits/barres séparateurs et les petites pastilles/badges. Sans ça, ils restent
 * cuits dans le PNG de fond (non éditables, non déplaçables).
 *
 * Règle de sûreté ABSOLUE : tout candidat qui ne passe pas TOUS les garde-fous
 * (gradient, transform, fond transparent, bordure/ombre non convertible, taille hors
 * gabarit) est ignoré → l'élément reste rasterisé = comportement actuel. Le filet ne
 * peut donc qu'AJOUTER de l'éditabilité là où c'est sûr, jamais casser l'existant.
 *
 * Deux gabarits conservateurs uniquement :
 *  - BAR  : élément fin + allongé, fond plein, SANS texte ni image (séparateur/trait).
 *  - PILL : petit élément arrondi, fond plein, avec un texte court (badge type "OPINION").
 *           Son texte est récupéré séparément par le sweep extractEditableBlocks.
 */
export function extractHeuristicShapes(doc: Document): ShapeBlock[] {
  const win = doc.defaultView;
  if (!win) return [];
  const out: ShapeBlock[] = [];
  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));

  for (const el of all) {
    // Déjà géré ailleurs : annotations explicites (shape/photo) ou zone photo.
    if (el.closest("[data-pptx-shape]")) continue;
    if (el.hasAttribute("data-pptx-photo") || el.closest("[data-pptx-photo]")) continue;

    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (parseFloat(cs.opacity || "1") < 0.95) continue; // semi-transparent → rendu peu fiable

    // Fond plein opaque obligatoire (pas de gradient, pas de transform, pas de photo de fond).
    const bgColor = cs.backgroundColor || "transparent";
    if (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") continue;
    if (/rgba\([^)]*,\s*0?\.\d+\s*\)/i.test(bgColor)) continue; // bg-color semi-transparent
    const bgImage = cs.backgroundImage || "none";
    if (bgImage !== "none") continue; // gradient ou image de fond → pas un aplat simple
    if ((cs.transform || "none") !== "none") continue;
    if (el.querySelector("img, svg, picture, video")) continue;

    const r = el.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) continue;
    const minSide = Math.min(r.width, r.height);
    const maxSide = Math.max(r.width, r.height);
    const text = (el.textContent || "").trim();
    const borderRadiusPx = parseFloat(cs.borderTopLeftRadius || cs.borderRadius || "0px") || 0;

    // Garde-fous de conversion réutilisés (bordure/ombre). null = non convertible → skip.
    const border = parseUniformBorder(cs);
    if (border === null) continue;
    const rawShadow = cs.boxShadow || "none";
    let shadow: ShapeBlock["shadow"] | undefined = undefined;
    if (rawShadow !== "none") {
      const parsed = parseSimpleBoxShadow(rawShadow);
      if (!parsed) continue;
      shadow = parsed;
    }

    // Surface quasi pleine-slide exclue : c'est le fond de page (géré via slide.background),
    // pas un élément déco. Coordonnées dans le repère iframe 1080×1350.
    const isFullSlide = r.width >= 1000 && r.height >= 1250;
    // BAR : fin (≤ 16px) et allongé (≥ 40px), aucun texte (peut avoir des enfants).
    const isBar = !text && minSide <= 16 && maxSide >= 40 && !isFullSlide;
    // BLOC : aplat de couleur plein, SANS texte ni enfant (bloc déco, surligneur, encart de
    // couleur), de TOUTE épaisseur → attrape ce que isBar (trop fin) ratait (ex. bloc jaune).
    const isBlock = !text && el.children.length === 0 && maxSide >= 24 && !isFullSlide;
    // PILL : petite (≤ 460×120px), arrondie (radius ≥ 8px ou ≥ moitié hauteur), texte court.
    const isPill =
      !!text &&
      !el.hasAttribute("data-pptx-hide") && // déjà capturé comme texte → bg laissé tel quel (sûr)
      text.length <= 28 &&
      r.width <= 460 &&
      r.height <= 120 &&
      r.width >= 24 &&
      (borderRadiusPx >= 8 || borderRadiusPx >= r.height / 2 - 1);
    if (!isBar && !isBlock && !isPill) continue;

    out.push({
      el,
      type: isPill ? "pill" : "card",
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      fill: normalizeHex(bgColor, "FFFFFF"),
      borderRadiusPx,
      shadow,
      border,
    });
  }

  // Garde l'élément le plus interne quand deux candidats sont imbriqués (évite de
  // masquer un conteneur qui engloberait un autre shape).
  return out.filter(
    (c) => !out.some((other) => other !== c && c.el !== other.el && c.el.contains(other.el)),
  );
}

export interface ImageZone {
  el: HTMLElement;
  rect: { x: number; y: number; w: number; h: number };
}

/**
 * Détecte les éléments décoratifs à fond EN DÉGRADÉ (linear/radial/conic), sans texte.
 * pptxgenjs ne sait pas faire de fond dégradé natif (ShapeFillProps = solid only), donc
 * ces éléments ne peuvent pas devenir des formes natives. Décision produit : les sortir
 * en IMAGES séparées déplaçables (au lieu de les laisser fondus dans le PNG de fond
 * monolithique → non déplaçables). L'appelant capture chaque élément via html2canvas
 * et le pose comme image indépendante ; en cas d'échec il le LAISSE cuit (sûr).
 *
 * Exclut : photos (url(data:...)), éléments avec texte/média, surface quasi pleine-slide
 * (= fond de page), éléments hors cadre. Coordonnées dans le repère iframe 1080×1350.
 */
export function extractGradientDecoZones(doc: Document): ImageZone[] {
  const win = doc.defaultView;
  if (!win) return [];
  const out: ImageZone[] = [];
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
    if (el.closest("[data-pptx-shape]")) continue;
    if (el.hasAttribute("data-pptx-photo") || el.closest("[data-pptx-photo]")) continue;
    if ((el.textContent || "").trim() !== "") continue; // décoratif pur (pas de texte)
    if (el.querySelector("img, svg, picture, video")) continue;

    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (parseFloat(cs.opacity || "1") < 0.5) continue;

    const bgImage = cs.backgroundImage || "none";
    if (!/gradient\(/i.test(bgImage)) continue; // doit contenir un dégradé
    if (/url\(\s*["']?data:image\//i.test(bgImage)) continue; // pas une photo

    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (r.width >= 1000 && r.height >= 1250) continue; // fond de page, pas un déco
    if (r.y > 1350 || r.x > 1080 || r.y + r.height < 0 || r.x + r.width < 0) continue;

    out.push({ el, rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
  }
  // Garde le plus interne si imbriqués.
  return out.filter(
    (c) => !out.some((other) => other !== c && c.el !== other.el && c.el.contains(other.el)),
  );
}

// Caractères "emoji" au sens pictographique (❌ ✅ 🧠 💡 …). On exclut volontairement
// les dingbats simples (✓ ✗ → ★) qui NE sont PAS Extended_Pictographic : ceux-là
// rendent comme des glyphes de police normaux et restent éditables dans Canva.
const PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;
// Modificateurs à ignorer pour décider si un texte est "100% emoji" :
// pictographiques + ZWJ (‍) + sélecteurs de variation (︎/️)
// + tons de peau + tags + espaces.
const EMOJI_STRIP_RE =
  /[\p{Extended_Pictographic}‍︎️\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\s]/gu;

/**
 * Vrai si `text` ne contient QUE des emojis pictographiques (+ modificateurs/espaces),
 * avec au moins un emoji. Sert à isoler les emojis "seuls dans leur case" — ceux que
 * Canva transforme en image à l'import d'un .pptx.
 */
export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!PICTOGRAPHIC_RE.test(t)) return false;
  return t.replace(EMOJI_STRIP_RE, "") === "";
}

export interface EmojiZone {
  el: HTMLElement;
  /** Content-box dans le repère iframe (1080×1350). */
  rect: { x: number; y: number; w: number; h: number };
  emoji: string;
  fontSizePx: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: string;
  textAlign: "left" | "center" | "right";
}

/**
 * Détecte les emojis ISOLÉS (un élément dont tout le texte est emoji, ex. la grosse
 * icône d'une grille). pptxgenjs pourrait les sortir en texte, mais Canva rastérise un
 * texte-emoji isolé à l'import → image non éditable. L'appelant les rend plutôt en
 * petite image PNG détourée (canvas 2D `fillText`, pas html2canvas) et déplaçable dans
 * Canva, à la place du texte. En cas d'échec de rendu il les LAISSE dans le fond (sûr).
 *
 * Renvoie le style nécessaire au dessin canvas (police, taille, alignement) + le
 * content-box pour positionner. Coordonnées dans le repère iframe 1080×1350.
 */
export function extractStandaloneEmojiZones(doc: Document): EmojiZone[] {
  const win = doc.defaultView;
  if (!win) return [];
  const out: EmojiZone[] = [];
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
    if (el.hasAttribute("data-pptx-photo") || el.closest("[data-pptx-photo]")) continue;
    if (el.querySelector("img, svg, picture, video")) continue;

    const text = (el.textContent || "").trim();
    if (!isEmojiOnly(text)) continue;

    // Ne garder que le porteur le plus interne (éviter un wrapper qui engloberait l'emoji).
    if (Array.from(el.children).some((c) => (c.textContent || "").trim() !== "")) continue;

    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (parseFloat(cs.opacity || "1") < 0.05) continue;

    const rect = contentBoxRect(el, cs);
    if (rect.w < 4 || rect.h < 4) continue;
    if (rect.y > 1350 || rect.x > 1080 || rect.y + rect.h < 0 || rect.x + rect.w < 0) continue;

    out.push({
      el,
      rect,
      emoji: text,
      fontSizePx: parseFloat(cs.fontSize) || 32,
      fontFamily: cs.fontFamily || "sans-serif",
      fontWeight: parseFontWeight(cs.fontWeight),
      fontStyle: cs.fontStyle || "normal",
      textAlign: parseAlign(cs.textAlign || "left"),
    });
  }
  // Garde le plus interne si imbriqués.
  return out.filter(
    (c) => !out.some((other) => other !== c && c.el !== other.el && c.el.contains(other.el)),
  );
}

