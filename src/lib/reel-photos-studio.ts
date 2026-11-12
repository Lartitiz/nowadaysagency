import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import { MAX_VIDEO_IMAGES, type VideoDraft, type VideoReference } from "@/features/studio-video/sources";

/**
 * Photos d'un Reel (/creer) → images de départ du Studio vidéo.
 * Le Studio ne lit que des photos rangées dans « Mes photos » : celles importées
 * dans /creer y sont d'abord ajoutées (une seule fois, l'id est gardé).
 */
export type UploadToLibrary = (file: File, name: string) => Promise<string>;

function photoBytes(photo: PhotoItem): string | null {
  const bytes = photo.originalBase64 || photo.base64 || photo.preview;
  if (!bytes) return null;
  return /^(data:|https:\/\/|blob:)/.test(bytes) ? bytes : `data:${photo.originalMimeType || photo.mimeType || "image/jpeg"};base64,${bytes}`;
}

export async function photosToVideoReferences(photos: PhotoItem[], upload: UploadToLibrary, known = new Map<number, string>()): Promise<VideoReference[]> {
  const kept = photos.slice(0, MAX_VIDEO_IMAGES);
  const refs: VideoReference[] = [];
  for (let i = 0; i < kept.length; i++) {
    const photo = kept[i];
    let id = photo.userPhotoId || known.get(i);
    if (!id) {
      const url = photoBytes(photo);
      if (!url) throw new Error(`La photo « ${photo.name || i + 1} » n'est plus disponible. Recharge-la puis réessaie.`);
      const blob = await (await fetch(url)).blob();
      const name = photo.name || `Photo ${i + 1}`;
      id = await upload(new File([blob], name, { type: blob.type || "image/jpeg" }), name);
      known.set(i, id);
    }
    // Avant / après : deux vues du même lieu, toutes « sujet » (l'ordre dit qui est l'avant).
    refs.push({ kind: "photo", id, name: photo.name || `Photo ${i + 1}`, role: "subject" });
  }
  return refs;
}

/** Consigne de départ, modifiable dans le Studio. */
export function reelPhotosVideoPrompt(photoCount: number): string {
  return photoCount >= 2
    ? "Avant / après : partir du lieu tel qu'il est sur la première photo et arriver au résultat de la deuxième, avec un mouvement de caméra lent, sans texte à l'écran."
    : "Animer cette photo avec un mouvement de caméra lent et naturel, sans texte à l'écran.";
}

export function reelPhotosVideoDraft(images: VideoReference[]): VideoDraft {
  return { images, useImages: true, prompt: reelPhotosVideoPrompt(images.length), duration: 5, resolution: "480p", aspectRatio: "9:16", shot: "", camera: "", light: "" };
}
