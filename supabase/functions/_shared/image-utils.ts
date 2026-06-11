/**
 * Detect the actual media_type of an image payload so we never claim
 * image/jpeg when the bytes are image/png (Anthropic returns a 400 otherwise).
 *  1) If a data URL prefix is present, trust it (strip it from the data).
 *  2) Otherwise, sniff base64 magic bytes (PNG / JPEG / WEBP / GIF).
 *  3) Fall back to the caller-provided mime, then image/jpeg.
 */
export function extractImagePayload(
  input: string,
  fallbackMime?: string,
): { media_type: string; data: string } {
  const m = input.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (m) return { media_type: m[1].toLowerCase(), data: m[2] };
  const head = input.slice(0, 16);
  let sniffed: string | undefined;
  if (head.startsWith("iVBORw0KGgo")) sniffed = "image/png";
  else if (head.startsWith("/9j/")) sniffed = "image/jpeg";
  else if (head.startsWith("UklGR")) sniffed = "image/webp";
  else if (head.startsWith("R0lGOD")) sniffed = "image/gif";
  return { media_type: sniffed || fallbackMime || "image/jpeg", data: input };
}
