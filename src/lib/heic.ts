/**
 * heic — conversion HEIC/HEIF → JPEG côté client.
 *
 * Les photos d'iPhone arrivent en HEIC : ni `createImageBitmap` ni les canvas
 * ne savent les décoder dans le navigateur. Toute entrée de photo utilisateur
 * (bibliothèque, retouche, fond de story) doit passer par cette conversion —
 * c'est le bug « je ne peux ajouter qu'une photo » du 08/07/2026 : les HEIC
 * étaient rejetées au lieu d'être converties.
 */

export function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

export async function convertHeicIfNeeded(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  // Import dynamique — heic2any (~80 ko) ne charge que si nécessaire
  const heic2any = (await import("heic2any")).default;
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const out = Array.isArray(blob) ? blob[0] : blob;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([out], newName, { type: "image/jpeg" });
}

/** Accept d'input file couvrant les photos d'iPhone (le type MIME HEIC est parfois vide). */
export const PHOTO_INPUT_ACCEPT = "image/*,.heic,.heif";
