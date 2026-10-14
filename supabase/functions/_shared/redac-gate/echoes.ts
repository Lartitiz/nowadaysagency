// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 2, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Redites : accroche déjà utilisée pour le même sujet, recopie de la fiche de
// marque, passages partagés avec la source, phrases d'un contenu récent.

import { normalizeWordsForOverlap, wordsWithOffsets, tokenSimilarity } from "./text-utils.ts";

/** Contexte inter-contenus : ce que le gate ne peut pas voir dans le document seul. */
export interface EchoContext {
  /** Accroches des contenus précédents du MÊME sujet, pour la même utilisatrice. */
  previousHooks?: string[];
  /** Sujet, dont les mots sont neutralisés avant comparaison (ils reviennent forcément). */
  subject?: string;
  /** Textes des derniers contenus de la marque, tous sujets (_shared/recent-passages.ts). */
  recentTexts?: string[];
  /** Ce que la personne fournit maintenant (brief, réponses) : jamais compté comme redite. */
  currentRequest?: string;
}

// ── Recopie de la fiche de marque (audit slop 18/08) ──
// Constat du corpus mesuré le 18/08 : le champ combat_cause d'une fiche de
// marque ressortait QUASI MOT POUR MOT dans 4 contenus sur 7 générés dans le
// même run. Chaque contenu pris seul était correct — c'est la RÉPÉTITION
// LITTÉRALE d'un même passage qui trahit la machine dès que deux contenus
// cohabitent sur le même feed. Symétrique à findFabricatedNumbers() : au lieu
// d'une liste blanche de chiffres autorisés, une liste de passages à NE PAS
// recopier (les champs de marque bruts, fournis en entrée).
// ── Écho d'accroche entre contenus d'un MÊME sujet (bilan hebdo 24/08/2026) ──
//
// Le trou trouvé par le juge : trois reels générés sur le même sujet ouvraient
// par « En 2026, on utilise encore l'immersion… », « En 2026, on désensibilise
// encore… », « On est en 2026 et il y a encore des pros qui… ». Le gate leur a
// mis 100/100 À TOUS LES TROIS — et c'est logique : il note chaque contenu
// ISOLÉMENT. Il compte des tics dans UN texte, il n'a jamais vu les autres.
// Une régénération qui reformule la même ouverture est pourtant le défaut le
// plus visible pour l'audience, qui, elle, voit la série.
//
// 🔑 LE PIÈGE À ÉVITER, ET IL EST DE TAILLE : le sujet lui-même revient
// forcément dans les accroches. « Le rond de longe, on en parle ? » et « Et si
// le rond de longe faisait l'inverse ? » partagent quatre mots — mais ce sont
// les mots du SUJET, pas une redite de formulation. D'où le retrait des tokens
// du sujet avant toute comparaison : on ne compare que ce que la rédaction a
// choisi d'ajouter.

/** Fenêtre d'ouverture comparée : au-delà, ce n'est plus l'accroche. */
const HOOK_WINDOW_WORDS = 8;
/** Similarité globale (hors sujet) à partir de laquelle deux accroches redisent la même chose. */
const HOOK_SIMILARITY_THRESHOLD = 0.6;

/** Mots trop courants pour porter à eux seuls une redite de formulation. */
const HOOK_STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "l", "et", "ou", "mais",
  "que", "qui", "quoi", "dont", "ce", "cet", "cette", "ces", "on", "je", "tu", "il",
  "elle", "nous", "vous", "ils", "elles", "se", "sa", "son", "ses", "mon", "ma",
  "mes", "ton", "ta", "tes", "au", "aux", "en", "dans", "sur", "pour", "par",
  "avec", "sans", "est", "sont", "a", "as", "ai", "y", "ne", "pas", "plus", "si",
  "tout", "tous", "toute", "toutes", "c", "s", "n", "j", "t", "m", "qu",
]);

/** Un token porte-t-il assez de matière pour signer une redite ? */
function isDistinctiveToken(w: string): boolean {
  if (HOOK_STOPWORDS.has(w)) return false;
  return /\d/.test(w) || w.length >= 4;
}

/**
 * Tokens d'une accroche, PRIVÉS des mots du sujet : deux contenus du même sujet
 * partagent son vocabulaire par construction, ce n'est pas une redite.
 */
function hookTokens(text: string, subject?: string): string[] {
  const sujet = new Set(normalizeWordsForOverlap(subject || ""));
  return normalizeWordsForOverlap(text).filter((w) => !sujet.has(w));
}

/** Plus long n-gramme commun aux deux ouvertures, s'il porte au moins un mot distinctif. */
function sharedOpening(a: string[], b: string[]): string | null {
  const fa = a.slice(0, HOOK_WINDOW_WORDS);
  const fb = b.slice(0, HOOK_WINDOW_WORDS);
  let best: string[] = [];
  for (let i = 0; i < fa.length; i++) {
    for (let j = 0; j < fb.length; j++) {
      let k = 0;
      while (i + k < fa.length && j + k < fb.length && fa[i + k] === fb[j + k]) k++;
      if (k > best.length) best = fa.slice(i, i + k);
    }
  }
  if (best.length < 2) return null;
  if (!best.some(isDistinctiveToken)) return null;
  return best.join(" ");
}

/**
 * Accroches déjà écrites pour ce sujet que la nouvelle redit.
 *
 * Deux signaux, l'un sur la forme d'ouverture, l'autre sur le fond :
 *  - une ouverture commune d'au moins 2 mots dont un distinctif (« en 2026 ») ;
 *  - une similarité de vocabulaire hors sujet ≥ 60 % (même angle reformulé).
 * Renvoie les accroches précédentes en cause, tronquées pour l'instruction.
 */
export function findHookEchoes(
  hook: string,
  previousHooks: string[] | undefined,
  subject?: string,
): string[] {
  if (!hook || !previousHooks?.length) return [];
  const cur = hookTokens(hook, subject);
  if (cur.length < 2) return [];

  const echoes: string[] = [];
  for (const prev of previousHooks) {
    if (!prev || typeof prev !== "string") continue;
    const prevTok = hookTokens(prev, subject);
    if (prevTok.length < 2) continue;

    const opening = sharedOpening(cur, prevTok);
    // La similarité globale ne se prononce que sur des accroches assez fournies
    // (4 tokens hors sujet de chaque côté), sinon deux titres courts se
    // ressemblent mécaniquement.
    const similar =
      cur.length >= 4 && prevTok.length >= 4 &&
      tokenSimilarity(cur.join(" "), prevTok.join(" ")) >= HOOK_SIMILARITY_THRESHOLD;

    if (opening || similar) {
      echoes.push(prev.replace(/\s+/g, " ").trim().slice(0, 120));
    }
  }
  return echoes;
}

const BRAND_COPY_MIN_WORDS = 7;


/**
 * Passages du texte généré qui recopient `minWords` mots CONSÉCUTIFS d'un
 * champ de marque fourni en entrée (brandText). Volontairement une fenêtre
 * large (7 mots par défaut) : un mot de vocabulaire métier partagé seul
 * (« savon », « saponification ») ne peut jamais déclencher — il faut une
 * SÉQUENCE entière recopiée. Fusionne les fenêtres qui se chevauchent en un
 * seul passage pour ne pas remonter dix fois la même phrase longue.
 */
/**
 * Expressions COURTES (3 à 6 mots) listées telles quelles dans la fiche de
 * marque : items séparés par virgule / point-virgule / retour à la ligne, ou
 * verbatims entre guillemets. Une fiche écrite en fragments (« sans vendre son
 * âme », « safe place ») passait sous la fenêtre de 7 mots : la recopie était
 * invisible (audit stories 07/09/2026, fiche de Laetitia).
 */
function shortBrandExpressions(brandText: string): string[] {
  const out = new Set<string>();
  const segments = (brandText || "").split(/[\n,;«»"“”]+/);
  for (const seg of segments) {
    const words = normalizeWordsForOverlap(seg);
    if (words.length >= 3 && words.length <= 6) out.add(words.join(" "));
  }
  return [...out];
}

export function findBrandCopyOverlap(text: string, brandText: string | undefined, minWords = BRAND_COPY_MIN_WORDS): string[] {
  if (!text || !brandText) return [];
  const passages = findBrandCopyWindows(text, brandText, minWords);
  const normalizedText = " " + normalizeWordsForOverlap(text).join(" ") + " ";
  for (const expr of shortBrandExpressions(brandText)) {
    if (normalizedText.includes(" " + expr + " ") && !passages.some((p) => normalizeWordsForOverlap(p).join(" ").includes(expr))) {
      passages.push(expr);
    }
  }
  return passages;
}

/**
 * Passages de `text` qui reprennent `minWords` mots CONSÉCUTIFS de `sourceText`
 * (même fenêtre que la recopie de fiche de marque). Sert aussi à comparer un
 * contenu à ceux déjà écrits pour la même marque (_shared/recent-passages.ts).
 */
export function findSharedPassages(text: string, sourceText: string, minWords = BRAND_COPY_MIN_WORDS): string[] {
  return findBrandCopyWindows(text, sourceText, minWords);
}

/**
 * Passages du nouveau texte qui reprennent mot pour mot (7 mots consécutifs ou
 * plus) un contenu récent de la marque. Un même passage n'est compté qu'une fois.
 * `currentRequest` = sujet, réponses et texte fournis maintenant (jamais comptés).
 */
export function findRecentEchoes(text: string, recentTexts: string[] | undefined, currentRequest = ""): string[] {
  if (!text || !recentTexts?.length) return [];
  const found = new Map<string, string>();
  for (const recent of recentTexts) {
    for (const passage of findSharedPassages(text, recent)) {
      // Une phrase que la personne vient de fournir dans SA demande se reprend :
      // c'est sa matière du jour, pas une redite de l'IA.
      if (currentRequest && findSharedPassages(passage, currentRequest).length) continue;
      const key = passage.toLowerCase();
      if (![...found.keys()].some((k) => k.includes(key))) {
        for (const k of [...found.keys()]) if (key.includes(k)) found.delete(k);
        found.set(key, passage);
      }
    }
  }
  return [...found.values()];
}

function findBrandCopyWindows(text: string, brandText: string, minWords: number): string[] {
  if (!text || !brandText) return [];
  const sourceWords = normalizeWordsForOverlap(brandText);
  if (sourceWords.length < minWords) return [];
  const sourceGrams = new Set<string>();
  for (let i = 0; i + minWords <= sourceWords.length; i++) {
    sourceGrams.add(sourceWords.slice(i, i + minWords).join(" "));
  }
  if (sourceGrams.size === 0) return [];

  const genWords = wordsWithOffsets(text);
  const matchedStart: boolean[] = new Array(genWords.length).fill(false);
  for (let i = 0; i + minWords <= genWords.length; i++) {
    const gram = genWords.slice(i, i + minWords).map((w) => w.word).join(" ");
    if (sourceGrams.has(gram)) matchedStart[i] = true;
  }

  const found: string[] = [];
  let i = 0;
  while (i < matchedStart.length) {
    if (!matchedStart[i]) { i++; continue; }
    let j = i;
    while (j < matchedStart.length && matchedStart[j]) j++;
    // Fenêtres qui démarrent en i..j-1 → passage complet [i, (j-1)+minWords).
    const spanStart = genWords[i].start;
    const spanEnd = genWords[j - 1 + minWords - 1].end;
    found.push(text.slice(spanStart, spanEnd).replace(/\s+/g, " ").trim());
    i = j;
  }
  return found;
}

/**
 * Échos d'accroche mesurés AVANT toute correction, ou undefined quand la garde
 * n'était pas armée (aucune accroche précédente sur ce sujet). Le quality_check
 * et la télémétrie ne voient que l'APRÈS : quand la garde a mordu, hook_echoes
 * y est vide. Ce compteur seul dit si elle mord sur du vrai contenu.
 */
export function hookEchoesBefore(before: { hookEchoes: string[] }, echo?: EchoContext): number | undefined {
  return echo?.previousHooks?.length ? before.hookEchoes.length : undefined;
}

/** Accroche d'un texte libre : sa 1re ligne non vide, tronquée à une phrase. */
export function textHook(text: string): string {
  const ligne = (text || "").split(/\n+/).map((l) => l.trim()).find(Boolean) || "";
  const phrase = ligne.split(/(?<=[.!?…])\s/)[0] || ligne;
  return phrase.slice(0, 200);
}
