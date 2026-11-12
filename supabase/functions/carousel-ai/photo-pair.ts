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

/**
 * Paires indiquées par la personne. Dans l'ordre des photos, le 1er « AVANT »
 * va avec le 1er « APRÈS », le 2e avec le 2e… (même règle que l'étape de
 * /creer). Autant d'avants que d'après, sinon aucune paire.
 */
export function detectBeforeAfterPairs(photos: Array<{ context?: string } | null | undefined> | undefined): BeforeAfterPair[] {
  if (!Array.isArray(photos)) return [];
  const before: number[] = [];
  const after: number[] = [];
  photos.forEach((p, i) => {
    const m = typeof p?.context === "string" ? p.context.trim().match(MARK_RE) : null;
    if (m) (m[1] === "AVANT" ? before : after).push(i + 1);
  });
  if (!before.length || before.length !== after.length) return [];
  return before.map((b, k) => ({ before: b, after: after[k] }));
}

/** Exactement un « AVANT » et un « APRÈS » : la paire ; sinon rien. */
export function detectBeforeAfterPair(photos: Array<{ context?: string } | null | undefined> | undefined): BeforeAfterPair | null {
  const pairs = detectBeforeAfterPairs(photos);
  return pairs.length === 1 ? pairs[0] : null;
}

function asList(pairs: BeforeAfterPair | BeforeAfterPair[] | null): BeforeAfterPair[] {
  if (!pairs) return [];
  return Array.isArray(pairs) ? pairs : [pairs];
}

/** Consigne pour le plan et la rédaction (vide sans paire). Texte d'une seule paire inchangé. */
export function beforeAfterPairRule(pairs: BeforeAfterPair | BeforeAfterPair[] | null): string {
  const list = asList(pairs);
  if (!list.length) return "";
  if (list.length === 1) {
    const pair = list[0];
    return `AVANT / APRÈS INDIQUÉ PAR LA PERSONNE : la photo ${pair.before} est l'avant, la photo ${pair.after} est l'après du même sujet. Montre-les sur deux slides photo qui se suivent, l'avant puis l'après, chacune une seule fois dans le carrousel. Le texte de ces deux slides nomme ce qui a changé, sans inventer de durée, de prix ni de résultat absents du brief.\n`;
  }
  const detail = list.map((p) => `photo ${p.before} (avant) et photo ${p.after} (après)`).join(" ; ");
  return `AVANT / APRÈS INDIQUÉS PAR LA PERSONNE, ${list.length} PAIRES : ${detail}. Chaque paire montre le même sujet. Montre chaque paire sur deux slides photo qui se suivent, l'avant puis l'après, chaque photo une seule fois dans le carrousel. Le texte de ces slides nomme ce qui a changé, sans inventer de durée, de prix ni de résultat absents du brief.\n`;
}

/** Consigne pour l'association finale des photos (vide sans paire). Texte d'une seule paire inchangé. */
export function beforeAfterMatchRule(pairs: BeforeAfterPair | BeforeAfterPair[] | null): string {
  const list = asList(pairs);
  if (!list.length) return "";
  if (list.length === 1) {
    const pair = list[0];
    return `\nPaire avant/après indiquée par la personne : PHOTO ${pair.before} = avant, PHOTO ${pair.after} = après. Mets-les sur deux slides photo consécutives qui parlent de ce changement, l'avant d'abord, et n'utilise aucune des deux ailleurs.`;
  }
  const detail = list.map((p) => `PHOTO ${p.before} = avant et PHOTO ${p.after} = après`).join(" ; ");
  return `\nPaires avant/après indiquées par la personne : ${detail}. Mets chaque paire sur deux slides photo consécutives qui parlent de ce changement, l'avant d'abord, et n'utilise aucune de ces photos ailleurs.`;
}
