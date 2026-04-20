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
  return color.replace("#", "").padEnd(6, "0").slice(0, 6).toUpperCase();
}
