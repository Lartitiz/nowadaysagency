// Brief à plusieurs sujets (09/10/2026). Une note de veille du type
// « 1. Titre / paragraphe, 2. Titre / paragraphe… » donnée telle quelle pour
// des stories ou un reel : la rédaction attend UN sujet (un angle dominant,
// une idée, une position), l'IA gardait donc le premier et ignorait les autres.
// L'écran format repère ces sujets et demande quoi faire ; le choix « récap »
// préfixe le brief de RECAP_PREFIX, que les briefs stories et reel lisent côté
// edge. Module pur, partagé entre l'écran (src) et les edge functions.

export interface BriefSubject {
  /** Numéro tel qu'écrit dans le brief, sinon rang du sujet. */
  n: number;
  title: string;
  /** Bloc complet du sujet (titre + paragraphes), tel qu'écrit. */
  block: string;
}

// Titre numéroté en début de ligne : « 1. », « 2) », « 3 - », « 4/ ».
const NUMBERED = /^\s{0,3}(\d{1,2})\s*(?:[.)/]|[-–—])\s+(\S.*)$/;
// Un sujet doit avoir de la matière sous son titre, sinon c'est une simple liste.
const MIN_SUBJECT_CHARS = 120;
const TITLE_MAX_CHARS = 110;

export const RECAP_PREFIX = "Récap de tous les sujets ci-dessous :";
// Première formulation (#1418), jamais publiée mais encore acceptée.
const RECAP_PREFIXES = [RECAP_PREFIX, "Séquence récap de tous les sujets ci-dessous :"];

const recapPrefixOf = (text: string) => RECAP_PREFIXES.find((p) => text.trimStart().startsWith(p));

export function isRecapBrief(text: string | null | undefined): boolean {
  return typeof text === "string" && !!recapPrefixOf(text);
}

/** Retire le préfixe récap (choix annulé). */
export function stripRecapPrefix(text: string): string {
  const p = recapPrefixOf(text);
  return p ? text.trimStart().slice(p.length).trimStart() : text;
}

/** Titre sans marque de mise en forme : « ## », « **…** », puce, « Sujet 2 : ». */
function cleanHeading(line: string): string {
  return line.trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-•*▪︎►→]\s+/, "")
    .replace(/^\*\*(.+)\*\*:?$/, "$1")
    .replace(/^__(.+)__:?$/, "$1")
    .replace(/^(?:sujet|point|partie|info)\s+\d{1,2}\s*[:.–—-]\s*/i, "")
    .trim();
}

/**
 * Ligne isolée qui ressemble à un titre de sujet sans numéro : seule entre deux
 * lignes vides (ou en tout début), courte, sans ponctuation de fin de phrase.
 */
function isUnnumberedHeading(lines: string[], i: number): boolean {
  const raw = lines[i].trim();
  if (!raw || raw.length > TITLE_MAX_CHARS) return false;
  const before = i === 0 || !lines[i - 1].trim();
  const after = i + 1 < lines.length && !lines[i + 1].trim();
  if (!before || !after) return false;
  const marked = /^#{1,6}\s|^\*\*.+\*\*:?$|^__.+__:?$|^(?:sujet|point|partie|info)\s+\d{1,2}\s*[:.–—-]/i.test(raw);
  // Sans marque de titre, une ligne qui finit comme une phrase est un paragraphe.
  return marked || !/[.,;…!]$/.test(raw);
}

function blocksFrom(lines: string[], starts: { line: number; n: number; title: string }[]): BriefSubject[] {
  return starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].line : lines.length;
    return { n: s.n, title: s.title, block: lines.slice(s.line, end).join("\n").trim() };
  });
}

const substantial = (subjects: BriefSubject[]) =>
  subjects.length >= 2 && subjects.every((s) => s.block.length - s.title.length >= MIN_SUBJECT_CHARS);

/**
 * Sujets indépendants d'un brief : au moins deux titres, chacun suivi d'au
 * moins un paragraphe. Titres numérotés qui se suivent (1, 2, 3…) d'abord ;
 * sinon titres sans numéro (ligne courte isolée, « ## », « **…** »). Une liste
 * courte (« 1. poster 2. répondre ») n'est pas un brief à plusieurs sujets.
 */
export function splitBriefSubjects(text: string | null | undefined): BriefSubject[] {
  if (typeof text !== "string") return [];
  const lines = stripRecapPrefix(text).split(/\r?\n/);

  const numbered: { line: number; n: number; title: string }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(NUMBERED);
    if (!m) return;
    const expected = numbered.length === 0 ? 1 : numbered[numbered.length - 1].n + 1;
    if (Number(m[1]) === expected) numbered.push({ line: i, n: expected, title: cleanHeading(m[2]) });
  });
  if (numbered.length >= 2) {
    const subjects = blocksFrom(lines, numbered);
    return substantial(subjects) ? subjects : [];
  }

  let headings: { line: number; n: number; title: string }[] = [];
  lines.forEach((_, i) => {
    if (isUnnumberedHeading(lines, i)) headings.push({ line: i, n: 0, title: cleanHeading(lines[i]) });
  });
  // Une ligne courte sans matière derrière (titre du document, « Et toi ? »)
  // n'est pas un sujet : elle reste dans le texte du sujet d'avant.
  for (;;) {
    const thin = blocksFrom(lines, headings).findIndex((s) => s.block.length - s.title.length < MIN_SUBJECT_CHARS);
    if (thin < 0) break;
    headings = headings.filter((_, k) => k !== thin);
  }
  if (headings.length < 2) return [];
  return blocksFrom(lines, headings.map((h, k) => ({ ...h, n: k + 1 })));
}

/** Le brief contient plusieurs sujets et rien n'a encore été choisi. */
export function multiSubjectChoicePending(text: string | null | undefined): boolean {
  return !isRecapBrief(text) && splitBriefSubjects(text).length >= 2;
}

const recapSubjects = (subject: string | null | undefined): BriefSubject[] | null => {
  if (!isRecapBrief(subject)) return null;
  const subjects = splitBriefSubjects(subject);
  return subjects.length >= 2 ? subjects : null;
};
const subjectList = (subjects: BriefSubject[]) => subjects.map((s, i) => `${i + 1}. ${s.title}`).join(" ; ");

/** Consigne du brief stories pour une séquence récap (null si brief ordinaire). */
export function recapStoriesBlock(subject: string | null | undefined, maxStories: number): string | null {
  const subjects = recapSubjects(subject);
  if (!subjects) return null;
  const perSubject = subjects.length * 2 + 1 <= maxStories ? "une ou deux stories" : "une story";
  return `SÉQUENCE RÉCAP (${subjects.length} SUJETS, PRIORITÉ SUR LA STRUCTURE ET L'ANGLE UNIQUE CI-DESSOUS) :
L'utilisatrice veut une seule séquence qui couvre TOUS ses sujets, dans l'ordre : ${subjectList(subjects)}.
- Story 1 : l'accroche annonce la série (ce que ces sujets ont en commun pour l'abonnée), pas seulement le premier sujet.
- Puis ${perSubject} par sujet, numérotée${perSubject === "une story" ? "" : "s"} « 1. », « 2. »… au début du premier "text" de chaque sujet, avec SES mots et SES conclusions pour ce sujet. Aucun sujet omis, aucun sujet ajouté.
- Le fil commun tient lieu d'angle dominant ; chaque sujet garde la position qu'elle lui donne.
- Une seule story d'interaction, à la fin. ${maxStories} stories au plus en tout.`;
}

/** Consigne du brief reel pour un reel récap (null si brief ordinaire). */
export function recapReelBlock(subject: string | null | undefined): string | null {
  const subjects = recapSubjects(subject);
  if (!subjects) return null;
  return `

REEL RÉCAP (${subjects.length} SUJETS, PRIORITÉ SUR « UN REEL = UNE SEULE IDÉE » ET SUR L'ANCRAGE À UN SUJET) :
L'utilisatrice veut un seul reel qui couvre TOUS ses sujets, dans l'ordre : ${subjectList(subjects)}.
- Le hook annonce la série (ce que ces sujets ont en commun pour l'audience), pas seulement le premier sujet.
- Puis une section par sujet, numérotée « 1. », « 2. »… dans le texte à l'écran, avec SES mots et SA conclusion pour ce sujet : l'essentiel de chaque sujet, sans le creuser comme un reel entier. Aucun sujet omis, aucun sujet ajouté.
- Les 3 couches (symptôme, mécanisme, conséquence) portent sur le fil commun, pas sur chaque sujet.
- Durée : jusqu'à 90 secondes ; une seule question ou un seul appel à l'action, à la fin.`;
}

/** Ligne du prompt des hooks reel pour un reel récap (chaîne vide sinon). */
export function recapHooksLine(subject: string | null | undefined): string {
  const subjects = recapSubjects(subject);
  return subjects
    ? `\n\nREEL RÉCAP : le reel couvre ${subjects.length} sujets (${subjectList(subjects)}). Chaque hook annonce la série, pas seulement le premier sujet.`
    : "";
}
