/**
 * Extract dominant colors from a logo image (Blob or URL).
 * Client-side only. No external deps.
 */

export type LogoPalette = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
};

type RGB = { r: number; g: number; b: number; count: number };

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function luminance(r: number, g: number, b: number): number {
  // perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

function quantize(pixels: Uint8ClampedArray): RGB[] {
  // Bucket colors into a coarse 5-bit-per-channel grid (32^3 buckets max)
  const buckets = new Map<number, RGB>();
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 200) continue; // skip transparent
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // Skip near-white and near-black pixels for *dominant* extraction; they'll be picked separately as bg/text
    const lum = luminance(r, g, b);
    if (lum > 0.96 || lum < 0.04) continue;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const existing = buckets.get(key);
    if (existing) {
      existing.r = (existing.r * existing.count + r) / (existing.count + 1);
      existing.g = (existing.g * existing.count + g) / (existing.count + 1);
      existing.b = (existing.b * existing.count + b) / (existing.count + 1);
      existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
}

function findExtremes(pixels: Uint8ClampedArray): { lightest: RGB | null; darkest: RGB | null } {
  let lightest: RGB | null = null;
  let darkest: RGB | null = null;
  let maxLum = -1;
  let minLum = 2;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 200) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const lum = luminance(r, g, b);
    if (lum > maxLum) {
      maxLum = lum;
      lightest = { r, g, b, count: 1 };
    }
    if (lum < minLum) {
      minLum = lum;
      darkest = { r, g, b, count: 1 };
    }
  }
  return { lightest, darkest };
}

export async function extractLogoPalette(source: Blob | string): Promise<LogoPalette> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const size = 200;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unsupported");
    // Fill with transparent
    ctx.clearRect(0, 0, size, size);
    // Fit image preserving aspect
    const ratio = Math.min(size / img.width, size / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const pixels = ctx.getImageData(0, 0, size, size).data;

    const colors = quantize(pixels);
    const { lightest, darkest } = findExtremes(pixels);

    // Primary: most frequent saturated color
    const saturated = colors.filter((c) => saturation(c.r, c.g, c.b) > 0.18);
    const primary = saturated[0] || colors[0] || { r: 51, g: 51, b: 51, count: 1 };

    // Secondary: next most frequent, distant enough from primary
    const secondary =
      saturated.slice(1).find((c) => colorDistance(c, primary) > 60) ||
      colors.slice(1).find((c) => colorDistance(c, primary) > 60) ||
      colors[1] ||
      primary;

    // Accent: most saturated minority color, distant from primary & secondary
    const accent =
      colors
        .slice()
        .sort((a, b) => saturation(b.r, b.g, b.b) - saturation(a.r, a.g, a.b))
        .find(
          (c) => colorDistance(c, primary) > 80 && colorDistance(c, secondary) > 60
        ) ||
      secondary;

    // Background: lightest pixel if very light, else white
    const background =
      lightest && luminance(lightest.r, lightest.g, lightest.b) > 0.85
        ? lightest
        : { r: 255, g: 255, b: 255, count: 1 };

    // Text: darkest pixel if very dark, else near-black
    const text =
      darkest && luminance(darkest.r, darkest.g, darkest.b) < 0.2
        ? darkest
        : { r: 17, g: 17, b: 17, count: 1 };

    return {
      primary: rgbToHex(primary.r, primary.g, primary.b),
      secondary: rgbToHex(secondary.r, secondary.g, secondary.b),
      accent: rgbToHex(accent.r, accent.g, accent.b),
      background: rgbToHex(background.r, background.g, background.b),
      text: rgbToHex(text.r, text.g, text.b),
    };
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}
