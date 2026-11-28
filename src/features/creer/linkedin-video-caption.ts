// Légende LinkedIn d'une vidéo (28/11/2026) — logique pure, testée seule.
// Le script d'un reel arrive avec une légende écrite pour Instagram (hashtags,
// stories de relance). Sur LinkedIn, la légende est réécrite par la consigne
// LinkedIn (linkedin-ai, media_kind "video") puis rangée dans le résultat avec
// la marque `caption_channel: "linkedin"` : tant que cette marque manque, la
// légende affichée n'est PAS celle de LinkedIn et rien ne part.

type Raw = Record<string, any> | null | undefined;

/** Le texte dit à l'oral, passage par passage, borné pour la consigne. */
export function videoScriptSummary(raw: Raw): string {
  const sections: any[] = Array.isArray(raw?.sections) ? raw!.sections : [];
  const spoken = sections
    .map((s) => (typeof s?.texte_parle === "string" ? s.texte_parle.trim() : ""))
    .filter(Boolean)
    .join("\n");
  return (spoken || (typeof raw?.script === "string" ? raw!.script : "")).slice(0, 6000);
}

/** La légende de ce résultat a-t-elle été écrite pour LinkedIn ? */
export function hasLinkedInVideoCaption(raw: Raw): boolean {
  return raw?.caption_channel === "linkedin" && typeof raw?.caption?.text === "string" && raw.caption.text.trim().length > 0;
}

/** Range la réponse de linkedin-ai ({hook, body, cta, hashtags}) dans la forme du reel. */
export function applyLinkedInVideoCaption(raw: Record<string, any>, parsed: any): Record<string, any> | null {
  const text = [parsed?.hook, parsed?.body]
    .filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x: string) => x.trim())
    .join("\n\n");
  if (!text) return null;
  const hashtags = (Array.isArray(parsed?.hashtags) ? parsed.hashtags : [])
    .filter((h: unknown): h is string => typeof h === "string")
    .map((h: string) => `#${h.replace(/^#+/, "").replace(/\s+/g, "")}`)
    .filter((h: string) => h.length > 1)
    .slice(0, 2);
  return {
    ...raw,
    caption: { text, cta: typeof parsed?.cta === "string" ? parsed.cta.trim() : "" },
    hashtags,
    caption_channel: "linkedin",
  };
}

/** Texte publié avec la vidéo : légende, invitation, hashtags. Vide tant que la légende LinkedIn manque. */
export function linkedInVideoPublishText(raw: Raw): string {
  if (!hasLinkedInVideoCaption(raw)) return "";
  const tags = Array.isArray(raw!.hashtags) ? raw!.hashtags.filter((h: unknown) => typeof h === "string").join(" ") : "";
  return [raw!.caption.text, raw!.caption.cta, tags].filter((x) => typeof x === "string" && x.trim()).join("\n\n");
}

export const LINKEDIN_VIDEO_CAPTION_MISSING = "La légende LinkedIn de cette vidéo n'est pas encore écrite : ouvre l'étape « Légende ».";

/**
 * Résultat tel qu'il part au calendrier pour une vidéo LinkedIn : jamais les
 * stories de relance (propres à Instagram), et jamais la légende Instagram
 * d'origine — sans légende LinkedIn, la légende part vide et le calendrier
 * demande de l'écrire avant de publier.
 */
export function linkedInVideoRawForCalendar<T extends Record<string, any> | null | undefined>(raw: T): T {
  if (!raw) return raw;
  const base = { ...raw, amplification_stories: [] };
  return (hasLinkedInVideoCaption(raw) ? base : { ...base, caption: null, hashtags: [] }) as T;
}
