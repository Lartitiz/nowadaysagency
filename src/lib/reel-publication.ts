/** Only archived MP4s can leave the editor; renderer and signed URLs expire. */
export function isDurableReelUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === new URL(import.meta.env.VITE_SUPABASE_URL).origin && url.protocol === "https:" && !url.search && !url.hash && !url.username && !url.password
      && /^\/storage\/v1\/object\/public\/calendar-media\/.+\.mp4$/i.test(url.pathname);
  } catch { return false; }
}

/** Caption edits do not change the mounted video; script/overlay/timing edits do. */
export function reelSourceKey(raw: any): string {
  return JSON.stringify(raw?.sections || (Array.isArray(raw?.script) ? raw.script : raw?.script?.sections) || []);
}

export const REEL_VIDEO_REQUIRED = "Monte et enregistre la vidéo MP4 avant de publier ou programmer ce Reel.";
