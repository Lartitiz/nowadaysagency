/**
 * Sortie du rendu HyperFrames (notre Google Cloud) : lien signé du relais, donc
 * avec une signature en paramètres. Seul le fichier final d'un rendu de
 * cliente, dans notre bucket, est accepté.
 */
const HYPERFRAMES_OUTPUT_PATH =
  /^\/hyperframes-render-nowadays-reels-1113\/renders\/u-[0-9a-f-]{36}-\d+-[0-9a-f]{8}\/output\.mp4$/;

function isHyperframesOutput(url: URL): boolean {
  if (url.hostname !== "storage.googleapis.com" || url.hash) return false;
  if (!HYPERFRAMES_OUTPUT_PATH.test(url.pathname)) return false;
  // Seuls les paramètres d'une signature Google (X-Goog-*) sont tolérés.
  return [...url.searchParams.keys()].every((key) => key.startsWith("X-Goog-"));
}

/** Allowed provider outputs. Never allow arbitrary S3 buckets or redirects. */
export function isAllowedReelRenderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (isHyperframesOutput(url)) return true;
    if (url.search || url.hash) return false;
    const host = url.hostname;
    if (host === "json2video-cdn1.s3.amazonaws.com") {
      return /^\/clients\/[A-Za-z0-9_-]+\/renders\/[A-Za-z0-9_-]+\.mp4$/.test(url.pathname);
    }
    return (host === "json2video.com" || host.endsWith(".json2video.com")) && url.pathname.endsWith(".mp4");
  } catch { return false; }
}
