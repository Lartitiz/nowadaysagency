// Contexte d'une actu sauvegardée depuis « Réagir à une actualité » (18/10/2026).
// Mes idées, l'accueil et la fiche d'idée du calendrier l'envoient à /creer
// (state.context → newsjackingContext) : sans lui, le contenu était écrit avec
// le seul titre, sans le résumé, la source ni les faits de l'article.

interface IdeeActu {
  titre: string;
  format?: string | null;
  source_module?: string | null;
  notes?: string | null;
  content_data?: unknown;
}

export function isSavedActu(idea: IdeeActu): boolean {
  return idea.source_module === "newsjacking" && idea.format === "actu";
}

export function actuContext(idea: IdeeActu): string | null {
  let data: any = idea.content_data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  const titre = (data?.titre || idea.titre || "").replace(/^📰\s*/, "").trim();
  if (!data?.titre) return idea.notes?.trim() ? `ACTUALITÉ : ${titre}\n${idea.notes.trim()}` : null;
  const faits = Array.isArray(data.faits_cles) && data.faits_cles.length
    ? `\n\nFAITS DE L'ARTICLE (à exploiter, ne rien inventer d'autre) :\n${data.faits_cles.map((f: string) => `- ${f}`).join("\n")}`
    : "";
  return [
    `ACTUALITÉ : ${titre}`,
    `Source : ${data.source || ""}${data.source_url ? ` (${data.source_url})` : ""}`,
    data.date_publication ? `Date : ${data.date_publication}` : "",
    `Résumé : ${data.resume || ""}`,
    `Pertinence : ${data.pertinence || ""}`,
  ].filter(Boolean).join("\n") + faits;
}
