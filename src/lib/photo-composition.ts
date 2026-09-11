/** Photo-only geometry. Full images always fit; only an explicit detail uses a crop. */
export const PHOTO_FORMATS = {
  post: { label: "Post portrait", width: 1080, height: 1350 },
  square: { label: "Post carré", width: 1080, height: 1080 },
  story: { label: "Story", width: 1080, height: 1920 },
  cover: { label: "Couverture de Reel", width: 1080, height: 1920 },
  banner: { label: "Bannière", width: 1600, height: 600 },
} as const;
export type PhotoFormat = keyof typeof PHOTO_FORMATS;
export interface PhotoRect { x: number; y: number; width: number; height: number }
export interface PhotoDirection {
  version: 1;
  background: string;
  padding: number;
  horizontal: number;
  vertical: number;
  textPosition: "none" | "top" | "bottom";
  textColor: string;
  scenePrompt: string;
}
export interface PhotoRecipe {
  format: PhotoFormat;
  width: number;
  height: number;
  direction: PhotoDirection;
  exposure: number;
  contrast: number;
  text: string;
  /** Normalised source rectangle, only for an explicitly selected visible detail. */
  crop?: PhotoRect;
}
export const DEFAULT_PHOTO_DIRECTION: PhotoDirection = {
  version: 1, background: "#ffffff", padding: 0.05, horizontal: 0.5, vertical: 0.5,
  textPosition: "none", textColor: "#1a1a1a", scenePrompt: "",
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const color = (s: unknown, fallback: string) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s) ? s : fallback;

export function cleanDirection(value: Partial<PhotoDirection> = {}): PhotoDirection {
  return {
    version: 1, background: color(value.background, "#ffffff"), textColor: color(value.textColor, "#1a1a1a"),
    padding: clamp(value.padding ?? 0.05, 0, 0.2), horizontal: clamp(value.horizontal ?? 0.5, 0, 1),
    vertical: clamp(value.vertical ?? 0.5, 0, 1),
    textPosition: value.textPosition === "top" || value.textPosition === "bottom" ? value.textPosition : "none",
    scenePrompt: typeof value.scenePrompt === "string" ? value.scenePrompt.slice(0, 400) : "",
  };
}
export function makePhotoRecipe(format: PhotoFormat = "post", direction: PhotoDirection = DEFAULT_PHOTO_DIRECTION): PhotoRecipe {
  return { format, width: PHOTO_FORMATS[format].width, height: PHOTO_FORMATS[format].height,
    direction: cleanDirection(direction), exposure: 0, contrast: 1, text: "" };
}
export function cleanRecipe(raw: PhotoRecipe): PhotoRecipe {
  const format = Object.prototype.hasOwnProperty.call(PHOTO_FORMATS, raw.format) ? raw.format : "post";
  const preset = PHOTO_FORMATS[format];
  return { format, width: format === "banner" ? Math.round(clamp(raw.width, 320, 2400)) : preset.width,
    height: format === "banner" ? Math.round(clamp(raw.height, 320, 2400)) : preset.height,
    direction: cleanDirection(raw.direction || {}), exposure: clamp(raw.exposure ?? 0, -1, 1),
    contrast: clamp(raw.contrast ?? 1, 0.8, 1.2), text: typeof raw.text === "string" ? raw.text.slice(0, 240) : "",
    ...(raw.crop ? { crop: normaliseCrop(raw.crop) } : {}),
  };
}
export function normaliseCrop(crop: PhotoRect): PhotoRect {
  const x = clamp(crop.x, 0, 0.9), y = clamp(crop.y, 0, 0.9);
  return { x, y, width: clamp(crop.width, 0.1, 1 - x), height: clamp(crop.height, 0.1, 1 - y) };
}
export function photoGeometry(sourceWidth: number, sourceHeight: number, raw: PhotoRecipe) {
  if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error("Photo illisible.");
  const r = cleanRecipe(raw), { width, height, direction: d } = r;
  const crop = r.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const source = { x: crop.x * sourceWidth, y: crop.y * sourceHeight, width: crop.width * sourceWidth, height: crop.height * sourceHeight };
  const margin = Math.round(Math.min(width, height) * d.padding);
  const textHeight = d.textPosition === "none" ? 0 : Math.round(height * 0.24);
  const area = { x: margin, y: margin + (d.textPosition === "top" ? textHeight : 0),
    width: width - 2 * margin, height: height - 2 * margin - textHeight };
  // Never hallucinate resolution for a detail: native pixels are the maximum.
  const requestedScale = Math.min(area.width / source.width, area.height / source.height);
  const scale = r.crop ? Math.min(1, requestedScale) : requestedScale;
  const dest = { x: area.x + (area.width - source.width * scale) * d.horizontal,
    y: area.y + (area.height - source.height * scale) * d.vertical,
    width: source.width * scale, height: source.height * scale };
  const textArea = d.textPosition === "none" ? null : {
    x: margin + width * 0.035, width: width - 2 * margin - width * 0.07,
    y: d.textPosition === "top" ? margin : height - margin - textHeight, height: textHeight,
  };
  return { recipe: r, source, dest, textArea, lowResolution: requestedScale > 1.5,
    detailTooSmall: !!r.crop && Math.min(source.width, source.height) < 200 };
}
export function confirmedPhotoCopy(product: string, facts: string, message: string, cta: string) {
  // Intentionally no inferred material, stock, price or product characteristics.
  const title = product.trim().slice(0, 120);
  const lines = facts.split("\n").map(s => s.trim()).filter(Boolean);
  return { title, caption: [title, lines.join("\n"), message.trim(), cta.trim()].filter(Boolean).join("\n\n"),
    short: [title, message.trim(), cta.trim()].filter(Boolean).join("\n") };
}

export async function loadPhotoImage(dataUrl: string): Promise<HTMLImageElement> {
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(dataUrl)) throw new Error("Photo indisponible. Recharge la source.");
  return new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Cette photo est illisible.")); img.src = dataUrl;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of word) {
        if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
/** One rendering path for previews, download, library, and calendar. Text stays in the recipe. */
export async function renderPhotoComposition(image: HTMLImageElement, recipe: PhotoRecipe): Promise<string> {
  const { recipe: r, source, dest, textArea, detailTooSmall } = photoGeometry(image.naturalWidth, image.naturalHeight, recipe);
  if (detailTooSmall) throw new Error("Ce détail est trop petit. Choisis une zone plus large ou une meilleure photo.");
  const canvas = document.createElement("canvas"); canvas.width = r.width; canvas.height = r.height;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Le rendu photo est indisponible.");
  ctx.fillStyle = r.direction.background; ctx.fillRect(0, 0, r.width, r.height);
  let drawn: CanvasImageSource = image;
  if (r.exposure !== 0 || r.contrast !== 1) {
    const lit = document.createElement("canvas"); lit.width = image.naturalWidth; lit.height = image.naturalHeight;
    const lc = lit.getContext("2d"); if (!lc) throw new Error("Le réglage lumière est indisponible.");
    lc.drawImage(image, 0, 0); const pixels = lc.getImageData(0, 0, lit.width, lit.height);
    const gain = 2 ** r.exposure;
    for (let i = 0; i < pixels.data.length; i += 4) for (let c = 0; c < 3; c++) {
      pixels.data[i + c] = clamp((pixels.data[i + c] * gain - 128) * r.contrast + 128, 0, 255);
    }
    lc.putImageData(pixels, 0, 0); drawn = lit;
  }
  ctx.drawImage(drawn, source.x, source.y, source.width, source.height, dest.x, dest.y, dest.width, dest.height);
  if (textArea && r.text.trim()) {
    await document.fonts?.load('500 24px "IBM Plex Sans"');
    let size = Math.round(r.width * 0.045);
    let lines: string[] = [];
    for (; size >= 16; size--) {
      ctx.font = `500 ${size}px "IBM Plex Sans", sans-serif`; lines = wrapText(ctx, r.text.trim(), textArea.width);
      if (lines.length * size * 1.3 <= textArea.height * 0.85) break;
    }
    if (size < 16) throw new Error("Le texte ne tient pas dans l’espace réservé. Raccourcis-le.");
    ctx.fillStyle = r.direction.textColor; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    const lineHeight = size * 1.3;
    lines.forEach((line, i) => ctx.fillText(line, textArea.x + textArea.width / 2,
      textArea.y + (textArea.height - (lines.length - 1) * lineHeight) / 2 + i * lineHeight));
  }
  return canvas.toDataURL("image/png");
}

/** Use only the returned alpha mask; opaque source colours are copied from the actual photo. */
export async function sourceWithCutoutMask(source: HTMLImageElement, cutoutUrl: string): Promise<string> {
  const mask = await loadPhotoImage(cutoutUrl);
  if (mask.naturalWidth !== source.naturalWidth || mask.naturalHeight !== source.naturalHeight) throw new Error("Le détourage a changé les dimensions. La source est conservée.");
  const canvas = document.createElement("canvas"); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Détourage indisponible.");
  ctx.drawImage(mask, 0, 0); const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (!alpha.data.some((v, i) => i % 4 === 3 && v < 255)) throw new Error("Le détourage n’a pas de transparence exploitable.");
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0);
  const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < original.data.length; i += 4) original.data[i] = Math.min(original.data[i], alpha.data[i]);
  ctx.putImageData(original, 0, 0); return canvas.toDataURL("image/png");
}
