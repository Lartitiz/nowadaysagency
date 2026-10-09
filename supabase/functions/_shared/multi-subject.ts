// Brief à plusieurs sujets (09/10/2026). Une note de veille du type
// « 1. Titre / paragraphe, 2. Titre / paragraphe… » donnée telle quelle pour
// des stories : toute la chaîne attend UN sujet (un angle dominant, une
// position), l'IA gardait donc le premier et ignorait les autres. L'écran
// format repère ces sujets et demande quoi faire ; le choix « récap » préfixe
// le brief de RECAP_PREFIX, que le brief stories lit côté edge.
// Module pur, partagé entre l'écran (src) et les edge functions.

export interface BriefSubject {
  /** Numéro tel qu'écrit dans le brief. */
  n: number;
  title: string;
  /** Bloc complet du sujet (titre + paragraphes), tel qu'écrit. */
  block: string;
}

// Titre numéroté en début de ligne : « 1. », « 2) », « 3 - », « 4/ ».
const HEADING = /^\s{0,3}(\d{1,2})\s*(?:[.)/]|[-–—])\s+(\S.*)$/;
// Un sujet doit avoir de la matière sous son titre, sinon c'est une simple liste.
const MIN_SUBJECT_CHARS = 120;

export const RECAP_PREFIX = "Séquence récap de tous les sujets ci-dessous :";

export function isRecapBrief(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trimStart().startsWith(RECAP_PREFIX);
}

/**
 * Sujets indépendants d'un brief : au moins deux titres numérotés qui se
 * suivent (1, 2, 3…), chacun suivi d'au moins un paragraphe. Une liste courte
 * (« 1. poster 2. répondre ») n'est pas un brief à plusieurs sujets.
 */
export function splitBriefSubjects(text: string | null | undefined): BriefSubject[] {
  if (typeof text !== "string") return [];
  const body = isRecapBrief(text) ? text.trimStart().slice(RECAP_PREFIX.length) : text;
  const lines = body.split(/\r?\n/);
  const starts: { line: number; n: number; title: string }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(HEADING);
    if (!m) return;
    const n = Number(m[1]);
    const expected = starts.length === 0 ? 1 : starts[starts.length - 1].n + 1;
    if (n === expected) starts.push({ line: i, n, title: m[2].trim() });
  });
  if (starts.length < 2) return [];
  const subjects = starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].line : lines.length;
    return { n: s.n, title: s.title, block: lines.slice(s.line, end).join("\n").trim() };
  });
  const substantial = subjects.every((s) => s.block.length - s.title.length >= MIN_SUBJECT_CHARS);
  return substantial ? subjects : [];
}

/** Le brief contient plusieurs sujets et rien n'a encore été choisi. */
export function multiSubjectChoicePending(text: string | null | undefined): boolean {
  return !isRecapBrief(text) && splitBriefSubjects(text).length >= 2;
}

/** Consigne du brief stories pour une séquence récap (null si brief ordinaire). */
export function recapStoriesBlock(subject: string | null | undefined, maxStories: number): string | null {
  if (!isRecapBrief(subject)) return null;
  const subjects = splitBriefSubjects(subject);
  if (subjects.length < 2) return null;
  const perSubject = subjects.length * 2 + 1 <= maxStories ? "une ou deux stories" : "une story";
  return `SÉQUENCE RÉCAP (${subjects.length} SUJETS, PRIORITÉ SUR LA STRUCTURE ET L'ANGLE UNIQUE CI-DESSOUS) :
L'utilisatrice veut une seule séquence qui couvre TOUS ses sujets, dans l'ordre : ${subjects.map((s) => `${s.n}. ${s.title}`).join(" ; ")}.
- Story 1 : l'accroche annonce la série (ce que ces sujets ont en commun pour l'abonnée), pas seulement le premier sujet.
- Puis ${perSubject} par sujet, numérotée${perSubject === "une story" ? "" : "s"} « 1. », « 2. »… au début du premier "text" de chaque sujet, avec SES mots et SES conclusions pour ce sujet. Aucun sujet omis, aucun sujet ajouté.
- Le fil commun tient lieu d'angle dominant ; chaque sujet garde la position qu'elle lui donne.
- Une seule story d'interaction, à la fin. ${maxStories} stories au plus en tout.`;
}
