// Mappers purs extraits de CreerUnifie.tsx (aucun état React -> testables).

export type ContentType =
  | "story" | "reel" | "post_instagram" | "post_linkedin" | "newsletter" | "pinterest";

/** Déduit le canal (réseau) à partir d'un état de flux restauré. */
export function deriveCanalFromState(s: any): string | null {
  if (!s) return null;
  if (s.selectedFormat === "linkedin" || s.isLinkedInCarousel) return "linkedin";
  if ((s.selectedFormat || "").startsWith("pinterest")) return "pinterest";
  if (s.selectedFormat === "newsletter") return "newsletter";
  if (s.selectedFormat) return "instagram";
  return null;
}

/**
 * Renumérote les slides 1..N dans l'ordre du tableau. L'IA renvoie parfois des
 * slide_number fantaisistes (fractionnaires « 4.5 », doublons) alors que
 * l'ordre du tableau fait foi partout (rendu, visuels, exports, calendrier).
 */
export function renumberSlides<T extends { slide_number?: number | string }>(slides: T[]): T[] {
  return slides.map((s, i) => ({ ...s, slide_number: i + 1 }));
}

/** Mappe un format d'UI vers le content_type stocké en base. */
export function mapFormatToContentType(fmt: string | null): ContentType {
  if (fmt === "newsletter") return "newsletter";
  if (fmt === "story") return "story";
  if (fmt === "reel") return "reel";
  if (fmt === "linkedin") return "post_linkedin";
  if (fmt === "pinterest" || fmt === "pinterest_visual" || fmt === "pinterest_photo") return "pinterest";
  return "post_instagram";
}
