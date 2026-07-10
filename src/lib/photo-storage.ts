/**
 * Photo storage helpers — Plan Photo 3.
 *
 * The /photos workflow is split into two steps:
 *   1. uploadPhotoOriginal()  → compress + upload to bucket + insert user_photos row (status=pending)
 *   2. invoke "photo-background-replace" edge function with the photo_id
 *
 * The edge function reads {user_id}/{photo_id}_original.jpg, generates the
 * background, and writes {user_id}/{photo_id}.jpg. Realtime updates the UI.
 */

import { supabase } from "@/integrations/supabase/client";

export const USER_PHOTOS_BUCKET = "user-photos";
const MAX_DIMENSION = 2048;
const TARGET_MAX_BYTES = 5 * 1024 * 1024; // 5 MB upload cap

export type PhotoStatus = "pending" | "processing" | "ready" | "failed";

export interface UserPhotoRow {
  id: string;
  user_id: string;
  workspace_id: string;
  storage_path: string;
  original_storage_path: string;
  status: PhotoStatus;
  name: string | null;
  tags: string[];
  description: string | null;
  /** Type classé par l'IA : produit, produit_porte, portrait, ambiance, coulisses, autre. */
  kind: string | null;
  background_prompt: string | null;
  background_preset_key: string | null;
  source_type: string;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Compress an image with canvas, capping dimension and target byte size.
 * Returns a JPEG Blob.
 */
async function compressToJpeg(
  file: File,
  maxDimension = MAX_DIMENSION,
  maxBytes = TARGET_MAX_BYTES,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
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
  // JPEG n'a pas d'alpha : sans fond posé d'abord, les pixels transparents
  // d'un PNG deviennent NOIRS à l'encodage. Fond blanc = rendu attendu.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of [0.9, 0.8, 0.7, 0.55, 0.4]) {
    const blob =
      "convertToBlob" in canvas
        ? await (canvas as OffscreenCanvas).convertToBlob({ type: "image/jpeg", quality })
        : await new Promise<Blob>((resolve, reject) =>
            (canvas as unknown as HTMLCanvasElement).toBlob(
              (b) => (b ? resolve(b) : reject(new Error("toBlob a échoué"))),
              "image/jpeg",
              quality,
            ),
          );
    if (blob.size <= maxBytes) return { blob, width, height };
  }

  // Last resort
  const blob =
    "convertToBlob" in canvas
      ? await (canvas as OffscreenCanvas).convertToBlob({ type: "image/jpeg", quality: 0.3 })
      : await new Promise<Blob>((resolve, reject) =>
          (canvas as unknown as HTMLCanvasElement).toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob a échoué"))),
            "image/jpeg",
            0.3,
          ),
        );
  return { blob, width, height };
}

export interface UploadOriginalParams {
  file: File;
  userId: string;
  workspaceId: string;
  /** Optional name for the photo card (defaults to file name without extension). */
  name?: string;
  backgroundPrompt?: string;
  backgroundPresetKey?: string;
  /**
   * "retouche" (défaut) : flux historique en 2 temps, l'edge
   * photo-background-replace produira le fichier final.
   * "library" : ajout direct à la bibliothèque — un seul fichier uploadé,
   * la ligne passe à status=ready sans traitement.
   */
  purpose?: "retouche" | "library";
}

export interface UploadOriginalResult {
  photoId: string;
  originalPath: string;
}

/**
 * Compresses + uploads the original to the user-photos bucket and inserts
 * a user_photos row with status='pending'. Returns the photo id.
 */
export async function uploadPhotoOriginal({
  file,
  userId,
  workspaceId,
  name,
  backgroundPrompt,
  backgroundPresetKey,
  purpose = "retouche",
}: UploadOriginalParams): Promise<UploadOriginalResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier doit être une image.");
  }

  const { blob, width, height } = await compressToJpeg(file);

  // Insert row first to get the id (status=pending so RLS sees it)
  const baseName = (name ?? file.name).replace(/\.[^.]+$/, "").slice(0, 120) || "Photo";
  const insertRes = await supabase
    .from("user_photos")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      storage_path: "", // placeholder, updated below
      original_storage_path: "", // placeholder, updated below
      status: "pending" as PhotoStatus,
      name: baseName,
      background_prompt: backgroundPrompt ?? null,
      background_preset_key: backgroundPresetKey ?? null,
      source_type: "upload",
      width,
      height,
      file_size_bytes: blob.size,
    })
    .select("id")
    .single();

  if (insertRes.error || !insertRes.data) {
    const raw = insertRes.error?.message || "";
    if (raw.toLowerCase().includes("row-level security")) {
      throw new Error("Espace de travail invalide. Recharge la page et réessaie.");
    }
    throw new Error(raw || "Impossible de créer la photo");
  }

  const photoId = insertRes.data.id as string;
  const finalPath = `${userId}/${photoId}.jpg`;
  // Bibliothèque : un seul fichier, directement au chemin final (pas d'_original
  // puisqu'il n'y a pas de traitement). Retouche : flux historique en 2 fichiers.
  const originalPath = purpose === "library" ? finalPath : `${userId}/${photoId}_original.jpg`;

  const upload = await supabase.storage
    .from(USER_PHOTOS_BUCKET)
    .upload(originalPath, blob, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (upload.error) {
    // Best-effort cleanup
    await supabase.from("user_photos").delete().eq("id", photoId);
    const raw = upload.error.message || "";
    if (raw.toLowerCase().includes("row-level security")) {
      throw new Error("Le stockage a refusé l'envoi de la photo. Recharge la page puis réessaie.");
    }
    throw new Error(raw || "Impossible d'envoyer la photo dans le stockage");
  }

  // Update the row with the real paths (library : prête immédiatement)
  const update = await supabase
    .from("user_photos")
    .update({
      storage_path: finalPath,
      original_storage_path: originalPath,
      ...(purpose === "library" ? { status: "ready" as PhotoStatus } : {}),
    })
    .eq("id", photoId);

  if (update.error) {
    throw new Error(update.error.message || "Impossible de finaliser la photo");
  }

  return { photoId, originalPath };
}

/**
 * Returns a signed URL valid for `expiresInSeconds` (default 1h).
 * Returns null if the path is empty or the request fails.
 */
export async function getSignedPhotoUrl(
  path: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  // La signature peut échouer transitoirement (5xx storage observé en prod) :
  // sans retry, la vignette reste vide en silence.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.storage
      .from(USER_PHOTOS_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (!error && data?.signedUrl) return data.signedUrl;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

/**
 * Signs multiple paths in a single call. Returns a Map path → signedUrl
 * (failed paths are simply absent from the Map).
 */
export async function getSignedPhotoUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Map<string, string>> {
  const valid = paths.filter(Boolean);
  if (valid.length === 0) return new Map();

  // Même retry que getSignedPhotoUrl : un échec transitoire du batch
  // laissait TOUTES les vignettes vides (picker, stories).
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.storage
      .from(USER_PHOTOS_BUCKET)
      .createSignedUrls(valid, expiresInSeconds);
    if (!error && data) {
      const map = new Map<string, string>();
      for (const entry of data) {
        if (entry.signedUrl && entry.path) map.set(entry.path, entry.signedUrl);
      }
      return map;
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return new Map();
}

/**
 * Loads a user_photos row from storage and converts it to a base64 data URL,
 * matching the shape used by PhotoUploadZone (PhotoItem.base64 = full data URL).
 */
export async function userPhotoToBase64(
  photo: UserPhotoRow,
): Promise<{ base64: string; mimeType: string; name: string }> {
  const url = await getSignedPhotoUrl(photo.storage_path, 300);
  if (!url) throw new Error("Impossible de charger la photo.");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Impossible de charger la photo.");
  const blob = await res.blob();
  const name = photo.name || "photo";
  const MAX_DIM = 1600;

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

    const isPng = blob.type === "image/png";
    const outType = isPng ? "image/png" : "image/jpeg";
    const quality = isPng ? undefined : 0.8;

    let base64: string;
    if ("convertToBlob" in canvas) {
      const outBlob = await (canvas as OffscreenCanvas).convertToBlob(
        isPng ? { type: outType } : { type: outType, quality },
      );
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
        reader.readAsDataURL(outBlob);
      });
    } else {
      base64 = (canvas as unknown as HTMLCanvasElement).toDataURL(outType, quality);
    }
    return { base64, mimeType: outType, name };
  } catch (e) {
    console.warn("[userPhotoToBase64] resize failed, falling back to raw blob", e);
    const mimeType = blob.type || "image/jpeg";
    const base64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
      reader.readAsDataURL(blob);
    });
    return { base64, mimeType, name };
  }
}

/**
 * Charge le fichier stocké d'une photo en data URL SANS repasser par un canvas
 * (le fichier bibliothèque est déjà ≤2048px / 5 Mo à l'upload). Utilisé par le
 * packshot, où on veut envoyer la pleine résolution stockée à Photoroom.
 */
export async function userPhotoToRawBase64(
  photo: Pick<UserPhotoRow, "storage_path">,
): Promise<string> {
  const url = await getSignedPhotoUrl(photo.storage_path, 300);
  if (!url) throw new Error("Impossible de charger la photo.");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Impossible de charger la photo.");
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Triggers a download via the browser. Uses a signed URL to fetch the blob,
 * then forces a descriptive filename.
 */
export async function downloadPhoto(path: string, filename: string): Promise<void> {
  const url = await getSignedPhotoUrl(path, 60);
  if (!url) throw new Error("Téléchargement impossible");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Téléchargement impossible");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

/**
 * Deletes the user_photos row + both storage objects.
 */
export async function deletePhotoCompletely(photo: Pick<UserPhotoRow, "id" | "storage_path" | "original_storage_path">): Promise<void> {
  // Photos bibliothèque : storage_path === original_storage_path → dédup
  const paths = Array.from(
    new Set([photo.storage_path, photo.original_storage_path].filter(Boolean)),
  ) as string[];
  if (paths.length > 0) {
    await supabase.storage.from(USER_PHOTOS_BUCKET).remove(paths);
  }
  const { error } = await supabase.from("user_photos").delete().eq("id", photo.id);
  if (error) throw new Error(error.message);
}
