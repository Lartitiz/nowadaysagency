/**
 * Centralized format normalization for the content creation flow.
 *
 * The "Surprise" mode and some legacy entry points may pass non-canonical
 * format values (like "auto", "post_texte", "carrousel"…). This util converts
 * them to the canonical formats supported by `useContentGenerator`, or returns
 * `null` when no safe mapping exists.
 */

export const SUPPORTED_FORMATS = [
  "post",
  "carousel",
  "reel",
  "story",
  "linkedin",
  "newsletter",
  "pinterest",
  "pinterest_visual",
  "pinterest_inspiration",
  "pinterest_photo",
] as const;

export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

const ALIASES: Record<string, SupportedFormat> = {
  post_texte: "post",
  post_photo: "post",
  post_carrousel: "carousel",
  carrousel: "carousel",
  story_serie: "story",
  reel_video: "reel",
  reels: "reel",
  stories: "story",
  pinterest_text: "pinterest",
  pinterest_pin: "pinterest",
  email: "newsletter",
  linkedin_post: "linkedin",
  linkedin_carousel: "carousel",
};

/**
 * Returns a canonical format or null if the value is unknown / "auto".
 */
export function normalizeFormat(raw: unknown): SupportedFormat | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v || v === "auto" || v === "any" || v === "default") return null;
  if ((SUPPORTED_FORMATS as readonly string[]).includes(v)) return v as SupportedFormat;
  if (ALIASES[v]) return ALIASES[v];
  return null;
}

export function isSupportedFormat(raw: unknown): raw is SupportedFormat {
  return normalizeFormat(raw) !== null && raw === normalizeFormat(raw);
}
