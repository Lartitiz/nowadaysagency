/**
 * Re-encodes a provider image as a lighter JPEG for synchronous responses
 * (03/10/2026). Higgsfield only offers 1k / 2k / 4k: 1k (688×1024) looked soft,
 * 2k (1360×2048 PNG) weighed 6.5 MB in base64. 2k shrunk to 1024 px wide,
 * like the former OpenAI 1024×1536, is the in-between.
 *
 * imagescript fetches its WebAssembly from deno.land on first use (once per
 * isolate). Measured locally: ~0.16 s CPU for a 2k PNG. On any failure (library load,
 * unknown format) the original image is returned: never lose a paid image.
 */
export const DOWNSCALE_WIDTH = 1024;
export const DOWNSCALE_JPEG_QUALITY = 85;

export async function downscaleToJpeg(blob: Blob, width = DOWNSCALE_WIDTH, quality = DOWNSCALE_JPEG_QUALITY): Promise<Blob> {
  try {
    // Loaded on demand: a load failure must not break the function at boot.
    const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
    const image = await Image.decode(new Uint8Array(await blob.arrayBuffer()));
    if (image.width > width) image.resize(width, Image.RESIZE_AUTO);
    const jpeg = await image.encodeJPEG(quality);
    return new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
  } catch (error) {
    console.warn("[image-downscale] kept original", JSON.stringify({
      type: blob.type, bytes: blob.size, error: error instanceof Error ? error.message : "unknown",
    }));
    return blob;
  }
}
