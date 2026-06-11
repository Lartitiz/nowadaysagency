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
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
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
  if (!walker) return undefined;

  const raw: TextRun[] = [];
  let node: Node | null = walker.nextNode();
  while (node) {
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
  // NodeFilter.SHOW_TEXT = 4
  return ownerDoc.createTreeWalker(root, 4);
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
    });
  }
  return blocks;
}


