// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 3, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Chiffres venus de la seule recherche web : source exigée dans la phrase,
// passe dédiée de sourçage, plafond « ton cas d'abord ».

import { applyResearchExcessPass, applyResearchSourcingPass } from "../correction-pass.ts";
import { FRENCH_NUMERALS, sentencesOf } from "./text-utils.ts";
import { NUMBER_TOKEN, measuredMultipliers } from "./numbers.ts";
import { textRedacRawCount, type TextRedacAnalysis } from "./scoring.ts";

// ── Chiffres venus SEULEMENT de la recherche : autorisés avec leur source (04/10/2026) ──
// Test réel après #1298/#1299/#1300 : la recherche « creuser le sujet » rejoignait
// la liste blanche, donc « l'algorithme teste chaque post sur 2 à 5 % de ton
// réseau » ou « une étude sur 4,6 millions de posts… 17,3 % » passaient sans nom
// ni année. Un chiffre du brief, des réponses, du branding ou de l'actu reste
// autorisé tel quel ; un chiffre que seule la recherche fournit doit porter sa
// source DANS LA MÊME PHRASE (« (Nom, année) », « selon X », « l'étude de X »).

/** Chiffres de la recherche absents du brief/réponses/branding/actu (années exclues : des dates, pas des stats). */
export interface ResearchNumbers {
  only: Set<string>;
  text: string;
}

// Mentions statistiques d'un texte (04/10/2026, suite du test réel) : un
// chiffre avec son unité (« 5 % » n'est pas « 5 ans »), et ce qui s'écrit en
// lettres (« deux fois plus », « 2x », « une personne sur trois »,
// « cinquante pour cent »), que le seul repérage des chiffres laissait passer.
interface StatMention { raw: string; keys: string[]; index: number; end: number }

const NUMBER_WORD = "(?:\\d+(?:[.,]\\d+)?|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|soixante|cent)";
const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/^(?:%|pour\s?cents?)$/, "%"], [/^(?:€|euros?)$/, "€"], [/^(?:h|heures?)$/, "h"], [/^(?:min|mn|minutes?)$/, "min"],
  [/^jours?$/, "j"], [/^semaines?$/, "sem"], [/^(?:ans?|années?)$/, "an"], [/^millions?$/, "M"], [/^milliards?$/, "Md"],
];

function wordValue(word: string): string {
  const w = word.toLowerCase();
  return String(FRENCH_NUMERALS[w] ?? Number(w.replace(",", ".")));
}

function unitAfter(text: string, from: number): string {
  const m = text.slice(from).match(/^(?:\s*(?:à|-|–|—|et|ou)\s*\d+(?:[.,]\d+)?)?\s*(%|€|pour\s?cents?|\p{L}+)/iu);
  if (!m) return "";
  const raw = m[1].toLowerCase();
  for (const [re, unit] of UNIT_ALIASES) if (re.test(raw)) return unit;
  return raw.replace(/[sx]$/, "");
}

function statMentions(text: string): StatMention[] {
  const out: StatMention[] = [];
  for (const m of (text || "").matchAll(NUMBER_TOKEN)) {
    const end = m.index! + m[0].length;
    if (/^(?:er|re|e\b|ᵉ|ʳ)/.test(text.slice(end, end + 3))) continue; // ordinal
    const v = m[0].replace(",", ".");
    const unit = unitAfter(text, end);
    out.push({ raw: m[0], keys: unit ? [v, `${v}|${unit}`] : [v], index: m.index!, end });
  }
  for (const m of measuredMultipliers(text || "")) out.push({ raw: m.raw, keys: [m.key], index: m.index, end: m.index + m.raw.length });
  for (const m of (text || "").matchAll(/(?<![\p{L}\d])(\d+(?:[.,]\d+)?)\s?x(?!\p{L})|(?<!\p{L})x\s?(\d+(?:[.,]\d+)?)(?![\d.,]*\p{L})/giu)) {
    out.push({ raw: m[0], keys: [`multiplier:${Number((m[1] || m[2]).replace(",", "."))}:plus`], index: m.index!, end: m.index! + m[0].length });
  }
  const ratio = new RegExp(`(?<!\\p{L})(${NUMBER_WORD})\\s+(?:[\\p{L}'’-]+\\s+){0,3}sur\\s+(${NUMBER_WORD})(?![\\d.,])(?!\\s*(?:millions?|milliers?|milliards?|%|pour\\s?cents?)(?!\\p{L}))(?!\\p{L})`, "giu");
  for (const m of (text || "").matchAll(ratio)) {
    out.push({ raw: m[0], keys: [`ratio:${wordValue(m[1])}/${wordValue(m[2])}`], index: m.index!, end: m.index! + m[0].length });
  }
  // Durées et quantités en lettres (« une à deux heures », « trois semaines ») :
  // seulement avec une unité de mesure, pour ne pas viser « trois raisons ».
  const LETTER = "un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|soixante|cent";
  const measured = new RegExp(`(?<!\\p{L})(${LETTER})(?:\\s*(?:à|-|–|ou)\\s*(${LETTER}))?\\s+(secondes?|minutes?|heures?|jours?|semaines?|mois|ans|années?|millions?|milliards?)(?!\\p{L})`, "giu");
  for (const m of (text || "").matchAll(measured)) {
    const unit = unitAfter(" " + m[3], 0);
    for (const word of [m[1], m[2]].filter(Boolean)) {
      // « un mois », « une semaine » seuls = langage courant ; dans une fourchette, une mesure.
      if (!m[2] && /^une?$/i.test(word)) continue;
      const v = wordValue(word);
      out.push({ raw: m[0], keys: [`${v}|${unit}`], index: m.index!, end: m.index! + m[0].length });
    }
  }
  const pct = new RegExp(`(?<!\\p{L})(${NUMBER_WORD})\\s+pour\\s?cents?(?!\\p{L})`, "giu");
  for (const m of (text || "").matchAll(pct)) {
    if (/^\d/.test(m[1])) continue; // déjà vu comme chiffre
    const v = wordValue(m[1]);
    out.push({ raw: m[0], keys: [v, `${v}|%`], index: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

const isYear = (k: string) => /^(?:19|20)\d{2}(?:\|.*)?$/.test(k);

export function researchNumbers(baseAllowed: Set<string>, researchText?: string, baseText?: string): ResearchNumbers | undefined {
  if (!researchText?.trim()) return undefined;
  // Valeur ET unité du brief/réponses/branding/actu : « 5 ans » n'autorise pas « 5 % ».
  const baseKeys = new Set<string>(baseAllowed);
  if (baseText) for (const m of statMentions(baseText)) m.keys.forEach((k) => baseKeys.add(k));
  const only = new Set<string>();
  for (const m of statMentions(researchText)) {
    const [first, withUnit] = m.keys;
    if (isYear(first)) continue;
    if (/^\d/.test(first) && withUnit) {
      // Valeur absente de la base → toute reprise compte ; valeur présente mais
      // avec une autre unité → seule la reprise avec l'unité de la recherche compte.
      // (la clé avec unité sert aussi à reconnaître la reprise en lettres : « deux heures »)
      if (!baseKeys.has(first)) { only.add(first); if (!baseKeys.has(withUnit)) only.add(withUnit); }
      else if (baseText && !baseKeys.has(withUnit)) only.add(withUnit);
    } else if (!baseKeys.has(first)) {
      only.add(first);
    }
  }
  return only.size ? { only, text: researchText } : undefined;
}

/** Texte d'entrée sans la matière de recherche (qui y a été concaténée telle quelle). */
export function baseInputText(inputText?: string, researchText?: string): string {
  if (!inputText) return "";
  return researchText?.trim() ? inputText.split(researchText).join("\n") : inputText;
}

const SOURCE_MENTIONS: RegExp[] = [
  // « (Hootsuite, 2025) », « (étude LinkedIn 2024) », « (source : Insee) »
  /\([^()]{0,80}(?<!\d)(?:19|20)\d{2}(?!\d)[^()]{0,30}\)/u,
  /\(\s*(?:source\s*:\s*)?\p{Lu}[^()]{1,60}\)/u,
  // « selon Hootsuite », « d'après l'Insee », « source : … »
  /(?<!\p{L})(?:selon|d['’]apr[eè]s|sources?\s*:)/iu,
  // « l'étude de Richard van der Blom », « un rapport du CNRS », « publiée par LinkedIn »
  /(?<!\p{L})(?:[ée]tudes?|rapports?|barom[eè]tres?|enqu[eê]tes?|sondages?|analyses?|chiffres|donn[ée]es)\s+(?:de\s+l['’]|de\s+la\s+|du\s+|des\s+|de\s+|d['’])\p{Lu}/u,
  /(?<!\p{L})(?:publi[ée]e?s?|men[ée]e?s?|r[ée]alis[ée]e?s?|mesur[ée]e?s?)\s+par\s+(?:l['’]|le\s+|la\s+|les\s+)?\p{Lu}/u,
];

function hasSourceMention(sentence: string): boolean {
  return SOURCE_MENTIONS.some((re) => re.test(sentence));
}


/**
 * Phrases avec leur couverture de source : citée dans la phrase, ou dans la
 * phrase JUSTE AVANT du même paragraphe (« Selon X, … . Résultat : 17 % »),
 * pour ne pas répéter la source deux phrases de suite.
 */
function sourcedSentences(text: string): Array<{ text: string; covered: boolean }> {
  const out: Array<{ text: string; covered: boolean }> = [];
  for (const paragraph of (text || "").split(/\n+/)) {
    let previousCited = false;
    for (const sentence of paragraph.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean)) {
      const cited = hasSourceMention(sentence);
      out.push({ text: sentence, covered: cited || previousCited });
      previousCited = cited;
    }
  }
  return out;
}

/**
 * Chiffres que seule la recherche fournit, repris dans une phrase sans mention de source.
 * `units` : blocs lus d'un tenant (par défaut les phrases du texte ; une slide entière pour le carrousel).
 */
export function findUnsourcedResearchNumbers(text: string, research?: ResearchNumbers, units?: string[]): string[] {
  if (!research) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const researchSentences = sentencesOf(research.text).map((t) => ({ t, keys: new Set(statMentions(t).flatMap((m) => m.keys)) }));
  const blocks = units
    ? units.map((u) => ({ text: u.replace(/\s+/g, " ").trim(), covered: hasSourceMention(u.replace(/\s+/g, " ")) }))
    : sourcedSentences(text);
  for (const { text: sentence, covered } of blocks) {
    if (covered) continue;
    // La mention la plus longue gagne (« deux fois plus » plutôt que « deux »), puis ordre du texte.
    const picked: Array<{ m: StatMention; key: string }> = [];
    for (const m of statMentions(sentence).sort((a, b) => (b.end - b.index) - (a.end - a.index))) {
      const key = m.keys.find((k) => research.only.has(k));
      if (!key || seen.has(key) || picked.some((p) => m.index < p.m.end && p.m.index < m.end)) continue;
      seen.add(key);
      picked.push({ m, key });
    }
    for (const { m, key } of picked.sort((a, b) => a.m.index - b.m.index)) {
      const where = sentence.length > 160 ? sentence.slice(0, 157) + "…" : sentence;
      const inResearch = researchSentences.find((r) => r.keys.has(key))?.t;
      found.push(`${m.raw} (« ${where} »)${inResearch ? ` — dans la recherche : « ${inResearch.length > 220 ? inResearch.slice(0, 217) + "…" : inResearch} »` : ""}`);
    }
  }
  return found;
}

/**
 * Chiffres repris dans le texte qui viennent de la SEULE recherche (pas du brief,
 * des réponses, du branding ni de l'actu), sourcés ou non : un par valeur.
 * « Ton cas d'abord » (04/10/2026) : quand la personne a donné son propre cas,
 * au plus un de ces chiffres est admis (plafond appliqué par runRedacGate).
 */
export function findResearchNumbersUsed(units: string[], research?: ResearchNumbers): string[] {
  if (!research) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const unit of units) {
    const sentence = (unit || "").replace(/\s+/g, " ").trim();
    if (!sentence) continue;
    const picked: Array<{ m: StatMention; key: string }> = [];
    for (const m of statMentions(sentence).sort((a, b) => (b.end - b.index) - (a.end - a.index))) {
      const key = m.keys.find((k) => research.only.has(k));
      if (!key || picked.some((p) => m.index < p.m.end && p.m.index < m.end)) continue;
      // « 1,5 % » et « 1,5 » sont la même donnée : une seule entrée par valeur.
      const value = m.keys[0];
      if (seen.has(value)) continue;
      seen.add(value);
      picked.push({ m, key });
    }
    for (const { m } of picked.sort((a, b) => a.m.index - b.m.index)) {
      const where = sentence.length > 160 ? sentence.slice(0, 157) + "…" : sentence;
      found.push(`${m.raw} (« ${where} »)`);
    }
  }
  return found;
}

// Mots courants qu'une majuscule de début de phrase ne transforme pas en nom de
// source (constat de la fiche 7, 14/10/2026 : « … possible. Une bonne partie
// des artisans… » était refusé à cause de « Une »).
const COMMON_SENTENCE_STARTS = new Set([
  "un", "une", "le", "la", "les", "des", "du", "de", "ce", "cet", "cette", "ces", "et", "mais", "ou", "donc", "or", "ni", "car",
  "on", "il", "elle", "ils", "elles", "nous", "vous", "je", "tu", "moi", "toi", "lui", "eux", "leur", "leurs",
  "son", "sa", "ses", "mon", "ma", "mes", "ton", "ta", "tes", "notre", "nos", "votre", "vos",
  "beaucoup", "plusieurs", "certains", "certaines", "peu", "plupart", "chaque", "tout", "tous", "toute", "toutes",
  "souvent", "parfois", "toujours", "jamais", "aujourd'hui", "depuis", "pour", "par", "dans", "en", "au", "aux", "chez",
  "avec", "sans", "sur", "sous", "entre", "avant", "après", "quand", "si", "comme", "ainsi", "alors", "puis", "ensuite",
  "enfin", "pourtant", "cependant", "selon", "résultat", "ici", "là", "oui", "non", "c'est", "il y a",
]);

/** Noms propres et années ajoutés par une correction : ils doivent venir de la recherche. */
function inventedSourceTokens(before: string, after: string, researchText: string): string[] {
  // Les marqueurs « [SLIDE 1 - BODY] » des textes balisés ne sont pas des sources.
  const tokens = (t: string) => new Set((t.replace(/\[[^\]\n]{1,40}\]/g, " ").match(/\p{Lu}[\p{L}\d'’-]+|(?<!\d)(?:19|20)\d{2}(?!\d)/gu) || []));
  const had = tokens(before);
  // Un mot déjà présent dans le texte (en minuscules) n'est pas une source ajoutée.
  const hadWords = new Set((before.toLowerCase().match(/[\p{L}\d'’-]+/gu) || []).map((w) => w.replace(/’/g, "'")));
  const isCommonWord = (tok: string) => {
    const lower = tok.toLowerCase().replace(/’/g, "'");
    if (COMMON_SENTENCE_STARTS.has(lower) || hadWords.has(lower)) return true;
    // « L'artisanat », « D'abord » : article élidé + nom commun (minuscule après l'apostrophe).
    const elided = tok.match(/^\p{Lu}['’](\p{L}+)/u);
    return !!elided && elided[1][0] === elided[1][0].toLowerCase();
  };
  const research = researchText.toLowerCase();
  return [...tokens(after)].filter((tok) => !had.has(tok) && !isCommonWord(tok) && !research.includes(tok.toLowerCase()));
}

/**
 * Filet dédié (04/10/2026) : s'il reste des chiffres de recherche sans source
 * après la relecture, UNE passe courte qui ne fait que ça (source recopiée de
 * la recherche ou formulation qualitative). Gardée seulement si le code
 * mesure moins de chiffres non sourcés, aucun autre compteur dégradé et aucun
 * nom ni année absents de la recherche (pas de source inventée).
 */
export async function enforceResearchNumberSources<A extends { unsourcedResearchNumbers?: string[]; fabricatedNumbers: string[] } = TextRedacAnalysis>(
  text: string,
  analyze: (t: string) => A,
  research: ResearchNumbers | undefined,
  opts: {
    logger?: (msg: string) => void; abortTimeoutMs?: number; before?: A;
    /** Somme des AUTRES compteurs (défaut : variante texte) : aucun ne doit se dégrader. */
    otherCount?: (a: A) => number;
  },
): Promise<{ content: string; analysis: A; applied: boolean }> {
  const before = opts.before ?? analyze(text);
  const items = before.unsourcedResearchNumbers ?? [];
  if (!research || !items.length) return { content: text, analysis: before, applied: false };
  const candidate = await applyResearchSourcingPass(text, {
    items, researchText: research.text, logger: opts.logger, abortTimeoutMs: opts.abortTimeoutMs,
  });
  if (!candidate || candidate === text) return { content: text, analysis: before, applied: false };
  const after = analyze(candidate);
  const unsourced = (a: A) => a.unsourcedResearchNumbers?.length ?? 0;
  const others = opts.otherCount ?? ((a: A) => textRedacRawCount(a as unknown as TextRedacAnalysis) - unsourced(a));
  const invented = inventedSourceTokens(text, candidate, research.text);
  const kept = unsourced(after) < unsourced(before) && others(after) <= others(before) &&
    after.fabricatedNumbers.length <= before.fabricatedNumbers.length && !invented.length;
  opts.logger?.(`[research-sourcing] chiffres de recherche sans source ${unsourced(before)}→${unsourced(after)}, autres ${others(before)}→${others(after)}${invented.length ? `, source absente de la recherche ${JSON.stringify(invented)}` : ""}, gardé=${kept}`);
  return kept ? { content: candidate, analysis: after, applied: true } : { content: text, analysis: before, applied: false };
}

/** Marqueurs « [SLIDE 3 - BODY] » qui avaient du texte avant et n'en ont plus : un trou dans le carrousel. */
export function emptiedMarkers(before: string, after: string): string[] {
  const read = (t: string) => {
    const map = new Map<string, string>();
    for (const m of (t || "").matchAll(/\[([^\]\n]{1,40})\][ \t]*([\s\S]*?)(?=\n\[|$)/g)) map.set(m[1].trim(), m[2].trim());
    return map;
  };
  const a = read(after);
  return [...read(before)].filter(([k, v]) => v && a.has(k) && !a.get(k)).map(([k]) => k);
}

/**
 * Plafond des chiffres de recherche quand un cas personnel est fourni : une passe
 * courte retire l'excédent, le code la relit (même patron que les témoignages).
 */
export async function enforceResearchNumberCap<A extends { researchNumbersUsed?: string[] }>(
  text: string,
  analyze: (t: string) => A,
  cap: number,
  opts: {
    logger?: (msg: string) => void; abortTimeoutMs?: number; before?: A;
    /** Somme des AUTRES compteurs : aucun ne doit se dégrader. */
    otherCount: (a: A) => number;
    /** Refus propre à l'appelant (chiffre du brief perdu, passage vidé). */
    reject?: (candidate: string) => string | null;
  },
): Promise<{ content: string; analysis: A; applied: boolean }> {
  const before = opts.before ?? analyze(text);
  const items = before.researchNumbersUsed ?? [];
  if (items.length <= cap) return { content: text, analysis: before, applied: false };
  const candidate = await applyResearchExcessPass(text, { items, keep: cap, logger: opts.logger, abortTimeoutMs: opts.abortTimeoutMs });
  if (!candidate || candidate === text) return { content: text, analysis: before, applied: false };
  const after = analyze(candidate);
  const used = (a: A) => a.researchNumbersUsed?.length ?? 0;
  const rejected = opts.reject?.(candidate) ?? null;
  const kept = used(after) < used(before) && opts.otherCount(after) <= opts.otherCount(before) && !rejected;
  opts.logger?.(`[research-excess] chiffres de recherche repris ${used(before)}→${used(after)} (plafond ${cap}), autres ${opts.otherCount(before)}→${opts.otherCount(after)}${rejected ? `, refus ${rejected}` : ""}, gardé=${kept}`);
  return kept ? { content: candidate, analysis: after, applied: true } : { content: text, analysis: before, applied: false };
}






