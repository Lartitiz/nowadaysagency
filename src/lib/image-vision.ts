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
 *
 * Garde anti-546 (21/07) : une photo indécodable (HEIC, fichier corrompu…) partait
 * en plein format vers l'edge — à ~28 Mo de corps la passerelle Supabase répond
 * 546 WORKER_RESOURCE_LIMIT. Désormais : secours createImageBitmap, puis si la
 * photo reste indécodable ET trop lourde, elle est remplacée par un minuscule
 * pavé neutre (jamais filtrée : photo_index / {{PHOTO_N}} / la ré-hydratation
 * vision→master de CreerUnifie alignent photos et slides PAR POSITION).
 */

import { toast } from "sonner";

const VISION_MAX_WIDTH = 1024;
const VISION_QUALITY = 0.72;

/** Plafond au-delà duquel un original indécodable ne part plus vers l'edge :
 * ~2 M de caractères base64 (≈ 1,5 Mo binaire). Bien en dessous du seuil où la
 * passerelle Supabase casse (546 mesuré à ~28 Mo de corps le 21/07). */
export const VISION_UNDECODABLE_MAX_CHARS = 2 * 1024 * 1024;

/** Dernier secours si le canvas est aussi indisponible : GIF gris 1×1. */
const FALLBACK_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";

/** Décodage via <img> + canvas. Résout null si l'image est indécodable. */
function decodeViaImage(
  base64: string,
  maxWidth: number,
  quality: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        if (img.width <= maxWidth) {
          resolve(base64); // déjà assez légère
          return;
        }
        try {
          const w = maxWidth;
          const h = Math.round(img.height * (maxWidth / img.width));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(base64); // décodable mais canvas KO : l'original est sain
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(base64);
        }
      };
      img.onerror = () => resolve(null);
      img.src = base64;
    } catch {
      resolve(null);
    }
  });
}

/** Secours quand <img> ne décode pas : createImageBitmap accepte parfois des
 * fichiers que HTMLImageElement refuse (et couvre les photos entrées par les
 * flux qui lisent le fichier brut sans jamais le décoder, ex. PhotoSwapDialog). */
async function decodeViaBitmap(
  base64: string,
  maxWidth: number,
  quality: number,
): Promise<string | null> {
  try {
    const blob = await (await fetch(base64)).blob();
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width <= maxWidth) return base64;
      const w = maxWidth;
      const h = Math.round(bitmap.height * (maxWidth / bitmap.width));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return base64;
      ctx.drawImage(bitmap, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", quality);
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  }
}

/** Réduit une image base64 (data URL) pour l'analyse vision.
 * - image décodable : version ≤ maxWidth (ou l'original s'il est déjà petit) ;
 * - indécodable mais raisonnable (≤ VISION_UNDECODABLE_MAX_CHARS) : l'original,
 *   comme avant — jamais bloquer la génération sur un resize raté ;
 * - indécodable ET trop lourde : null → l'appelant doit l'écarter (surtout ne
 *   pas l'envoyer : c'est le scénario 546 WORKER_RESOURCE_LIMIT). */
export async function downscaleBase64ForVision(
  base64: string,
  maxWidth = VISION_MAX_WIDTH,
  quality = VISION_QUALITY,
): Promise<string | null> {
  const viaImage = await decodeViaImage(base64, maxWidth, quality);
  if (viaImage !== null) return viaImage;
  if (typeof createImageBitmap === "function") {
    const viaBitmap = await decodeViaBitmap(base64, maxWidth, quality);
    if (viaBitmap !== null) return viaBitmap;
  }
  return base64.length <= VISION_UNDECODABLE_MAX_CHARS ? base64 : null;
}

/** Pavé neutre qui REMPLACE (sans la filtrer) une photo indécodable trop lourde.
 * Couleur unique par index : la ré-hydratation vision→master remplace par data
 * URL exacte — deux placeholders identiques mélangeraient les masters. */
function makePlaceholder(index: number): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) return FALLBACK_PLACEHOLDER;
    ctx.fillStyle = `rgb(${176 + (index % 8) * 10}, ${176 + ((index * 3) % 8) * 10}, ${176 + ((index * 5) % 8) * 10})`;
    ctx.fillRect(0, 0, 8, 8);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return FALLBACK_PLACEHOLDER;
  }
}

type VisionPhoto = { base64: string; context?: string; mimeType?: string };

/** Applique downscaleBase64ForVision à un tableau de photos, en conservant
 * context/mimeType ET la longueur du tableau (alignement d'index garanti).
 * Une photo indécodable trop lourde devient un pavé neutre, et l'utilisatrice
 * est prévenue par un toast (remplaçable via opts.onUnreadable). */
export async function downscalePhotosForVision<T extends VisionPhoto>(
  photos: T[] | undefined,
  opts?: { onUnreadable?: (count: number) => void },
): Promise<T[] | undefined> {
  if (!photos || photos.length === 0) return photos;
  let unreadable = 0;
  const out = await Promise.all(
    photos.map(async (p, i) => {
      const downscaled = await downscaleBase64ForVision(p.base64);
      const base64 = downscaled ?? (unreadable++, makePlaceholder(i));
      const m = /^data:(image\/[a-z+]+);/i.exec(base64);
      return { ...p, base64, mimeType: m ? m[1] : p.mimeType || "image/jpeg" };
    }),
  );
  if (unreadable > 0) {
    if (opts?.onUnreadable) {
      opts.onUnreadable(unreadable);
    } else {
      toast.warning(
        unreadable === 1
          ? "1 photo n'a pas pu être lue (format non reconnu ou fichier trop lourd) : l'IA ne la verra pas pendant l'analyse. Ré-importez-la en JPG ou PNG pour qu'elle soit prise en compte."
          : `${unreadable} photos n'ont pas pu être lues (format non reconnu ou fichier trop lourd) : l'IA ne les verra pas pendant l'analyse. Ré-importez-les en JPG ou PNG pour qu'elles soient prises en compte.`,
        { duration: 10000 },
      );
    }
  }
  return out;
}
