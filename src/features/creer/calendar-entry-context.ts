// Repères envoyés par le calendrier à /creer (notes, accroche déjà écrite,
// contexte de lancement) : avant le 16/10/2026, la fenêtre d'un post les
// envoyait dans le navigate state mais /creer ne les lisait jamais. Ils sont
// maintenant ajoutés au « contenu existant » que tous les générateurs
// transmettent déjà à l'IA, après un marqueur à part pour que l'étape
// « Modifier » ne les reprenne jamais comme texte du post.

export const CALENDAR_CONTEXT_HEADER = "[Repères du calendrier]";
const NOTES_MAX = 1500;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** Lignes de repères tirées du state du calendrier ; vide hors calendrier. */
export function calendarContextLines(locState: any): string[] {
  if (!locState?.fromCalendar) return [];
  const draft = str(locState.existingContent);
  const lines: string[] = [];

  const accroche = str(locState.existingAccroche);
  if (accroche && !draft.includes(accroche)) lines.push(`Accroche déjà écrite : ${accroche}`);

  const notes = str(locState.notes);
  if (notes) lines.push(`Notes : ${notes.length > NOTES_MAX ? `${notes.slice(0, NOTES_MAX - 3)}...` : notes}`);

  const launch = locState.launchContext;
  if (launch && typeof launch === "object") {
    const parts: string[] = [];
    const type = str(launch.contentType) || str(locState.contentType);
    const chapitre = str(launch.chapterLabel) || str(launch.chapter);
    const phase = str(launch.audiencePhase);
    if (type) parts.push(`type de contenu « ${type} »`);
    if (chapitre) parts.push(`chapitre « ${chapitre} »`);
    if (phase) parts.push(`phase d'audience « ${phase} »`);
    lines.push(parts.length ? `Contenu d'un lancement : ${parts.join(", ")}` : "Contenu d'un lancement");
  }
  return lines;
}

/**
 * Contenu existant à transmettre aux générateurs : le brouillon du post, suivi
 * des repères du calendrier. `draft` seul (ou null) quand il n'y a pas de repère.
 */
export function buildCalendarExistingContent(locState: any, draft: string | null = str(locState?.existingContent) || null): string | null {
  const lines = calendarContextLines(locState);
  if (!lines.length) return draft;
  const block = `${CALENDAR_CONTEXT_HEADER}\n${lines.join("\n")}`;
  return draft ? `${draft}\n\n${block}` : block;
}

/** Retire les repères du calendrier : ne reste que le brouillon du post. */
export function stripCalendarContext(text: string | null | undefined): string {
  if (!text) return "";
  const i = text.indexOf(CALENDAR_CONTEXT_HEADER);
  return i < 0 ? text : text.slice(0, i).trimEnd();
}
