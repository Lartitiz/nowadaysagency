/** Allowed provider outputs. Never allow arbitrary S3 buckets or redirects. */
export function isAllowedReelRenderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
    const host = url.hostname;
    if (host === "json2video-cdn1.s3.amazonaws.com") {
      return /^\/clients\/[A-Za-z0-9_-]+\/renders\/[A-Za-z0-9_-]+\.mp4$/.test(url.pathname);
    }
    return (host === "json2video.com" || host.endsWith(".json2video.com")) && url.pathname.endsWith(".mp4");
  } catch { return false; }
}
