// GARDE DE STRUCTURE du texte après une passe de correction (04/10/2026).
//
// La passe de correction LinkedIn demande de « fusionner » les rafales de
// phrases courtes et de « casser la symétrie » des énumérations. Ces règles
// d'écriture restent telles quelles, mais une liste VOULUE (lignes « 1. »,
// « 2) », « – », « • », « → »…) ou la découpe en paragraphes peuvent y passer :
// même famille de cause que la perte des « 1, 2, 3 » (PR #1191).
//
// Ici, le CODE compare la structure avant / après correction. Si la correction
// a fait disparaître une liste, sa numérotation ou les paragraphes, on rejette
// la correction entière et on garde le texte d'avant (« dégrader la correction,
// pas le texte »). Rien n'est réécrit : on choisit seulement entre deux
// versions déjà écrites.

// Numéro d'ordre : « 1. », « 2) », « 3 - », « 4/ », ou pastille emoji « 1️⃣ ».
const ORDERED_LINE = /^\s*(?:\d{1,2}\s*[.)\/]\s+\S|\d{1,2}\s+[-–—]\s+\S|\d️?⃣\s*\S|🔟\s*\S)/u;
// Puces : tirets, points, flèches, coches, doigt… suivis d'un espace.
const BULLET_LINE = /^\s*(?:[-–—•·▪◦●○■□►▸▹➤➔➜→⇒✓✔✅☑❌✗✘👉*+]|➡️?)\s+\S/u;

export interface TextStructure {
  /** Lignes de liste appartenant à une suite d'au moins 2 lignes de liste. */
  listLines: number;
  /** Parmi elles, celles qui portent un numéro d'ordre. */
  orderedLines: number;
  /** Blocs séparés par une ligne vide. */
  paragraphs: number;
  /** Lignes non vides. */
  lines: number;
}

function isOrdered(line: string): boolean {
  return ORDERED_LINE.test(line);
}

function isListLine(line: string): boolean {
  return isOrdered(line) || BULLET_LINE.test(line);
}

/** Mesure la structure visible d'un texte (listes, numérotation, paragraphes). */
export function analyzeTextStructure(text: string): TextStructure {
  const all = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  let listLines = 0;
  let orderedLines = 0;
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) {
      listLines += run.length;
      orderedLines += run.filter(isOrdered).length;
    }
    run = [];
  };
  let paragraphs = 0;
  let lines = 0;
  let inParagraph = false;
  for (const line of all) {
    if (!line.trim()) {
      // Une ligne vide ne coupe pas une liste (« 1. …\n\n2. … » reste une liste).
      inParagraph = false;
      continue;
    }
    lines++;
    if (!inParagraph) {
      paragraphs++;
      inParagraph = true;
    }
    if (isListLine(line)) run.push(line);
    else flush();
  }
  flush();
  return { listLines, orderedLines, paragraphs, lines };
}

/**
 * Raison lisible si la correction a cassé la structure du texte d'origine,
 * sinon null. Ne regarde que des pertes : une correction qui garde ou ajoute
 * de la structure passe.
 */
export function structureLossReason(before: string, after: string): string | null {
  const b = analyzeTextStructure(before);
  const a = analyzeTextStructure(after);
  if (b.listLines >= 2 && a.listLines < b.listLines) {
    return `liste perdue (${b.listLines} → ${a.listLines} lignes de liste)`;
  }
  if (b.orderedLines >= 2 && a.orderedLines < b.orderedLines) {
    return `numérotation perdue (${b.orderedLines} → ${a.orderedLines} lignes numérotées)`;
  }
  if (b.paragraphs >= 3 && a.paragraphs <= 1) {
    return `paragraphes fusionnés (${b.paragraphs} → ${a.paragraphs})`;
  }
  if (b.lines >= 3 && a.lines <= 1) {
    return `sauts de ligne perdus (${b.lines} → ${a.lines} lignes)`;
  }
  return null;
}

/**
 * Choisit la version à garder : la correction, sauf si elle a cassé la
 * structure — alors le texte d'avant correction, intact. Log télémétrie clair.
 */
export function keepStructureOrRevert(
  before: string,
  corrected: string,
  scope: string,
  logger: (msg: string) => void = (m) => console.warn(m),
): { text: string; reverted: boolean; reason: string | null } {
  const reason = structureLossReason(before, corrected);
  if (!reason) return { text: corrected, reverted: false, reason: null };
  logger(`[structure-guard:${scope}] correction rejetée, texte d'avant conservé : ${reason}`);
  return { text: before, reverted: true, reason };
}
