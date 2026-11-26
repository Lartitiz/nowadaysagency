/** Mes idées : une « demande en cours » (content_briefs) écrite aux questions
 *  de Créer a, depuis #1927, une fiche jumelle dans saved_ideas (brouillon ou
 *  contenu écrit, même sujet). Afficher les deux faisait voir le même sujet
 *  deux fois (QA du 13/11/2026). On masque la demande quand la fiche existe. */
const norm = (s: string | null | undefined) =>
  (s || "").toLocaleLowerCase("fr").replace(/[«»"'’.…!?]/g, "").replace(/\s+/g, " ").trim();

export function briefsWithoutTwin<B extends { subject: string | null }>(briefs: B[], startedTitles: (string | null | undefined)[]): B[] {
  const titles = new Set(startedTitles.map(norm).filter(Boolean));
  return briefs.filter((b) => !titles.has(norm(b.subject)));
}

/** Demandes cachées par une fiche : à supprimer avec elle, sinon elles réapparaîtraient. */
export function twinBriefIds<B extends { id: string; subject: string | null }>(briefs: B[], title: string | null | undefined): string[] {
  const t = norm(title);
  return t ? briefs.filter((b) => norm(b.subject) === t).map((b) => b.id) : [];
}

/** Le même sujet commencé plusieurs fois (« La pré-commercialisation… » ×3 sur un
 *  compte, 26/11/2026) : on ne montre que la plus récente. */
export function latestBySubject<B extends { subject: string | null; created_at?: string | null }>(briefs: B[]): B[] {
  const best = new Map<string, B>();
  const rest: B[] = [];
  for (const b of briefs) {
    const key = norm(b.subject);
    if (!key) { rest.push(b); continue; }
    const seen = best.get(key);
    if (!seen || (b.created_at || "") > (seen.created_at || "")) best.set(key, b);
  }
  return [...best.values(), ...rest];
}
