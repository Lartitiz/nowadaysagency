const AI_CONTENT_SOURCES = new Set(["creer", "recycling", "crosspost", "creative_workshop"]);

/** Afficher la mention IA seulement quand l'origine du texte est connue. */
export function isAiGeneratedContent(data: unknown, sourceModule?: string | null): boolean {
  if (data && typeof data === "object") {
    const content = data as Record<string, unknown>;
    if (content._ai_generated === true) return true;
    const calendarDetail = content.story_sequence_detail;
    if (calendarDetail && typeof calendarDetail === "object" && (calendarDetail as Record<string, unknown>)._ai_generated === true) return true;
  }
  return AI_CONTENT_SOURCES.has(sourceModule || "");
}
