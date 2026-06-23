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
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        resolve(typeof result === "string" ? result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
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
