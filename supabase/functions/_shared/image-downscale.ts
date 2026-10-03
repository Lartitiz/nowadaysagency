/**
 * Re-encodes a provider image as a lighter JPEG for synchronous responses
 * (03/10/2026). Higgsfield only offers 1k / 2k / 4k: 1k (688×1024) looked soft,
 * 2k (1360×2048 PNG) weighed 6.5 MB in base64. 2k shrunk to 1024 px wide,
 * like the former OpenAI 1024×1536, is the in-between.
 *
 * imagescript fetches its WebAssembly from deno.land on first use (once per
 * isolate). Measured locally: ~0.16 s CPU for a 2k PNG. On any failure (library load,
 * unknown format, more than 10 s) the original image is returned: never lose
 * a paid image. Each outcome is logged ([image-downscale] ok / kept original).
 */
export const DOWNSCALE_WIDTH = 1024;
export const DOWNSCALE_JPEG_QUALITY = 85;

/** Upper bound for the conversion: past it the original image is sent as is. */
export const DOWNSCALE_TIMEOUT_MS = 10_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("downscale_timeout")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function downscaleToJpeg(blob: Blob, width = DOWNSCALE_WIDTH, quality = DOWNSCALE_JPEG_QUALITY, timeoutMs = DOWNSCALE_TIMEOUT_MS): Promise<Blob> {
  const t0 = Date.now();
  try {
    return await withTimeout(convert(blob, width, quality), timeoutMs).then((jpeg) => {
      console.log("[image-downscale] ok", JSON.stringify({ from: blob.size, to: jpeg.size, ms: Date.now() - t0 }));
      return jpeg;
    });
  } catch (error) {
    console.warn("[image-downscale] kept original", JSON.stringify({
      type: blob.type, bytes: blob.size, ms: Date.now() - t0, error: error instanceof Error ? error.message : "unknown",
    }));
    return blob;
  }
}

async function convert(blob: Blob, width: number, quality: number): Promise<Blob> {
  // Loaded on demand: a load failure must not break the function at boot.
  const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
  const image = await Image.decode(new Uint8Array(await blob.arrayBuffer()));
  if (image.width > width) image.resize(width, Image.RESIZE_AUTO);
  const jpeg = await image.encodeJPEG(quality);
  return new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
}
