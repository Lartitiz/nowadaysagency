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
  const originalPath = `${userId}/${photoId}_original.jpg`;
  const finalPath = `${userId}/${photoId}.jpg`;

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

  // Update the row with the real paths
  const update = await supabase
    .from("user_photos")
    .update({
      storage_path: finalPath,
      original_storage_path: originalPath,
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
  const { data, error } = await supabase.storage
    .from(USER_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
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
  const paths = [photo.storage_path, photo.original_storage_path].filter(Boolean) as string[];
  if (paths.length > 0) {
    await supabase.storage.from(USER_PHOTOS_BUCKET).remove(paths);
  }
  const { error } = await supabase.from("user_photos").delete().eq("id", photo.id);
  if (error) throw new Error(error.message);
}
