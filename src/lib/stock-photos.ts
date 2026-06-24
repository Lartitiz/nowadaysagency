/**
 * stock-photos — recherche de photos libres de droit (Pexels) et conversion en
 * PhotoItem, pour les injecter dans PhotoUploadZone comme si elles avaient été
 * uploadées. Une fois converties en base64, elles traversent tout le pipeline
 * existant (vision IA qui les place au bon endroit, aperçu, rendu visuel, export)
 * sans aucun traitement particulier.
 */

import { supabase } from "@/integrations/supabase/client";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";

export interface StockPhoto {
  id: string;
  url: string;
  thumbnail: string;
  width: number | null;
  height: number | null;
  alt: string;
  photographer: string;
  photographer_url: string;
  source_url: string;
  avg_color: string;
}

export interface StockSearchOptions {
  perPage?: number;
  orientation?: "portrait" | "landscape" | "square";
}

export async function searchStockPhotos(
  query: string,
  opts: StockSearchOptions = {},
): Promise<StockPhoto[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke("stock-photo-search", {
    body: {
      query: q,
      per_page: opts.perPage ?? 24,
      orientation: opts.orientation ?? "portrait",
    },
  });
  if (error) throw new Error(error.message || "La recherche d'images a échoué.");
  if (data?.error) throw new Error(data.error);
  return (data?.photos ?? []) as StockPhoto[];
}

const MAX_DIM = 1600;

/**
 * Télécharge une photo stock et la convertit en PhotoItem (base64 redimensionné),
 * exactement à la forme produite par PhotoUploadZone pour une photo uploadée.
 */
export async function stockPhotoToPhotoItem(stock: StockPhoto): Promise<PhotoItem> {
  const res = await fetch(stock.url, { mode: "cors" });
  if (!res.ok) throw new Error("Téléchargement de la photo impossible.");
  const blob = await res.blob();
  const { base64, mimeType } = await blobToResizedBase64(blob);
  const name = stock.alt
    ? `${slugify(stock.alt).slice(0, 40) || "pexels"}.jpg`
    : `pexels-${stock.id}.jpg`;
  return {
    id: crypto.randomUUID(),
    base64,
    preview: base64,
    name,
    mimeType,
    context: "",
    // Traçabilité de la source libre de droit (crédit photographe Pexels).
    stockSource: "pexels",
    stockPhotographer: stock.photographer,
    stockSourceUrl: stock.source_url,
  };
}

async function blobToResizedBase64(
  blob: Blob,
): Promise<{ base64: string; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;
    if (width > MAX_DIM || height > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : (() => {
            const c = document.createElement("canvas");
            c.width = width;
            c.height = height;
            return c as unknown as OffscreenCanvas;
          })();
    const ctx = canvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error("Canvas indisponible");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    if ("convertToBlob" in canvas) {
      const outBlob = await (canvas as OffscreenCanvas).convertToBlob({
        type: "image/jpeg",
        quality: 0.82,
      });
      return { base64: await blobToDataUrl(outBlob), mimeType: "image/jpeg" };
    }
    const dataUrl = (canvas as unknown as HTMLCanvasElement).toDataURL(
      "image/jpeg",
      0.82,
    );
    return { base64: dataUrl, mimeType: "image/jpeg" };
  } catch (e) {
    console.warn("[stockPhotoToPhotoItem] resize failed, falling back to raw blob", e);
    return { base64: await blobToDataUrl(blob), mimeType: blob.type || "image/jpeg" };
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(blob);
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
