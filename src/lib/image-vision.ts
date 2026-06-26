/**
 * Allègement des photos envoyées à l'IA pour l'analyse VISION uniquement.
 *
 * Pourquoi : l'analyse vision (étape "structure" des carrousels photo/mix) reçoit
 * les photos en plein format (~1600 px). C'est inutilement lourd pour que l'IA
 * "comprenne" la scène et rédige le texte — 1024 px suffisent largement, et ça
 * accélère l'upload + l'analyse.
 *
 * IMPORTANT : ne JAMAIS utiliser ces versions allégées pour le rendu ou l'export
 * du carrousel (qui rasterise à scale 3) — le rendu doit garder le master plein
 * format. Ce helper ne sert QUE pour les appels d'analyse à carousel-ai.
 */

const VISION_MAX_WIDTH = 1024;
const VISION_QUALITY = 0.72;

/** Réduit une image base64 (data URL) pour l'analyse vision. Sans risque : en cas
 * d'échec ou si l'image est déjà assez petite, renvoie l'original tel quel. */
export function downscaleBase64ForVision(
  base64: string,
  maxWidth = VISION_MAX_WIDTH,
  quality = VISION_QUALITY,
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        if (img.width <= maxWidth) {
          resolve(base64); // déjà assez légère
          return;
        }
        const w = maxWidth;
        const h = Math.round(img.height * (maxWidth / img.width));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(base64);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(base64); // jamais bloquer la génération sur un resize raté
      img.src = base64;
    } catch {
      resolve(base64);
    }
  });
}

type VisionPhoto = { base64: string; context?: string; mimeType?: string };

/** Applique downscaleBase64ForVision à un tableau de photos, en conservant
 * context/mimeType. Renvoie l'entrée telle quelle si vide. */
export async function downscalePhotosForVision<T extends VisionPhoto>(
  photos: T[] | undefined,
): Promise<T[] | undefined> {
  if (!photos || photos.length === 0) return photos;
  return Promise.all(
    photos.map(async (p) => {
      const base64 = await downscaleBase64ForVision(p.base64);
      const m = /^data:(image\/[a-z+]+);/i.exec(base64);
      return { ...p, base64, mimeType: m ? m[1] : p.mimeType || "image/jpeg" };
    }),
  );
}
