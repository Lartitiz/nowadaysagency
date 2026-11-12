// Paire avant / après indiquée par la personne (QA du 12/11/2026, option A).
// L'étape « Que montre chaque photo ? » de /creer écrit la paire DANS le
// contexte de la photo : « AVANT — la cuisine », « APRÈS — la cuisine »
// (src/features/creer/photo-context-step.ts, même marqueur). Ce contexte
// voyage déjà partout (plan, récit continu, photo, mixte, association finale) :
// on le reconnaît ici pour donner la consigne de placement.
//
// Les gabarits n'ont qu'une photo par slide : la paire va sur deux slides
// photo qui se suivent, l'avant puis l'après, chacune une seule fois.

const MARK_RE = /^(AVANT|APRÈS)(?:\s+—|\s*$)/;

export interface BeforeAfterPair {
  /** Numéros de photo, 1-based, dans l'ordre d'envoi. */
  before: number;
  after: number;
}

/** Exactement un « AVANT » et un « APRÈS » : la paire ; sinon rien. */
export function detectBeforeAfterPair(photos: Array<{ context?: string } | null | undefined> | undefined): BeforeAfterPair | null {
  if (!Array.isArray(photos)) return null;
  const before: number[] = [];
  const after: number[] = [];
  photos.forEach((p, i) => {
    const m = typeof p?.context === "string" ? p.context.trim().match(MARK_RE) : null;
    if (m) (m[1] === "AVANT" ? before : after).push(i + 1);
  });
  return before.length === 1 && after.length === 1 ? { before: before[0], after: after[0] } : null;
}

/** Consigne pour le plan et la rédaction (vide sans paire). */
export function beforeAfterPairRule(pair: BeforeAfterPair | null): string {
  if (!pair) return "";
  return `AVANT / APRÈS INDIQUÉ PAR LA PERSONNE : la photo ${pair.before} est l'avant, la photo ${pair.after} est l'après du même sujet. Montre-les sur deux slides photo qui se suivent, l'avant puis l'après, chacune une seule fois dans le carrousel. Le texte de ces deux slides nomme ce qui a changé, sans inventer de durée, de prix ni de résultat absents du brief.\n`;
}

/** Consigne pour l'association finale des photos (vide sans paire). */
export function beforeAfterMatchRule(pair: BeforeAfterPair | null): string {
  if (!pair) return "";
  return `\nPaire avant/après indiquée par la personne : PHOTO ${pair.before} = avant, PHOTO ${pair.after} = après. Mets-les sur deux slides photo consécutives qui parlent de ce changement, l'avant d'abord, et n'utilise aucune des deux ailleurs.`;
}
