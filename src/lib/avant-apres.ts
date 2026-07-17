/**
 * avant-apres — montage DÉTERMINISTE de deux photos en un visuel Avant/Après.
 *
 * Deux photos (chantier→rénové, ancien logo→nouveau, 2024→2026…) sont posées
 * côte à côte ou l'une au-dessus de l'autre, séparées par un filet, avec une
 * étiquette par photo. Zéro IA = offert, instantané, net (même philosophie que
 * offer-mockup) ; l'étiquette « Après » reprend la couleur de la charte.
 */

import { fitCover } from "@/lib/offer-mockup";

export type AvantApresLayout = "cote_a_cote" | "haut_bas";

export const AVANT_APRES_LAYOUTS: { key: AvantApresLayout; label: string }[] = [
  { key: "cote_a_cote", label: "Côte à côte" },
  { key: "haut_bas", label: "Haut / bas" },
];

export type AvantApresFormat = "4:5" | "1:1" | "9:16";

export const AVANT_APRES_FORMATS: {
  key: AvantApresFormat;
  label: string;
  width: number;
  height: number;
}[] = [
  { key: "4:5", label: "Post 4:5", width: 1080, height: 1350 },
  { key: "1:1", label: "Carré", width: 1080, height: 1080 },
  { key: "9:16", label: "Story", width: 1080, height: 1920 },
];

export const AVANT_APRES_LABEL_MAX = 18;

/**
 * Mise en page pré-sélectionnée : deux photos en paysage (l'ordinaire des
 * photos d'intérieur/chantier) restent entières en haut/bas ; sinon le côte à
 * côte, plus percutant sur des photos verticales.
 */
export function pickDefaultLayout(
  before: { width: number; height: number },
  after: { width: number; height: number },
): AvantApresLayout {
  const landscape = (s: { width: number; height: number }) =>
    s.width > 0 && s.height > 0 && s.width > s.height;
  return landscape(before) && landscape(after) ? "haut_bas" : "cote_a_cote";
}

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/** Blanc ou charbon selon la luminance du fond de l'étiquette (WCAG simplifié). */
export function labelTextColor(bgHex: string): string {
  const m = HEX_RE.exec(bgHex.trim());
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum =
    0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
  return lum > 0.35 ? "#1C1C20" : "#FFFFFF";
}

/** Couleur de l'étiquette « Après » : la couleur primaire de la charte si posée. */
export function resolveAfterLabelColor(charter: { color_primary?: string | null } | null): string {
  const primary = charter?.color_primary?.trim();
  if (primary && HEX_RE.test(primary)) {
    return primary.startsWith("#") ? primary : `#${primary}`;
  }
  return "#1C1C20";
}

type ImgSource = HTMLImageElement | ImageBitmap;

function imgSize(img: ImgSource): { w: number; h: number } {
  const anyImg = img as HTMLImageElement;
  return {
    w: anyImg.naturalWidth ?? (img as ImageBitmap).width,
    h: anyImg.naturalHeight ?? (img as ImageBitmap).height,
  };
}

function drawCoverRect(
  ctx: CanvasRenderingContext2D,
  img: ImgSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const { w: sw0, h: sh0 } = imgSize(img);
  const { sx, sy, sw, sh } = fitCover(sw0, sh0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  base: number,
  bg: string,
) {
  const label = text.trim().slice(0, AVANT_APRES_LABEL_MAX);
  if (!label) return;
  const fontSize = base * 0.034;
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const padX = fontSize * 0.85;
  const padY = fontSize * 0.5;
  const textW = ctx.measureText(label).width;
  const w = textW + 2 * padX;
  const h = fontSize + 2 * padY;
  ctx.save();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = labelTextColor(bg);
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y + h / 2 + fontSize * 0.06);
  ctx.restore();
}

export interface RenderAvantApresOptions {
  before: ImgSource;
  after: ImgSource;
  layout: AvantApresLayout;
  format: AvantApresFormat;
  /** Étiquettes affichées ; vide = pas d'étiquette. */
  beforeLabel: string;
  afterLabel: string;
  /** Couleur de l'étiquette « Après » (voir resolveAfterLabelColor). */
  afterLabelColor: string;
}

/** Rend le montage sur un canvas et retourne le blob JPEG. */
export async function renderAvantApres(opts: RenderAvantApresOptions): Promise<Blob> {
  const fmt = AVANT_APRES_FORMATS.find((f) => f.key === opts.format) ?? AVANT_APRES_FORMATS[0];
  const { width: W, height: H } = fmt;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible dans ce navigateur");

  // Filet séparateur blanc, proportionnel au petit côté
  const divider = Math.round(Math.min(W, H) * 0.008);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  const base = Math.min(W, H);
  const margin = base * 0.028;
  const beforeBg = "rgba(28, 28, 32, 0.82)";

  if (opts.layout === "cote_a_cote") {
    const half = (W - divider) / 2;
    drawCoverRect(ctx, opts.before, 0, 0, half, H);
    drawCoverRect(ctx, opts.after, half + divider, 0, half, H);
    drawLabel(ctx, opts.beforeLabel, margin, margin, base, beforeBg);
    drawLabel(ctx, opts.afterLabel, half + divider + margin, margin, base, opts.afterLabelColor);
  } else {
    const half = (H - divider) / 2;
    drawCoverRect(ctx, opts.before, 0, 0, W, half);
    drawCoverRect(ctx, opts.after, 0, half + divider, W, half);
    drawLabel(ctx, opts.beforeLabel, margin, margin, base, beforeBg);
    drawLabel(ctx, opts.afterLabel, margin, half + divider + margin, base, opts.afterLabelColor);
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Export du montage impossible"))),
      "image/jpeg",
      0.92,
    );
  });
}
