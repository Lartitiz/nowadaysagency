// Export hybride (fiche 15, lot 1) : mesure et recadrage des photos d'origine,
// déplacés à l'identique depuis export-carousel-hybrid-pptx.ts.

// ---------------------------------------------------------------------------
// Mesure des dimensions source d'une image (pour calcul d'un crop proportionnel)
// ---------------------------------------------------------------------------

export async function measureImageNatural(
  dataUrl: string,
  timeoutMs = 5000,
): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ""; resolve(null); }, timeoutMs);
    img.onload = () => { clearTimeout(t); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Pré-recadrage "cover" centré au ratio cible via canvas.
// Garantit que l'image arrive dans pptxgenjs au ratio exact du cadre →
// aucun srcRect généré, aucune déformation.
// ---------------------------------------------------------------------------

export async function cropToRatioBase64(
  dataUrl: string,
  targetRatio: number, // w/h du cadre de destination
  timeoutMs = 5000,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ""; resolve(null); }, timeoutMs);
    img.onload = () => {
      clearTimeout(t);
      try {
        const sw = img.naturalWidth;
        const sh = img.naturalHeight;
        if (!sw || !sh || !isFinite(targetRatio) || targetRatio <= 0) {
          resolve(null);
          return;
        }
        const srcRatio = sw / sh;
        // Fenêtre source à conserver (crop centré "cover")
        let cw = sw;
        let chh = sh;
        let ox = 0;
        let oy = 0;
        if (srcRatio > targetRatio) {
          cw = Math.round(sh * targetRatio);
          ox = Math.round((sw - cw) / 2);
        } else if (srcRatio < targetRatio) {
          chh = Math.round(sw / targetRatio);
          oy = Math.round((sh - chh) / 2);
        }
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = chh;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, ox, oy, cw, chh, 0, 0, cw, chh);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = dataUrl;
  });
}
