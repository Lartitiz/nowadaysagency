/**
 * Compresses an image file using Canvas to stay under a target size.
 * Returns the original file if it's already small enough or if compression fails.
 */
export async function compressImageFile(
  file: File,
  maxSizeBytes = 1.5 * 1024 * 1024, // 1.5 MB
  maxDimension = 1600
): Promise<File> {
  // Skip if already under limit
  if (file.size <= maxSizeBytes) return file;

  try {
    const bitmap = await createImageBitmap(file);
    
    // Calculate scaled dimensions
    let { width, height } = bitmap;
    if (width > maxDimension || height > maxDimension) {
      const ratio = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Try JPEG at decreasing quality until under maxSizeBytes
    for (const quality of [0.8, 0.6, 0.4]) {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      if (blob.size <= maxSizeBytes) {
        const name = file.name.replace(/\.[^.]+$/, ".jpg");
        return new File([blob], name, { type: "image/jpeg" });
      }
    }

    // Last resort: lowest quality
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.3 });
    const name = file.name.replace(/\.[^.]+$/, ".jpg");
    return new File([blob], name, { type: "image/jpeg" });
  } catch (e) {
    console.warn("Image compression failed, using original:", e);
    return file;
  }
}
