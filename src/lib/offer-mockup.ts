/**
 * offer-mockup — compositing DÉTERMINISTE d'un « Mockup de mon offre ».
 *
 * La capture (couverture d'ebook, écran de formation…) est incrustée AU PIXEL
 * PRÈS sur un support dessiné en dur au canvas (tablette, téléphone, livre,
 * pages imprimées, ordinateur), posé sur un fond uni couleur de marque.
 * Zéro IA = texte de couverture parfaitement net, rendu instantané, offert
 * (même philosophie que les fonds procéduraux Recraft : l'IA image ne sait
 * pas faire ça proprement, le code si). L'ambiance IA optionnelle passe
 * ensuite par « Modifier le fond » (Photoroom, 1 crédit).
 */

export type MockupSupport = "tablette" | "telephone" | "livre" | "pages" | "ordinateur";

export const MOCKUP_SUPPORTS: { key: MockupSupport; label: string; hint?: string }[] = [
  { key: "tablette", label: "Tablette" },
  { key: "telephone", label: "Téléphone" },
  { key: "livre", label: "Livre" },
  { key: "pages", label: "Pages imprimées" },
  { key: "ordinateur", label: "Ordinateur", hint: "idéal captures paysage" },
];

/** Support pré-sélectionné selon le format de la capture. */
export function pickDefaultSupport(width: number, height: number): MockupSupport {
  if (!width || !height) return "tablette";
  return width > height * 1.05 ? "ordinateur" : "tablette";
}

/** Rect source (crop) pour un rendu object-fit: cover dans dstW×dstH. */
export function fitCover(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(srcW, 1), sh: Math.max(srcH, 1) };
  }
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const sw = dstW / scale;
  const sh = dstH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/** Mélange un hex avec du blanc (t ∈ [0,1], 1 = blanc pur). */
export function lightenHex(hex: string, t: number): string | null {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Fond « uni couleur de marque » : le color_background de la charte s'il est
 * posé, sinon la couleur primaire fortement éclaircie (un fond doit rester un
 * fond), sinon un beige neutre.
 */
export function resolveBackgroundColor(charter: {
  color_background?: string | null;
  color_primary?: string | null;
} | null): string {
  const bg = charter?.color_background;
  if (bg && HEX_RE.test(bg.trim())) return bg.trim().startsWith("#") ? bg.trim() : `#${bg.trim()}`;
  const primary = charter?.color_primary;
  if (primary) {
    const light = lightenHex(primary, 0.72);
    if (light) return light;
  }
  return "#F1EFE8";
}

/* ───────────────────────── rendu canvas ───────────────────────── */

type ImgSource = HTMLImageElement | ImageBitmap;

function imgSize(img: ImgSource): { w: number; h: number } {
  const anyImg = img as HTMLImageElement;
  return {
    w: anyImg.naturalWidth ?? (img as ImageBitmap).width,
    h: anyImg.naturalHeight ?? (img as ImageBitmap).height,
  };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Ombre douce et plate sous l'objet (pas de blur : rendu net et stable). */
function drawGroundShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.save();
  ctx.fillStyle = "rgba(60, 40, 25, 0.13)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Dessine la capture en cover-fit clippée dans un rect arrondi. */
function drawCoverInto(
  ctx: CanvasRenderingContext2D,
  img: ImgSource,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const { w: sw0, h: sh0 } = imgSize(img);
  const { sx, sy, sw, sh } = fitCover(sw0, sh0, w, h);
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

const FRAME_DARK = "#2E2B28";
const FRAME_BASE = "#3A3733";

function drawTablet(ctx: CanvasRenderingContext2D, S: number, img: ImgSource, screenW = 0.36) {
  const w = S * screenW;
  const h = S * 0.66;
  const x = (S - w) / 2;
  const y = (S - h) / 2 - S * 0.02;
  drawGroundShadow(ctx, S / 2, y + h + S * 0.035, w * 0.72, S * 0.022);
  ctx.fillStyle = FRAME_DARK;
  roundRectPath(ctx, x, y, w, h, S * 0.032);
  ctx.fill();
  const inset = S * 0.022;
  drawCoverInto(ctx, img, x + inset, y + inset, w - 2 * inset, h - 2 * inset, S * 0.008);
}

function drawPhone(ctx: CanvasRenderingContext2D, S: number, img: ImgSource) {
  drawTablet(ctx, S, img, 0.24);
}

function drawBook(ctx: CanvasRenderingContext2D, S: number, img: ImgSource) {
  const w = S * 0.36;
  const h = S * 0.62;
  const x = (S - w) / 2 - S * 0.015;
  const y = (S - h) / 2 - S * 0.02;
  const edge1 = S * 0.02;
  const edge2 = S * 0.012;
  drawGroundShadow(ctx, S / 2, y + h + S * 0.03, w * 0.78, S * 0.02);
  // Tranche des pages (droite), légèrement décalée
  ctx.fillStyle = "#E7DDC9";
  roundRectPath(ctx, x + w, y + S * 0.006, edge1, h - S * 0.006, S * 0.004);
  ctx.fill();
  ctx.fillStyle = "#D5C7AC";
  roundRectPath(ctx, x + w + edge1, y + S * 0.012, edge2, h - S * 0.018, S * 0.004);
  ctx.fill();
  // Couverture au pixel
  drawCoverInto(ctx, img, x, y, w, h, S * 0.006);
  // Pli de reliure : fine bande sombre translucide côté gauche
  ctx.fillStyle = "rgba(0, 0, 0, 0.10)";
  ctx.fillRect(x + S * 0.012, y, S * 0.006, h);
}

function drawPages(ctx: CanvasRenderingContext2D, S: number, img: ImgSource) {
  const w = S * 0.4;
  const h = w * 1.414; // A4
  const cx = S / 2;
  const cy = S / 2 - S * 0.01;
  drawGroundShadow(ctx, cx, cy + h / 2 + S * 0.03, w * 0.8, S * 0.02);
  const sheet = (angleDeg: number, fill: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.fillStyle = fill;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, S * 0.004);
    ctx.fill();
    ctx.restore();
  };
  sheet(-5, "#EDE5D4");
  sheet(3, "#F6F0E4");
  // Feuille du dessus, droite, avec la capture
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = "#FFFFFF";
  roundRectPath(ctx, x, y, w, h, S * 0.004);
  ctx.fill();
  drawCoverInto(ctx, img, x, y, w, h, S * 0.004);
}

function drawLaptop(ctx: CanvasRenderingContext2D, S: number, img: ImgSource) {
  const w = S * 0.6;
  const h = S * 0.4;
  const x = (S - w) / 2;
  const y = S * 0.24;
  const baseH = S * 0.045;
  drawGroundShadow(ctx, S / 2, y + h + baseH + S * 0.022, w * 0.72, S * 0.02);
  // Écran
  ctx.fillStyle = FRAME_DARK;
  roundRectPath(ctx, x, y, w, h, S * 0.018);
  ctx.fill();
  const inset = S * 0.016;
  drawCoverInto(ctx, img, x + inset, y + inset, w - 2 * inset, h - 2 * inset, S * 0.004);
  // Base trapézoïdale + encoche
  const bx0 = x - S * 0.06;
  const bx1 = x + w + S * 0.06;
  const by = y + h;
  ctx.fillStyle = FRAME_BASE;
  ctx.beginPath();
  ctx.moveTo(bx0, by);
  ctx.lineTo(bx1, by);
  ctx.lineTo(bx1 - S * 0.03, by + baseH);
  ctx.lineTo(bx0 + S * 0.03, by + baseH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#57534E";
  ctx.beginPath();
  ctx.moveTo(S / 2 - S * 0.05, by);
  ctx.lineTo(S / 2 + S * 0.05, by);
  ctx.lineTo(S / 2 + S * 0.045, by + S * 0.012);
  ctx.lineTo(S / 2 - S * 0.045, by + S * 0.012);
  ctx.closePath();
  ctx.fill();
}

export interface RenderMockupOptions {
  image: ImgSource;
  support: MockupSupport;
  /** Couleur CSS du fond (voir resolveBackgroundColor). */
  background: string;
  /** Côté du canvas carré, défaut 1080 (format post). */
  size?: number;
}

/** Rend le mockup sur un canvas et retourne le blob JPEG. */
export async function renderOfferMockup(opts: RenderMockupOptions): Promise<Blob> {
  const S = opts.size ?? 1080;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible dans ce navigateur");
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, S, S);
  switch (opts.support) {
    case "tablette":
      drawTablet(ctx, S, opts.image);
      break;
    case "telephone":
      drawPhone(ctx, S, opts.image);
      break;
    case "livre":
      drawBook(ctx, S, opts.image);
      break;
    case "pages":
      drawPages(ctx, S, opts.image);
      break;
    case "ordinateur":
      drawLaptop(ctx, S, opts.image);
      break;
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Export du mockup impossible"))),
      "image/jpeg",
      0.92,
    );
  });
}
