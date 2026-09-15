/**
 * Helper partagé : récupère le logo de la marque (`brand_charter.logo_url`)
 * en data URL base64, prêt à être injecté dans un PNG (html2canvas) ou un PPTX
 * (pptxgenjs `addImage({ data })`).
 *
 * Retourne `null` si pas d'URL, fetch en échec, ou MIME non image.
 * Les appelants doivent toujours fallback gracieusement (export sans logo).
 */

const LOGO_LS_KEY = "export-include-logo";

export function getIncludeLogoPref(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(LOGO_LS_KEY) !== "false";
}

export function setIncludeLogoPref(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOGO_LS_KEY, value ? "true" : "false");
}

export async function fetchLogoAsBase64(
  logoUrl: string | null | undefined,
): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        resolve(typeof result === "string" ? result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return dataUrl ? await protectLogoContrast(dataUrl) : null;
  } catch (e) {
    console.warn("[export-logo] fetch failed:", e);
    return null;
  }
}

/**
 * Snippet HTML à injecter juste avant `</body>` pour incruster le logo
 * en bas-droite d'un visuel rasterisé.
 *
 * @param logoBase64 data URL (préfixée `data:image/...`)
 * @param canvasWidth largeur du canvas cible en px (1080 carrousel, 1000 Pinterest)
 */
export function buildLogoOverlayHtml(
  logoBase64: string,
  canvasWidth: number,
): string {
  // Hauteur ≈ 7% du canvas, padding ≈ 3% — discret mais lisible.
  const height = Math.round(canvasWidth * 0.07);
  const padding = Math.round(canvasWidth * 0.03);
  return `<img src="${logoBase64}" alt="" aria-hidden="true" style="position:absolute;bottom:${padding}px;right:${padding}px;height:${height}px;width:auto;max-width:30%;object-fit:contain;z-index:2147483647;pointer-events:none;" />`;
}

/**
 * Calcule la position/taille du logo pour un slide PPTX (en inches).
 * Bas-droite, hauteur ≈ 7% slide, padding 0.3".
 */
export function getPptxLogoRect(slideWIn: number, slideHIn: number) {
  const h = slideHIn * 0.07;
  const padding = 0.3;
  // On laisse pptxgenjs gérer l'aspect ratio en fixant uniquement la hauteur
  // → on alloue une box carrée maxi puis on positionne à droite avec sizing contain.
  const w = h * 2.2; // box large pour logos paysage, sera contain
  return {
    x: slideWIn - w - padding,
    y: slideHIn - h - padding,
    w,
    h,
  };
}


/** Choose the more legible neutral backing for the visible logo pixels. */
export function logoBackdropColor(pixels: Uint8ClampedArray): string | null {
  let weight = 0;
  let luminance = 0;
  let transparent = false;
  const linear = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha < 0.98) transparent = true;
    if (alpha === 0) continue;
    weight += alpha;
    luminance += alpha * (0.2126 * linear(pixels[i]) + 0.7152 * linear(pixels[i + 1]) + 0.0722 * linear(pixels[i + 2]));
  }
  if (!transparent || weight === 0) return null;
  // White and black offer equal contrast at sqrt(1.05 * .05) - .05.
  return luminance / weight < Math.sqrt(1.05 * 0.05) - 0.05 ? "#ffffff" : "#000000";
}

/** Bake the backing into the logo so PNG and native PPTX receive the same image. */
async function protectLogoContrast(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(dataUrl), 3000);
    img.onerror = () => { window.clearTimeout(timer); resolve(dataUrl); };
    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const background = logoBackdropColor(ctx.getImageData(0, 0, width, height).data);
        if (!background) { resolve(dataUrl); return; }
        const inset = Math.max(2, Math.round(height * 0.08));
        canvas.width = width + inset * 2;
        canvas.height = height + inset * 2;
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, inset, inset, width, height);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl);
      }
    };
    img.src = dataUrl;
  });
}
