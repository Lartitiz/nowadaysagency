import { buildCalendarContent } from "@/features/creer/build-calendar-content";

/**
 * Certaines idées ont été enregistrées avec le JSON brut de génération
 * (`{"carousel_type":"mix","slides":[...]}`) au lieu du texte lisible.
 * Cette fonction détecte ce cas et reconstruit le brouillon lisible.
 */
export function renderIdeaDraft(raw: string | null | undefined, formatHint?: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return raw;

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return raw;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw;

  const detected =
    parsed.carousel_type || parsed.slides ? "carousel"
    : parsed.sections ? "reel"
    : parsed.stories ? "story"
    : parsed.subject ? "newsletter"
    : parsed.full_text ? "linkedin"
    : formatHint || "post";

  try {
    const { contentDraft } = buildCalendarContent(detected, parsed);
    return contentDraft?.trim() ? contentDraft : raw;
  } catch {
    return raw;
  }
}
