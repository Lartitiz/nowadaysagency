/**
 * story-photos — résolution des photos par story (lot B stories visuelles).
 *
 * La génération assigne des photos de la bibliothèque par `visual.photo_id`
 * (UUID user_photos, persisté dans le JSON de la séquence). Les URLs signées
 * expirent : on les résout à CHAQUE affichage, en mémoire seulement — jamais
 * écrites dans l'état persisté.
 */

import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls, USER_PHOTOS_BUCKET } from "@/lib/photo-storage";

export interface StoryLike {
  visual?: { photo_id?: string | null } | null;
}

/**
 * Résout les photo_id d'une séquence en URLs signées (1h).
 * Retourne une Map photo_id → url ; les ids introuvables (photo supprimée,
 * autre workspace) sont simplement absents — l'appelant retombe sur la
 * directive ou le fond couleur.
 */
export async function resolveLibraryPhotoUrls(
  stories: StoryLike[],
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(
      (stories || [])
        .map((s) => s?.visual?.photo_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("user_photos")
    .select("id, storage_path, status")
    .in("id", ids);
  if (error || !data) {
    if (error) console.warn("[story-photos] résolution impossible:", error.message);
    return new Map();
  }

  const ready = data.filter((r) => r.status === "ready" && r.storage_path);
  const urlByPath = await getSignedPhotoUrls(ready.map((r) => r.storage_path));
  const out = new Map<string, string>();
  for (const r of ready) {
    const url = urlByPath.get(r.storage_path);
    if (url) out.set(r.id, url);
  }
  return out;
}

/**
 * Convertit une URL (signée ou stock https) en data URL — utilisé au moment
 * de l'export pour que html2canvas / PPTX n'aient jamais de souci CORS/expiration.
 */
export async function urlToDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Lecture impossible"));
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("[story-photos] fetch photo export:", e);
    return null;
  }
}

/**
 * Fichier image → data URL JPEG redimensionnée (fond de story « Ma photo »).
 * Le data URL est appliqué immédiatement au fond ; l'upload vers la
 * bibliothèque se fait en parallèle, best-effort.
 */
export async function fileToResizedDataUrl(file: File, maxDim = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export { USER_PHOTOS_BUCKET };
