// Mesure client de la luminance d'une photo par bande horizontale (chantier
// gabarits texte-sur-photo, 13/07). Sert à DOSER le voile des gabarits composés
// côté carousel-visual : photo claire → voile franc, photo sombre → voile
// discret. La mesure se fait ici (canvas) car les edges Deno n'ont ni DOM ni
// décodeur JPEG — en cas d'échec, l'edge retombe sur le pire cas (voile fort),
// jamais sur un texte illisible.

export interface PhotoLuminanceZones {
  top: number;
  center: number;
  bottom: number;
}

const SAMPLE_W = 48;
const SAMPLE_H = 60; // ratio 4:5 du format slide

// Bandes alignées sur les zones de texte des gabarits (safe zones comprises) :
// le texte "bottom" vit entre ~60 % et ~92 % de la hauteur, etc.
const ZONES: Record<keyof PhotoLuminanceZones, [number, number]> = {
  top: [0.08, 0.38],
  center: [0.33, 0.66],
  bottom: [0.6, 0.92],
};

function bandLuminance(data: Uint8ClampedArray, width: number, height: number, from: number, to: number): number {
  const y0 = Math.floor(height * from);
  const y1 = Math.min(height, Math.ceil(height * to));
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      count++;
    }
  }
  return count > 0 ? Math.round((sum / count) * 100) / 100 : 0.5;
}

/** Mesure les 3 bandes ; null si l'image ne peut pas être décodée (l'edge prendra le pire cas). */
export function measureLuminanceZones(base64: string): Promise<PhotoLuminanceZones | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = SAMPLE_W;
          canvas.height = SAMPLE_H;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          // cover : on remplit le cadre 4:5 comme le fera la slide
          const scale = Math.max(SAMPLE_W / img.width, SAMPLE_H / img.height);
          const dw = img.width * scale;
          const dh = img.height * scale;
          ctx.drawImage(img, (SAMPLE_W - dw) / 2, (SAMPLE_H - dh) / 2, dw, dh);
          const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
          resolve({
            top: bandLuminance(data, SAMPLE_W, SAMPLE_H, ...ZONES.top),
            center: bandLuminance(data, SAMPLE_W, SAMPLE_H, ...ZONES.center),
            bottom: bandLuminance(data, SAMPLE_W, SAMPLE_H, ...ZONES.bottom),
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
    } catch {
      resolve(null);
    }
  });
}
