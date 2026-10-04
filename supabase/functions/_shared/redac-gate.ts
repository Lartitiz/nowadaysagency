import { carouselEditorialFields } from "./carousel-editorial-review.ts";
// ── Quality-gate rédactionnel des carrousels (audit du 10/07/2026) ──
//
// Constat de l'audit corpus : le `quality_check` auto-déclaré par le modèle est
// FAUX (déclarait « slides < 50 mots » et « caption ≠ slide » sur des carrousels
// qui violaient les deux), et les règles ANTI_SLOP restent probabilistes (le
// retournement par négation sortait 3-4× par carrousel malgré la règle « 1 max »).
//
// Ce module fait la seule chose fiable : MESURER en code, puis demander UNE
// re-passe LLM ciblée sur les phrases fautives (jamais plus d'une), et re-mesurer.
// Le quality_check émis au front est celui calculé ici (source: "code").

import { applyCorrectionPass, applyCorrectionPassCarousel, applyResearchSourcingPass, applyTestimonyRemovalPass, extractCarouselTexts, reinjectCarouselTexts, type CorrectionFormat, type CorrectionOptions } from "./correction-pass.ts";

// ── Détection de la famille « retournement par négation » ──
// Mêmes variantes que la règle ANTI_SLOP : "Ce n'est pas X, c'est Y" /
// "Pas X. Y." / "X n'est plus Y. C'est Z." / "Je ne dis pas X. Je dis Y."
const REVERSAL_PATTERNS: RegExp[] = [
  // Nominal antithesis: punctuation/newlines and curly apostrophes included.
  // Deliberately exclude factual fragments such as « Pas dimanche » / « Pas de stock ».
  /(?:^|[.!?]\s+)[^.!?\n]{2,100}[.!]\s+Pas (?:un(?:e)?|des|du|de la|de l['’]|le|la|les|l['’])\s*[^.!?\n]{2,100}[.!?]?/i,
  /\bn(?:'|’)est pas [^.!?\n]{2,90}[.,:] ?[Cc](?:'|’)est\b/,
  /\bc(?:'|’)est pas [^.!?\n]{2,90}[.,:] ?[Cc](?:'|’)est\b/,
  /\bne sont pas [^.!?\n]{2,90}[.,:] ?[Cc]e sont\b/,
  /\bn(?:'|’)est plus [^.!?\n]{2,90}\. ?[Cc](?:'|’)est\b/,
  /(?:^|[.!?]\s+)Pas (?:parce que|pour|un|une|de|du|des|le|la|les|ça)\b[^.!?\n]{0,80}[.:] ?(?:[CcJj](?:'|’)|Juste|Parce que|Mais)/,
  /\bJe ne [^.!?\n]{2,60} pas(?: ça)?[^.!?\n]{0,40}\. ?Je [^\s]+ (?:parce que|pour|que)\b/,
  /(?:^|[.!?]\s+)Pas [^.!?\n]{2,60}\. ?(?:C(?:'|’)est|Juste|Plutôt)\b/,
  // ── Formes COURTES, mesurées hors radar sur le corpus stories du 07/09/2026
  // (5 des 7 retournements d'une séquence passaient sans être comptés) ──
  // « Et non, c'est pas parce que ça marchait pas. »
  /\bEt non, c(?:'|’)est pas\b/,
  // « Pas "amélioré un peu". Calmées. » (négation citée, puis un mot seul)
  /(?:^|[.!?]\s+)Pas ["'«“‘][^"'»”’\n]{2,60}["'»”’]\. ?\p{Lu}[^.!?\n]{0,40}[.!]/u,
  // « C'est pas de ta faute. » / « Ce n'est pas de votre faute. »
  /\bc(?:'|’)est pas de (?:ta|votre|sa|leur) faute\b/i,
  // « Pas pour les raisons que tu crois. »
  /\bpas pour les raisons que (?:tu crois|vous croyez|tu penses|vous pensez)\b/i,
  // « … comme une crème. Pas comme un produit ménager. »
  /\bcomme [^.!?\n]{2,50}\. ?Pas comme\b/,
  // ── Concession de paille + « Sauf que… » vide (test réel LinkedIn 04/10/2026) ──
  // « C'est logique, sur le papier. Sauf que ce n'est pas tout à fait comme ça
  // que ça fonctionne. » La concession n'est comptée QUE suivie d'un « Sauf que »
  // ou « Mais non » : « en théorie… En pratique, [mécanisme] » reste permis.
  /(?:^|[.!?]\s+)(?:C(?:'|’)est (?:logique|séduisant|tentant|cohérent)|Ça (?:se tient|paraît logique|semble logique)), (?:sur le papier|en théorie)[.!] ?(?:Sauf que|Mais non)\b[^.!?\n]{0,90}/,
  /(?:^|[.!?]\s+)(?:Sur le papier|En théorie), (?:ça se tient|c(?:'|’)est logique|ça paraît logique|ça marche|tout se tient)[.!] ?(?:Sauf que|Mais non)\b[^.!?\n]{0,90}/,
  // « Sauf que » en OUVERTURE de phrase suivi d'une négation vide (sans le
  // mécanisme). Un « sauf que » factuel en milieu de phrase, ou « Sauf que la
  // livraison a du retard », ne compte pas.
  /(?:^|[.!?]\s+|\n\s*)Sauf que (?:non\b|(?:ce n(?:'|’)est|c(?:'|’)est|ça n(?:'|’)est) pas (?:tout à fait|vraiment|si simple|aussi simple|exactement|comme ça|ce qui se passe|le cas)|ça ne (?:marche|fonctionne|se passe) pas (?:comme ça|vraiment|tout à fait|ainsi|du tout))[^.!?\n]{0,80}/,
  // ── Antithèse croyance / réalité en deux phrases miroir (re-test réel 04/10/2026) ──
  // « On croit en faire plus. On en fait souvent moins. » / « Tu penses gagner du
  // temps. Tu en perds. » : la 2e phrase est une chute courte (≤ 50 caractères)
  // qui renverse la 1re. Une explication développée après « On pense que… » ne compte pas.
  /(?:^|[.!?]\s+|\n\s*)(?:On|Tu|Vous|Nous) (?:croit|crois|croyez|croyons|pense|penses|pensez|pensons|s['’]imagine|t['’]imagines|vous imaginez|a l['’]impression d(?:e |['’])|as l['’]impression d(?:e |['’]))[^.!?\n]{2,60}[.!] ?(?:Mais |En réalité,? |En fait,? |Au final,? |Résultat ?: )?(?:on|tu|vous|nous|On|Tu|Vous|Nous)\b[^.!?\n]{2,45}[.!]/,
];

// Formules moulées repérées à l'identique dans deux contenus générés à 30 min
// d'écart : si on les laisse, elles se voient dès que deux posts cohabitent.
const MOULDED_VERBATIMS: RegExp[] = [
  // Toutes les fins possibles (« justifier », « dénigrer », « me plaindre »…) :
  // c'est l'OUVERTURE qui est moulée, vue à l'identique dans des contenus distincts.
  /Je ne dis pas ça pour /i,
  /L(?:'|’)IA structure, toi tu incarnes/i,
  // Amorce de prise de position suggérée par DEPTH_LAYER_DUAL, devenue un tic :
  // mesurée dans 5/10 carrousels du corpus qualité 11/07, toujours même position.
  /Ce qui me (?:dérange|gêne)\b/i,
];

const wordCount = (s: string) => (s || "").trim().split(/\s+/).filter(Boolean).length;

// ── Chiffres inventés (lot 3) ──
// Politique (arbitrage 10/07) : aucun chiffre précis qui ne vient pas de
// l'utilisatrice (brief, réponses, branding) ou de l'actu fournie. L'audit a
// montré des stats fabriquées ET contradictoires entre contenus (pertes
// « 10-20 % » vs « 20-30 % » vs « une sur trois » dans le même carrousel).

const NUMBER_TOKEN = /\d+(?:[.,]\d+)?/g;

/** Multipliers/ratios need their own source: « deux usages » does not prove « deux fois plus ». */
function measuredMultipliers(text: string): Array<{ raw: string; key: string; value: string; index: number }> {
  const number = "(?:\\d+(?:[.,]\\d+)?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|vingt|cent)";
  const re = new RegExp(`(?<!\\p{L})(${number})\\s+fois\\s+(plus|moins|sur\\s+(${number}))(?!\\p{L})`, "giu");
  const valueOf = (word: string) => String(FRENCH_NUMERALS[word.toLowerCase()] ?? Number(word.replace(",", ".")));
  return [...text.matchAll(re)].map(m => ({ raw: m[0], value: valueOf(m[1]),
    key: m[3] ? `ratio:${valueOf(m[1])}/${valueOf(m[3])}` : `multiplier:${valueOf(m[1])}:${m[2].toLowerCase()}`,
    index: m.index!,
  }));
}


/** Tokens numériques d'un texte (pour construire la liste blanche d'entrée). */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of (text || "").matchAll(NUMBER_TOKEN)) out.add(m[0].replace(",", "."));
  for (const m of measuredMultipliers(text || "")) {
    out.add(m.key);
    out.add(m.value);
    if (m.key.startsWith("ratio:")) out.add(m.key.split("/")[1]);
  }
  return out;
}

/** Chiffres du texte absents de la liste blanche, avec un extrait de contexte. */
function findFabricatedNumbers(text: string, allowed: Set<string>): string[] {
  const found: string[] = [];
  const seenValues = new Set<string>();
  for (const m of (text || "").matchAll(NUMBER_TOKEN)) {
    const tok = m[0].replace(",", ".");
    if (allowed.has(tok)) continue;
    // Ordinaux (« 1er », « 2e », « 1ʳᵉ ») : pas des statistiques.
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 3);
    if (/^(?:er|re|e\b|ᵉ|ʳ)/.test(after)) continue;
    // Dédup par VALEUR : « 35 » relevé trois fois = un seul chiffre à traiter.
    if (seenValues.has(tok)) continue;
    seenValues.add(tok);
    const ctx = text.slice(Math.max(0, m.index! - 30), m.index! + m[0].length + 30).replace(/\s+/g, " ").trim();
    found.push(`${m[0]} (« …${ctx}… »)`);
  }
  for (const m of measuredMultipliers(text || "")) {
    if (allowed.has(m.key) || seenValues.has(m.value)) continue;
    seenValues.add(m.value);
    const ctx = text.slice(Math.max(0, m.index - 30), m.index + m.raw.length + 40).replace(/\s+/g, " ").trim();
    found.push(`${m.raw} (« …${ctx}… »)`);
  }
  return found;
}

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
function baseInputText(inputText?: string, researchText?: string): string {
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

/** Phrases d'un texte (coupe sur . ! ? … suivis d'un blanc, et sur les retours à la ligne). */
function sentencesOf(text: string): string[] {
  return (text || "").split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
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

const UNSOURCED_RESEARCH_FIX = (items: string[]) =>
  `CHIFFRES DE LA RECHERCHE REPRIS SANS LEUR SOURCE : ces chiffres ne viennent que de la matière de recherche, et la phrase qui les reprend ne cite pas leur source :\n${items.map((n) => `- ${n}`).join("\n")}\nPour CHACUN : si la matière de recherche donne la source de ce chiffre, ajoute-la DANS LA MÊME PHRASE (ou dans la phrase juste avant, si elle introduit l'étude), de façon discrète (« (Nom, année) » ou « selon Nom ») ; sinon, remplace le chiffre par une formulation qualitative honnête (« une petite partie de ton réseau », « les premiers jours »). N'invente JAMAIS de source, de nom ou d'année. Ne touche pas au reste du texte.`;

/** Noms propres et années ajoutés par une correction : ils doivent venir de la recherche. */
function inventedSourceTokens(before: string, after: string, researchText: string): string[] {
  // Les marqueurs « [SLIDE 1 - BODY] » des textes balisés ne sont pas des sources.
  const tokens = (t: string) => new Set((t.replace(/\[[^\]\n]{1,40}\]/g, " ").match(/\p{Lu}[\p{L}\d'’-]+|(?<!\d)(?:19|20)\d{2}(?!\d)/gu) || []));
  const had = tokens(before);
  const research = researchText.toLowerCase();
  return [...tokens(after)].filter((tok) => !had.has(tok) && !research.includes(tok.toLowerCase()));
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

// ── Témoignages inventés (04/10/2026) ──
// Vu en test réel : deux posts LinkedIn successifs, sans réponse aux questions,
// ouvraient sur « Une céramiste me disait récemment qu'elle avait doublé sa
// fréquence… ». Aucune source ne le fournit : c'est un vécu inventé. La règle
// existe dans les prompts ; ici on la MESURE. Une parole rapportée (« une
// cliente m'a dit », « mes client·es me disent ») ou une rencontre (« j'ai
// discuté avec une… », « on me dit souvent… ») n'est acceptée que si le brief, les réponses ou l'actu
// en contiennent déjà une.

const TESTIMONY_SUBJECT = String.raw`(?:une?|mon|ma|mes|des|plusieurs|certaine?s?|l['’]une?(?:\s+de\s+mes)?|deux|trois|quelques)(?:·e)?`;
const TESTIMONY_VERB_PRESENT = String.raw`(?:pos(?:ait|aient|e|ent)\s+(?:souvent\s+|régulièrement\s+|toujours\s+|sans\s+cesse\s+)?(?:la|une|cette|des|ces|toujours\s+la)\s+questions?|disai(?:t|ent)|dit|disent|confi(?:ait|aient|e|ent)|racont(?:ait|aient|e|ent)|écri(?:vait|vaient|t|vent)|expliqu(?:ait|aient|e|ent)|demand(?:ait|aient|e|ent)|avou(?:ait|aient|e|ent)|répét(?:ait|aient)|répètent?|gliss(?:ait|aient|e|ent)|lan[cç](?:ait|aient|e|ent)|montr(?:ait|aient)|envoy(?:ait|aient)|partage(?:ait|aient)?|souffl(?:ait|aient|e|ent)|conseill(?:ait|aient|e|ent))`;
const TESTIMONY_VERB_PAST = String.raw`(?:dit|confié|raconté|écrit|expliqué|demandé|avoué|répété|glissé|lancé|montré|envoyé|renvoyé|partagé|soufflé|conseillé|répété|posé\s+(?:la|une|cette)\s+question)`;
// Sujets qui « disent » sans être une personne rencontrée : « mon instinct me dit ».
const NON_PERSON_SUBJECT = /(?<!\p{L})(?:instinct|intuition|voix|cerveau|tête|ventre|cœur|coeur|corps|expérience|algorithme|logique|statistiques?|chiffres?|graphiques?|données|stats|application|appli|outil|calendrier|agenda|miroir|téléphone|étude|article|livre|podcast|rapport|sondage)(?!\p{L})/iu;

const REPORTED_SPEECH_RE = new RegExp(
  String.raw`(?<!\p{L})${TESTIMONY_SUBJECT}\s+[^.!?\n]{1,60}?(?:\s|,)(?:me\s+${TESTIMONY_VERB_PRESENT}|m['’](?:a|ont|avait|avaient)\s+${TESTIMONY_VERB_PAST})(?!\p{L})`,
  "giu",
);
// « On me dit souvent que… » : parole rapportée sans auteur, même vécu inventé (re-test réel 04/10).
const IMPERSONAL_SPEECH_RE = new RegExp(
  String.raw`(?<!\p{L})on\s+(?:[^.!?\n]{0,25}?\s)?(?:me\s+${TESTIMONY_VERB_PRESENT}|m['’](?:a|avait)\s+(?:souvent\s+|déjà\s+|toujours\s+)?${TESTIMONY_VERB_PAST})(?!\p{L})`,
  "iu",
);
// « Vous me demandez souvent… », « vous êtes nombreuses à m'écrire… » : audience inventée (re-test réel 04/10).
const AUDIENCE_SPEECH_RE = new RegExp(
  String.raw`(?<!\p{L})(?:vous\s+(?:[^.!?\n]{0,20}?\s)?me\s+(?:demandez|posez|dites|écrivez|racontez|confiez)|vous\s+êtes\s+(?:nombreu(?:x|ses)|beaucoup|plusieurs)\s+à\s+m['’]?(?:e\s+)?(?:demander|poser|dire|écrire|raconter|confier))(?!\p{L})`,
  "iu",
);
const ENCOUNTER_RE = /(?<!\p{L})(?:j['’](?:ai|avais)\s+(?:discuté|échangé|parlé|croisé|rencontré|accompagné)\s+(?:avec\s+)?(?:une?|des|plusieurs|deux|trois)\s|j['’]échangeais\s+avec\s+(?:une?|des)\s|je\s+(?:parlais|discutais)\s+avec\s+(?:une?|des)\s|(?:en\s+accompagnant|en\s+discutant\s+avec)\s+(?:une?|des)\s)/giu;

function testimonyPassages(text: string): string[] {
  const out: string[] = [];
  for (const sentence of sentencesOf(text)) {
    const s = sentence.replace(/\s+/g, " ");
    const hits = [...s.matchAll(REPORTED_SPEECH_RE)].filter((m) => !NON_PERSON_SUBJECT.test(m[0]));
    if (hits.length || IMPERSONAL_SPEECH_RE.test(s) || AUDIENCE_SPEECH_RE.test(s) || ENCOUNTER_RE.test(s)) out.push(s.length > 200 ? s.slice(0, 197) + "…" : s);
    ENCOUNTER_RE.lastIndex = 0;
  }
  return out;
}

/**
 * Phrases qui rapportent la parole d'une personne rencontrée ou une rencontre,
 * alors que les sources (brief, réponses, actu) n'en contiennent aucune.
 * `sourceText` absent = pas de mesure (l'appelant ne sait pas ce qui est fourni).
 */
export function findInventedTestimonials(text: string, sourceText?: string): string[] {
  if (sourceText === undefined) return [];
  if (testimonyPassages(sourceText).length) return [];
  return testimonyPassages(text || "");
}

// ── Vécu personnel inventé (04/10/2026) ──
// Vu en test réel après #1300 et #1310, sans réponse aux questions : « Doubler
// sa fréquence […], c'est courant. J'ai essayé. Résultat : moins de vues
// qu'avant. Je pensais que c'était moi… En fait non. » Le « je » de position
// doit être une opinion au présent ; un vécu au passé (« j'ai essayé / testé »,
// « je pensais », « résultat : » qui le suit) n'est accepté que si le brief,
// les réponses ou l'actu en racontent déjà un.

const EXPERIENCE_ADVERBS = String.raw`(?:(?:longtemps|déjà|souvent|moi-même|moi\s+aussi|aussi|même|d['’]abord|vraiment|tout|enfin|beaucoup|toujours|plusieurs\s+fois|récemment|personnellement)\s+){0,2}`;
const EXPERIENCE_PARTICIPLES = String.raw`(?:essayée?s?|testée?s?|tentée?s?|fait(?!\s+(?:le\s+|ce\s+)?(?:choix|pari))|refait|publiée?s?|postée?s?|doublée?|triplée?|multipliée?|augmentée?|arrêtée?|commencée?|recommencée?|lancée?s?|perdue?s?|gagnée?s?|passée?s?|vue?s?|remarquée?|constatée?|observée?|appris|compris|découverte?|cru|suivie?s?|appliquée?s?|changée?|mesurée?|vécue?|connue?|misée?)`;
const FIRST_PERSON_PAST_RES: RegExp[] = [
  new RegExp(String.raw`(?<!\p{L})j['’](?:ai|avais)\s+${EXPERIENCE_ADVERBS}${EXPERIENCE_PARTICIPLES}(?!\p{L})`, "iu"),
  new RegExp(String.raw`(?<!\p{L})je\s+(?:l['’]|les\s+)(?:ai|avais)\s+${EXPERIENCE_ADVERBS}${EXPERIENCE_PARTICIPLES}(?!\p{L})`, "iu"),
  new RegExp(String.raw`(?<!\p{L})nous\s+(?:avons|avions)\s+${EXPERIENCE_ADVERBS}${EXPERIENCE_PARTICIPLES}(?!\p{L})`, "iu"),
  /(?<!\p{L})je\s+me\s+suis\s+(?:longtemps\s+|vite\s+|alors\s+)?(?:lancée?|mise?\s+à|rendue?\s+compte|aperçue?|dit|retrouvée?|surprise?|accrochée?|obligée?)(?!\p{L})/iu,
  /(?<!\p{L})je\s+(?:pensais|croyais|me\s+disais|m['’]imaginais|imaginais|publiais|postais|testais|passais|suivais|m['’]acharnais|me\s+demandais)(?!\p{L})/iu,
  /(?<!\p{L})j['’](?:étais|ai\s+été)\s+(?:convaincue?|persuadée?|sûre?|certaine?)(?!\p{L})/iu,
];
// Voix prêtée au lecteur (« tu te dis : j'ai tout essayé ») : pas un vécu de l'autrice.
const READER_VOICE_RE = /(?<!\p{L})(?:tu|vous)\s+(?:te\s+|vous\s+|t['’])?(?:dis|dites|penses|pensez|répètes|répétez|réponds|répondez|avoues|avouez|es\s+dit|êtes\s+dit)(?!\p{L})/iu;
const QUOTED_RE = /«[^»]*»|“[^”]*”|"[^"\n]*"/g;
// Côté sources, on est large : un vécu à peine esquissé (« mon test de 30 jours », « j'ai… ») suffit.
const PROVIDED_EXPERIENCE_RE = /(?<!\p{L})(?:j['’](?:ai|avais|étais)|je\s+me\s+suis|nous\s+avons|(?:mon|mes|notre)\s+(?:test|essai|expérience|vécu)s?)(?!\p{L})/iu;
const RESULT_LEAD_RE = /^(?:et\s+)?(?:le\s+)?résultats?\s*:/iu;

function hasFirstPersonPast(sentence: string, stripQuotes: boolean): boolean {
  const s = stripQuotes ? sentence.replace(QUOTED_RE, " ") : sentence;
  return FIRST_PERSON_PAST_RES.some((re) => {
    const m = s.match(re);
    if (!m || m.index === undefined) return false;
    const before = s.slice(0, m.index);
    // Hypothèse (« si je pensais… ») ou voix du lecteur : pas un vécu raconté.
    if (/(?<!\p{L})si\s*$/iu.test(before) || READER_VOICE_RE.test(before)) return false;
    return true;
  });
}

/** Passages de vécu au passé, phrases voisines (et « Résultat : » qui suit) regroupées. */
function experiencePassages(text: string, stripQuotes = true): string[] {
  const out: string[] = [];
  for (const paragraph of (text || "").split(/\n+/)) {
    let current: string[] = [];
    const flush = () => {
      if (current.length) {
        const p = current.join(" ").replace(/\s+/g, " ");
        out.push(p.length > 220 ? p.slice(0, 217) + "…" : p);
      }
      current = [];
    };
    for (const sentence of sentencesOf(paragraph)) {
      if (hasFirstPersonPast(sentence, stripQuotes) || (current.length && RESULT_LEAD_RE.test(sentence))) current.push(sentence);
      else flush();
    }
    flush();
  }
  return out;
}

/**
 * Vécu personnel au passé (« j'ai essayé », « je pensais », « résultat : »)
 * alors que les sources (brief, réponses, actu) n'en racontent aucun.
 * `sourceText` absent = pas de mesure.
 */
export function findInventedExperiences(text: string, sourceText?: string): string[] {
  if (sourceText === undefined) return [];
  if (experiencePassages(sourceText, false).length || PROVIDED_EXPERIENCE_RE.test(sourceText)) return [];
  return experiencePassages(text || "");
}

const INVENTED_EXPERIENCE_FIX = (items: string[]) =>
  `VÉCU PERSONNEL INVENTÉ : ces passages racontent une expérience de l'autrice au passé (« j'ai essayé », « je pensais », « résultat : »), alors que ni le brief, ni les réponses, ni l'actu ne la fournissent :\n${items.map((t) => `- « ${t} »`).join("\n")}\nRéécris CHAQUE passage en opinion au présent (« Je pense que… », « Pour moi… ») ou en constat général (« c'est courant », « souvent, la portée baisse même »). Garde l'idée et la position ; aucun test, essai, résultat ou croyance passée de l'autrice.`;

const INVENTED_TESTIMONY_FIX = (items: string[]) =>
  `TÉMOIGNAGE INVENTÉ : ces phrases rapportent la parole d'une personne rencontrée (cliente, amie, artisane…) ou une rencontre, alors que ni le brief, ni les réponses, ni l'actu ne la fournissent :\n${items.map((t) => `- « ${t} »`).join("\n")}\nRetire CHAQUE témoignage et garde l'idée qu'il portait, dite comme un constat général au présent ou comme l'opinion de l'autrice. Aucune personne, parole rapportée ou scène de remplacement.`;

/**
 * Filet dédié (04/10/2026) : s'il reste un témoignage ou un vécu au passé
 * inventé après la relecture, UNE passe courte qui ne fait que le retirer. Gardée seulement si
 * le code mesure moins de témoignages et aucun autre compteur dégradé.
 */
export async function enforceNoInventedTestimonials<A extends { inventedTestimonials?: string[]; inventedExperiences?: string[] } = TextRedacAnalysis>(
  text: string,
  analyze: (t: string) => A,
  opts: {
    logger?: (msg: string) => void; abortTimeoutMs?: number; before?: A;
    /** Somme des AUTRES compteurs (défaut : variante texte) : aucun ne doit se dégrader. */
    otherCount?: (a: A) => number;
    /** Refus supplémentaire propre à l'appelant (ex. chiffre sourcé perdu par le carrousel). */
    reject?: (candidate: string) => string | null;
  },
): Promise<{ content: string; analysis: A; applied: boolean }> {
  const before = opts.before ?? analyze(text);
  const items = before.inventedTestimonials ?? [];
  const experiences = before.inventedExperiences ?? [];
  if (!items.length && !experiences.length) return { content: text, analysis: before, applied: false };
  const candidate = await applyTestimonyRemovalPass(text, { items, experiences, logger: opts.logger, abortTimeoutMs: opts.abortTimeoutMs });
  if (!candidate || candidate === text) return { content: text, analysis: before, applied: false };
  const after = analyze(candidate);
  const count = (a: A) => (a.inventedTestimonials?.length ?? 0) + (a.inventedExperiences?.length ?? 0);
  const others = opts.otherCount ?? ((a: A) => textRedacRawCount(a as unknown as TextRedacAnalysis) - count(a));
  const rejected = opts.reject?.(candidate) ?? null;
  const kept = count(after) < count(before) && others(after) <= others(before) && !rejected;
  opts.logger?.(`[testimony-removal] témoignages inventés ${before.inventedTestimonials?.length ?? 0}→${after.inventedTestimonials?.length ?? 0}, vécus inventés ${experiences.length}→${after.inventedExperiences?.length ?? 0}, autres ${others(before)}→${others(after)}${rejected ? `, refus ${rejected}` : ""}, gardé=${kept}`);
  return kept ? { content: candidate, analysis: after, applied: true } : { content: text, analysis: before, applied: false };
}

// ── Cohérence des durées slides ↔ caption (bilan hebdo 17/08/2026) ──
// Trou trouvé au juge /5 : un carrousel « avant/après » notait « Trois semaines
// sans visite » en slide 2 et « Un mois entre les deux photos » en légende — deux
// chiffres qui décrivent le MÊME fait, et le gate lui a mis 100/100.
// Pourquoi ça passait : NUMBER_TOKEN ne voit que les CHIFFRES (\d), donc les
// nombres écrits EN LETTRES échappaient déjà à `findFabricatedNumbers` ; et rien
// ne relisait les slides CONTRE la caption (les deux textes n'étaient comparés
// que pour le CTA). Une contradiction interne est pourtant le défaut le plus
// coûteux : il décrédibilise la publication devant l'audience de la cliente.

const FRENCH_NUMERALS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20,
  trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100,
};

/** Durée exprimée en JOURS, pour comparer « trois semaines » et « un mois ». */
const DURATION_UNITS: Array<{ re: RegExp; days: number }> = [
  { re: /^secondes?$/, days: 1 / 86400 },
  { re: /^minutes?$/, days: 1 / 1440 },
  { re: /^heures?$/, days: 1 / 24 },
  { re: /^(?:jours?|journées?)$/, days: 1 },
  { re: /^semaines?$/, days: 7 },
  { re: /^mois$/, days: 30 },
  { re: /^trimestres?$/, days: 90 },
  { re: /^(?:ans?|années?)$/, days: 365 },
];

interface Duration { raw: string; days: number }

/** Durées d'un texte, chiffrées (« 3 semaines ») ou en lettres (« trois semaines »). */
function extractDurations(text: string): Duration[] {
  const out: Duration[] = [];
  const words = "(?:" + Object.keys(FRENCH_NUMERALS).join("|") + ")";
  const re = new RegExp(`(\\d+(?:[.,]\\d+)?|${words})\\s+(\\p{L}+)`, "giu");
  for (const m of (text || "").matchAll(re)) {
    const qty = /^\d/.test(m[1]) ? parseFloat(m[1].replace(",", ".")) : FRENCH_NUMERALS[m[1].toLowerCase()];
    if (!qty || !Number.isFinite(qty)) continue;
    const unit = DURATION_UNITS.find((u) => u.re.test(m[2].toLowerCase()));
    if (!unit) continue;
    out.push({ raw: `${m[1]} ${m[2]}`, days: qty * unit.days });
  }
  return out;
}

/**
 * Durées PROCHES mais DIFFÉRENTES entre les slides et la caption = très
 * probablement le même fait raconté deux fois avec deux chiffres.
 *
 * Volontairement étroit pour ne pas crier à tort :
 *  - il faut une durée de CHAQUE côté ;
 *  - une durée commune aux deux côtés désamorce tout (le fait est cohérent) ;
 *  - on ne retient que les écarts du même ORDRE DE GRANDEUR (rapport ≤ 3) —
 *    « 2 minutes » côté slide et « 10 ans » côté caption parlent d'autre chose.
 */
function findDurationConflicts(slidesText: string, captionText: string): string[] {
  const a = extractDurations(slidesText);
  const b = extractDurations(captionText);
  if (!a.length || !b.length) return [];
  const same = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  if (a.some((x) => b.some((y) => same(x.days, y.days)))) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of a) {
    for (const y of b) {
      const ratio = Math.max(x.days, y.days) / Math.min(x.days, y.days);
      if (ratio > 3) continue;
      const key = `${x.raw}|${y.raw}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`slides « ${x.raw} » vs légende « ${y.raw} »`);
    }
  }
  return out;
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

/** Mots normalisés (accents gardés, ponctuation ignorée) pour comparer deux textes. */
function normalizeWordsForOverlap(text: string): string[] {
  return (text || "").toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
}

interface OffsetWord { word: string; start: number; end: number }

/** Comme normalizeWordsForOverlap, mais garde la position dans le texte source. */
function wordsWithOffsets(text: string): OffsetWord[] {
  const out: OffsetWord[] = [];
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) {
    out.push({ word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

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

/** Similarité lexicale grossière (Jaccard sur tokens > 3 lettres). */
function tokenSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set((s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3));
  const ta = tok(a);
  const tb = tok(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

function slideTexts(s: any): string {
  return [...carouselEditorialFields({ slides: [s] }).map(f => f.text),
    ...(typeof s?.big_number === "number" ? [String(s.big_number)] : []),
  ].join(" ");
}

/** Corps mesurable d'une slide pour la règle « 50 mots » (titre exclu). */
function slideBody(s: any): string {
  return [s?.body, s?.overlay_text].filter(Boolean).join(" ");
}

function findReversals(text: string): string[] {
  const found: string[] = [];
  // Analyse phrase par phrase pour remonter des extraits actionnables
  const sentences = (text || "").split(/(?<=[.!?])\s+/);
  for (let i = 0; i < sentences.length; i++) {
    const window = sentences.slice(i, i + 2).join(" ");
    for (const re of REVERSAL_PATTERNS) {
      const m = window.match(re);
      if (m) {
        found.push(m[0].slice(0, 140));
        break;
      }
    }
  }
  // Un même passage vu depuis deux fenêtres (concession + « Sauf que… », puis
  // « Sauf que… » seul) ne compte qu'une fois : on garde l'extrait le plus long.
  const unique = [...new Set(found)];
  return unique.filter((f) => !unique.some((g) => g !== f && g.includes(f)));
}

export interface RedacAnalysis {
  reversals: string[];
  overlongSlides: Array<{ slide: number; words: number }>;
  /** Overlays photo > 28 mots (règle : 5-25, un overlay est une phrase posée SUR la photo). */
  overlongOverlays: Array<{ slide: number; words: number }>;
  ctaDuplicated: boolean;
  moulded: string[];
  hashtagsCount: number;
  fabricatedNumbers: string[];
  /** Chiffres que seule la recherche fournit, repris sans leur source dans la même phrase. */
  unsourcedResearchNumbers?: string[];
  /** Durées qui se contredisent entre les slides et la caption (même fait, 2 chiffres). */
  durationConflicts: string[];
  /** Passages qui recopient quasi mot pour mot un champ de la fiche de marque. */
  brandCopyOverlap: string[];
  /** Accroches DÉJÀ écrites pour ce sujet que celle-ci redit (cf. findHookEchoes). */
  hookEchoes: string[];
  /** Paroles rapportées ou rencontres qu'aucune source ne fournit (slides + légende). */
  inventedTestimonials?: string[];
  /** Vécu de l'autrice au passé qu'aucune source ne fournit (slides + légende). */
  inventedExperiences?: string[];
}

/** Contexte inter-contenus : ce que le gate ne peut pas voir dans le document seul. */
export interface EchoContext {
  /** Accroches des contenus précédents du MÊME sujet, pour la même utilisatrice. */
  previousHooks?: string[];
  /** Sujet, dont les mots sont neutralisés avant comparaison (ils reviennent forcément). */
  subject?: string;
}

/** `testimonySource` : brief + réponses + actu ; absent = témoignages et vécus non mesurés. */
export function analyzeCarouselRedac(parsed: any, allowedNumbers?: Set<string>, brandGuardText?: string, echo?: EchoContext, research?: ResearchNumbers, testimonySource?: string): RedacAnalysis {
  const doc = parsed?.carousel?.slides ? parsed.carousel : parsed;
  const slides: any[] = Array.isArray(doc?.slides) ? doc.slides : [];
  const caption = doc?.caption ?? doc?.instagram_caption ?? parsed?.caption ?? parsed?.instagram_caption ?? {};
  const slidesText = slides.map(slideTexts).join("\n");
  const captionText = typeof caption === "string" ? caption : [caption.hook, caption.body, caption.cta].filter(Boolean).join(" ");
  const allText = [slidesText, captionText].join("\n");

  const reversals = findReversals(allText);
  const brandCopyOverlap = findBrandCopyOverlap(allText, brandGuardText);

  const overlongSlides = slides
    .map((s: any) => ({ slide: s?.slide_number ?? 0, words: wordCount(slideBody(s)) }))
    .filter((x) => x.words > 55); // 50 (règle, corps seul) + tolérance de comptage

  // Overlay = phrase posée SUR la photo : la règle 5-25 mots n'avait aucun gate
  // (30 mots vus en live, audit 12/07 lot D). Seuil 28 = 25 + tolérance.
  const overlongOverlays = slides
    .filter((s: any) => typeof s?.overlay_text === "string" && s.overlay_text.trim())
    .map((s: any) => ({ slide: s?.slide_number ?? 0, words: wordCount(s.overlay_text) }))
    .filter((x) => x.words > 28);

  // CTA de caption ≡ CTA de la dernière slide (la caption doit COMPLÉTER, pas répéter)
  const lastSlide = slides[slides.length - 1];
  const ctaDuplicated = Boolean(
    caption?.cta && lastSlide && tokenSimilarity(caption.cta, slideTexts(lastSlide)) >= 0.7,
  );

  const moulded = MOULDED_VERBATIMS.map((re) => allText.match(re)?.[0]).filter(Boolean) as string[];

  const hashtagsCount = Array.isArray(caption?.hashtags) ? caption.hashtags.length : 0;

  // Chiffres : on analyse aussi les schémas visuels (stats affichées sur les slides)
  const schemaText = slides
    .map((s: any) => (s?.visual_schema ? JSON.stringify(s.visual_schema) : ""))
    .join("\n");
  const fabricatedNumbers = allowedNumbers
    ? findFabricatedNumbers(allText + "\n" + schemaText, allowedNumbers)
    : [];
  // Une slide se lit d'un bloc (titre + corps) : la source peut être dans l'un, le chiffre dans l'autre.
  const unsourcedResearchNumbers = findUnsourcedResearchNumbers(
    "", research, [...slides.map(slideTexts), ...sentencesOf(captionText)],
  );

  const durationConflicts = findDurationConflicts(slidesText, captionText);
  // L'accroche d'un carrousel = le texte de sa slide 1, quel que soit le format
  // (le mixte et le photo portent `overlay_text`, pas `title`).
  const hookEchoes = findHookEchoes(slideTexts(slides[0]) || caption.hook || "", echo?.previousHooks, echo?.subject);

  // Témoignages et vécus au passé inventés (04/10/2026) : mêmes détecteurs que
  // la variante texte, sur slides + légende. Chaque slide est un paragraphe.
  const inventedTestimonials = findInventedTestimonials(allText, testimonySource);
  const inventedExperiences = findInventedExperiences(allText, testimonySource);

  return {
    reversals, overlongSlides, overlongOverlays, ctaDuplicated, moulded,
    hashtagsCount, fabricatedNumbers, unsourcedResearchNumbers, durationConflicts, brandCopyOverlap, hookEchoes,
    inventedTestimonials, inventedExperiences,
  };
}

/**
 * Normalise les hashtags de la caption : cap par canal (3 Instagram, 2 LinkedIn),
 * sans « # » (convention du schéma), dédoublonnés, espaces retirés. Le prompt
 * demandait 3 et le modèle en sortait 7-8, tantôt avec tantôt sans « # ».
 */
export function normalizeCaptionHashtags(parsed: any, isLinkedIn: boolean): void {
  const caption = parsed?.caption;
  if (!caption || !Array.isArray(caption.hashtags)) return;
  const max = isLinkedIn ? 2 : 3;
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const h of caption.hashtags) {
    if (typeof h !== "string") continue;
    const tag = h.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(tag);
    if (clean.length >= max) break;
  }
  caption.hashtags = clean;
}

/** Nombre de violations rédactionnelles — formule partagée avec le quality_check. */
export function redacViolations(a: RedacAnalysis): number {
  return (
    a.reversals.length + // Dès la première formule ajoutée par le modèle.
    (a.ctaDuplicated ? 1 : 0) +
    a.moulded.length +
    Math.min(3, a.fabricatedNumbers.length) +
    Math.min(3, a.unsourcedResearchNumbers?.length ?? 0) +
    // Plafonné à 1 : une contradiction, c'est UN fait à corriger, même si le
    // croisement slides × caption en remonte plusieurs formulations.
    Math.min(1, a.durationConflicts.length) +
    Math.min(3, a.brandCopyOverlap.length) +
    // Plafonné à 1 : c'est UNE accroche à réécrire, qu'elle fasse écho à un ou
    // à cinq contenus précédents.
    Math.min(1, a.hookEchoes.length) +
    Math.min(3, a.inventedTestimonials?.length ?? 0) +
    Math.min(3, a.inventedExperiences?.length ?? 0)
  );
}

/** Compteurs bruts du carrousel (non plafonnés) : garde anti-régression des passes dédiées. */
export function carouselRedacRawCount(a: RedacAnalysis): number {
  return a.reversals.length + Number(a.ctaDuplicated) + a.moulded.length + a.fabricatedNumbers.length +
    (a.unsourcedResearchNumbers?.length ?? 0) + a.durationConflicts.length + a.brandCopyOverlap.length +
    a.hookEchoes.length + (a.inventedTestimonials?.length ?? 0) + (a.inventedExperiences?.length ?? 0);
}

/** Score rédactionnel 0-100 (plancher 40), dérivé des violations. */
export function redacScore(a: RedacAnalysis): number {
  return Math.max(40, 100 - 10 * redacViolations(a));
}

/** quality_check calculé (remplace l'auto-déclaré, qui rapportait faux). */
function buildQualityCheck(a: RedacAnalysis, repassed: boolean) {
  const violations = redacViolations(a);
  return {
    source: "code",
    scope: "lexical_only_not_editorial_progression",
    length_policy: "layout_telemetry_only",
    score: redacScore(a),
    reversal_negation_count: a.reversals.length,
    slides_over_50_words: a.overlongSlides,
    overlays_over_28_words: a.overlongOverlays,
    caption_cta_duplicates_slide: a.ctaDuplicated,
    moulded_verbatims: a.moulded,
    fabricated_numbers: a.fabricatedNumbers.length,
    unsourced_research_numbers: a.unsourcedResearchNumbers?.length ?? 0,
    invented_testimonials: a.inventedTestimonials?.length ?? 0,
    invented_experiences: a.inventedExperiences?.length ?? 0,
    duration_conflicts: a.durationConflicts,
    brand_copy_overlap: a.brandCopyOverlap.length,
    hook_echoes: a.hookEchoes,
    hashtags_count: a.hashtagsCount,
    corrected_by_repass: repassed,
  };
}

// ── Chute de caption imposée (caption v2, 12/07) ──
// Le tirage par code d'une forme de chute (question / affirmation / invitation
// impérative / confidence / sobre) n'est PAS respecté de façon fiable par le
// modèle (re-test v3 : 5/7 questions pour ~1-2 attendues). Le gate mesure la
// conformité et la re-passe ciblée corrige — même patron que le reste du gate.

export interface CaptionEndingRule {
  /** true = la chute imposée est une question ; false = toute autre forme (aucun « ? »). */
  requiresQuestion: boolean;
  /** Description de la forme imposée, réinjectée telle quelle dans la re-passe. */
  instruction: string;
}

/** La caption viole-t-elle la forme de chute imposée ? */
export function captionEndingViolated(parsed: any, rule?: CaptionEndingRule): boolean {
  if (!rule) return false;
  const caption = parsed?.caption;
  if (!caption || typeof caption !== "object") return false;
  const cta = String(caption.cta || "").trim();
  const bodyTail = String(caption.body || "").trim().split("\n").filter(Boolean).pop() || "";
  const tail = (cta || bodyTail).trim();
  if (rule.requiresQuestion) return !/\?/.test(cta + " " + bodyTail);
  // Forme non-question : un « ? » dans le cta, ou une fin de caption en question, = violation.
  return /\?/.test(cta) || /\?\s*$/.test(tail);
}

/** Construit les instructions ciblées de la re-passe à partir des mesures. */
function buildFixInstructions(a: RedacAnalysis): string {
  const lines: string[] = [];
  if (a.reversals.length > 0) {
    lines.push(
      `RETOURNEMENTS PAR NÉGATION : ${a.reversals.length} détectés, aucun effet ajouté n’est autorisé (caption comprise). Réécris chaque passage signalé en affirmation directe, en préservant les négations factuelles et verbatims fournis à garder (même sens, sans « pas X, c'est Y »). Une concession suivie de « Sauf que… » disparaît, et une antithèse en deux phrases miroir (« On croit en faire plus. On en fait souvent moins. ») devient une seule phrase qui dit le mécanisme (« Publier trop vite coupe l'élan du post précédent. ») :\n${a.reversals.map((r) => `- « ${r} »`).join("\n")}`,
    );
  }
  // Length is layout telemetry only: preserve useful prose and transitions.
  if (a.ctaDuplicated) {
    lines.push(
      `CTA DUPLIQUÉ : le "cta" de la caption répète la dernière slide. Réécris le cta de la CAPTION pour qu'il soit COMPLÉMENTAIRE (autre formulation, autre angle d'invitation), pas une copie.`,
    );
  }
  for (const m of a.moulded) {
    lines.push(`FORMULE MOULÉE : « ${m} » est une signature IA récurrente. Réécris-la autrement (ou supprime-la).`);
  }
  if (a.fabricatedNumbers.length) {
    lines.push(
      `CHIFFRES SANS SOURCE : ces chiffres ne viennent ni du brief, ni des réponses de l'utilisatrice, ni de son branding, ni de l'actu fournie :\n${a.fabricatedNumbers.map((n) => `- ${n}`).join("\n")}\nRemplace CHACUN par une formulation qualitative honnête (« une bonne partie », « plusieurs semaines », « la plupart », « bien plus cher »). N'invente JAMAIS de statistique, de prix, de durée ou de proportion. Si un schéma visuel de type stats n'a plus de chiffre à afficher, transforme-le en slide texte.`,
    );
  }
  if (a.unsourcedResearchNumbers?.length) lines.push(UNSOURCED_RESEARCH_FIX(a.unsourcedResearchNumbers));
  if (a.inventedTestimonials?.length) lines.push(INVENTED_TESTIMONY_FIX(a.inventedTestimonials));
  if (a.inventedExperiences?.length) lines.push(INVENTED_EXPERIENCE_FIX(a.inventedExperiences));
  if (a.durationConflicts.length) {
    lines.push(
      `DURÉES QUI SE CONTREDISENT entre les slides et la légende :\n${a.durationConflicts.map((c) => `- ${c}`).join("\n")}\nC'est le MÊME fait raconté deux fois avec deux chiffres différents — devant l'audience, ça décrédibilise tout le contenu. Choisis UNE durée et emploie EXACTEMENT la même des deux côtés (ou retire-la d'un des deux). Ne « fais pas la moyenne » : garde celle du brief si le brief en donne une.`,
    );
  }
  if (a.brandCopyOverlap.length) {
    lines.push(
      `PASSAGES RECOPIÉS DE LA FICHE DE MARQUE : ces extraits reprennent quasi mot pour mot un champ de la fiche de marque de l'utilisatrice (combat, mission, ton, expressions, convictions) :\n${a.brandCopyOverlap.map((o) => `- « ${o} »`).join("\n")}\nCette fiche est la MATIÈRE de l'utilisatrice, jamais son texte final. Reformule CHAQUE extrait avec des mots neufs, garde le sens et l'intensité, mais ne recopie plus la fiche de marque telle quelle.`,
    );
  }
  if (a.hookEchoes.length) {
    lines.push(
      `ACCROCHE DÉJÀ UTILISÉE POUR CE SUJET : cette ouverture redit une accroche déjà écrite pour le même sujet :\n${a.hookEchoes.map((h) => `- « ${h} »`).join("\n")}\nL'audience voit la SÉRIE, pas un contenu isolé : deux publications qui ouvrent pareil donnent l'impression d'un contenu recyclé à la chaîne. Réécris l'accroche avec un angle d'attaque VRAIMENT différent — change ce sur quoi elle ouvre (une scène vécue plutôt qu'un constat, une question plutôt qu'une affirmation, un détail concret plutôt qu'une généralité). Garde le sujet et le fond du contenu, change l'entrée.`,
    );
  }
  return lines.join("\n\n");
}

export interface RedacGateResult {
  content: string;
  repassed: boolean;
  before: RedacAnalysis;
  after: RedacAnalysis;
  /** Score rédactionnel 0-100 du document final (null si contenu illisible). */
  score: number | null;
  /** Nombre de violations du document final (null si contenu illisible). */
  violations: number | null;
}

interface CarouselCorrectionContext {
  correction: CorrectionOptions;
  inputText?: string;
  /** Matière de recherche (incluse dans inputText) : ses chiffres seuls exigent leur source. */
  researchText?: string;
  brandGuardText?: string;
  echo?: EchoContext;
  /** Brief + réponses + actu (jamais branding ni recherche) : seule source d'un témoignage ou d'un vécu. Absent = non mesuré. */
  testimonySource?: string;
}

// Numéro d'ordre en tête d'un titre de slide (« 1. », « 2) », « Étape 3 ») :
// la relecture ne doit jamais le faire disparaître (audit du 04/10/2026). Le
// garde-fou « lost-number » ne protège que les chiffres de la source, et les
// ordinaux en sont exclus : un « 2. » écrit par la rédaction n'y est pas.
const ORDER_PREFIX = /^\s*(?:[ée]tape\s+(\d{1,2})(?!\d)|(\d{1,2})\s*[.)](?=\s))/i;
const ORDER_PREFIX_FIELDS = new Set(["title", "hook", "accroche", "kicker", "overlay_text"]);
const orderNumber = (text: string) => { const m = ORDER_PREFIX.exec(text || ""); return m ? Number(m[1] ?? m[2]) : null; };

/** Une correction qui retire (ou change) le numéro d'ordre en tête d'un titre
 * est refusée POUR CE CHAMP : il reprend sa version d'avant relecture, le reste
 * de la correction est gardé (« dégrader la correction, pas le texte »).
 * Modifie `candidate` en place ; renvoie les champs restaurés. */
export function protectOrderPrefixes(original: any, candidate: any): string[] {
  const after = new Map(carouselEditorialFields(candidate).map(f => [f.id, f.text]));
  const restored: string[] = [];
  for (const field of carouselEditorialFields(original)) {
    const key = String(field.path[field.path.length - 1]);
    if (!field.path.includes("slides") || field.path.includes("visual_schema") || !ORDER_PREFIX_FIELDS.has(key)) continue;
    const n = orderNumber(field.text);
    if (n === null || orderNumber(after.get(field.id) ?? "") === n) continue;
    let target = candidate;
    for (const step of field.path.slice(0, -1)) target = target?.[step];
    if (!target || typeof target !== "object") continue;
    target[key] = field.text;
    restored.push(field.id);
  }
  return restored;
}

/** Shared by the preliminary polish and the final gate. No extra model call. */
export async function applyGuardedCarouselCorrection(content: string, opts: CarouselCorrectionContext): Promise<string> {
  const source = opts.correction.sourceContext ?? opts.inputText;
  const corrected = await applyCorrectionPassCarousel(content, { ...opts.correction, sourceContext: source });
  if (!corrected || corrected === content) return content;
  try {
    const parse = (s: string) => JSON.parse(s.match(/\{[\s\S]*\}/)?.[0] || "null");
    const originalDoc = parse(content), candidateDoc = parse(corrected);
    if (!originalDoc || !candidateDoc) return content;
    const orderKept = protectOrderPrefixes(originalDoc, candidateDoc);
    if (orderKept.length) {
      opts.correction.logger?.(`[carousel-correction] numéro d'ordre conservé, champ gardé avant relecture ${JSON.stringify(orderKept)}`);
      console.log(JSON.stringify({ event: "carousel_order_prefix_protected", fields: orderKept, semantic: Boolean(opts.correction.semanticReview) }));
      if (candidateDoc.editorial_review && typeof candidateDoc.editorial_review === "object") candidateDoc.editorial_review.order_prefix_kept = orderKept;
    }
    // Legacy nested carousels use the same textual fields as the flat response.
    const original = originalDoc.carousel?.slides ? originalDoc.carousel : originalDoc;
    const candidate = candidateDoc.carousel?.slides ? candidateDoc.carousel : candidateDoc;
    const allowed = source === undefined ? undefined : numbersIn(source);
    const research = allowed ? researchNumbers(numbersIn(baseInputText(opts.inputText, opts.researchText)), opts.researchText, baseInputText(opts.inputText, opts.researchText)) : undefined;
    const before = dropUserSourcedReversals(analyzeCarouselRedac(original, allowed, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
    const after = dropUserSourcedReversals(analyzeCarouselRedac(candidate, allowed, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
    // Compare raw counts, not the capped score: a fifth invented number is
    // still a regression even when the score already caps that penalty at 3.
    const counts = (a: RedacAnalysis) => [a.reversals.length, Number(a.ctaDuplicated), a.moulded.length,
      a.fabricatedNumbers.length, a.durationConflicts.length, a.brandCopyOverlap.length, a.hookEchoes.length,
      a.unsourcedResearchNumbers?.length ?? 0, a.inventedTestimonials?.length ?? 0, a.inventedExperiences?.length ?? 0];
    const beforeCounts = counts(before);
    const COUNT_NAMES = ["reversals", "cta-duplicated", "moulded",
      "fabricated-numbers", "duration-conflicts", "brand-copy", "hook-echoes", "unsourced-research-numbers",
      "invented-testimonials", "invented-experiences"];
    const regressions = counts(after).map((n, i) => n > beforeCounts[i] ? `regression:${COUNT_NAMES[i]}` : "").filter(Boolean);
    // Equal counts can still hide a new unsupported value (5 days → 9 days).
    // Reuse the detector's ordinal exclusions and decimal normalization.
    const unsupportedValue = (finding: string) => finding.split(" ")[0].replace(",", ".");
    const originalUnsupported = new Set(before.fabricatedNumbers.map(unsupportedValue));
    const newUnsupported = after.fabricatedNumbers.map(unsupportedValue).filter(v => !originalUnsupported.has(v));
    const prose = (doc: any) => [
      ...(Array.isArray(doc.slides) ? doc.slides.map(slideTexts) : []),
      typeof doc.caption === "string" ? doc.caption : [doc.caption?.hook, doc.caption?.body, doc.caption?.cta].filter(Boolean).join(" "),
    ].join("\n");
    const originalText = opts.correction.semanticReview ? carouselEditorialFields(originalDoc).map(f => f.text).join("\n") : prose(original);
    const candidateText = opts.correction.semanticReview ? carouselEditorialFields(candidateDoc).map(f => f.text).join("\n") : prose(candidate);
    const candidateNumbers = numbersIn(candidateText);
    // Un chiffre de recherche repris sans source peut légitimement disparaître
    // (passé en formulation qualitative) : ce n'est pas une donnée perdue.
    const unsourced = new Set((before.unsourcedResearchNumbers ?? []).map(unsupportedValue));
    const lostNumbers = allowed ? [...numbersIn(originalText)].filter(n => allowed.has(n) && !candidateNumbers.has(n) && !unsourced.has(n)) : [];
    // Protect sourced quotations; unrelated quotation marks in the brand
    // profile do not force material into the output. This is not a fact checker.
    const quotes = [...originalText.matchAll(/«\s*([^»]+?)\s*»|“([^”]+)”|"([^"\n]{6,})"/g)]
      .map(m => (m[1] || m[2] || m[3]).trim());
    const lostQuote = Boolean(source) && quotes.some(q => source!.includes(q) && !candidateText.includes(q));
    // Named reasons: the rejection used to be silent, so 2/2 real reviews were
    // thrown away (28/09) without any way to tell which check tripped.
    const guard = [...regressions, ...newUnsupported.map(v => `new-unsupported-number:${v}`),
      ...lostNumbers.map(n => `lost-number:${n}`), ...(lostQuote ? ["lost-quote"] : [])];
    if (guard.length) {
      opts.correction.logger?.(`[carousel-correction] original conservé : contrôle dégradé ou donnée source supprimée ${JSON.stringify(guard)}`);
      if (opts.correction.semanticReview) {
        originalDoc.editorial_review = { ...candidateDoc.editorial_review, status: "rejected", edits: 0,
          proposed_edits: candidateDoc.editorial_review?.edits ?? null, guard,
          total_edits: originalDoc.editorial_review?.total_edits || 0, error: "fidelity-guard" };
        return content.replace(content.match(/\{[\s\S]*\}/)![0], () => JSON.stringify(originalDoc));
      }
      return content;
    }
    return orderKept.length ? corrected.replace(corrected.match(/\{[\s\S]*\}/)![0], () => JSON.stringify(candidateDoc)) : corrected;
  } catch {
    return content;
  }
}

/**
 * Gate complet sur le `content` (JSON fenced) d'un carrousel :
 * mesure → si violations, UNE re-passe LLM ciblée → re-mesure → hashtags
 * normalisés → quality_check remplacé par la version calculée.
 * En cas de JSON illisible, renvoie le contenu tel quel (même contrat que les
 * autres gardes de carousel-ai).
 */
export async function runRedacGate(
  content: string,
  opts: {
    isLinkedIn: boolean;
    correction: CorrectionOptions;
    onStatus?: (s: string) => void;
    /** Texte d'entrée (brief, réponses, branding, actu) : liste blanche des chiffres autorisés. */
    inputText?: string;
    /** Matière de recherche (déjà incluse dans inputText) : ses chiffres seuls exigent leur source. */
    researchText?: string;
    /** Forme de chute de caption imposée par le tirage code (caption v2). */
    captionEnding?: CaptionEndingRule;
    /** Champs de marque bruts (buildBrandGuardText) : passages à ne jamais recopier tels quels. */
    brandGuardText?: string;
    /** Contenus DÉJÀ générés sur ce sujet : garde anti-redite d'accroche. */
    echo?: EchoContext;
    /** Brief + réponses + actu (jamais branding ni recherche) : témoignages et vécus au passé mesurés contre elle. Absent = non mesurés. */
    testimonySource?: string;
  },
): Promise<RedacGateResult> {
  const parseFenced = (c: string): { parsed: any; raw: string } | null => {
    const m = c.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return { parsed: JSON.parse(m[0]), raw: m[0] };
    } catch {
      return null;
    }
  };

  const first = parseFenced(content);
  if (!first) return { content, repassed: false, before: emptyAnalysis(), after: emptyAnalysis(), score: null, violations: null };

  const allowedNumbers = opts.inputText !== undefined ? numbersIn(opts.inputText) : undefined;
  const research = allowedNumbers ? researchNumbers(numbersIn(baseInputText(opts.inputText, opts.researchText)), opts.researchText, baseInputText(opts.inputText, opts.researchText)) : undefined;
  const before = dropUserSourcedReversals(analyzeCarouselRedac(first.parsed, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
  let out = content;
  let repassed = false;

  let fixes = buildFixInstructions(before);
  const endingViolatedBefore = captionEndingViolated(first.parsed, opts.captionEnding);
  if (endingViolatedBefore && opts.captionEnding) {
    fixes += (fixes ? "\n\n" : "") +
      `CHUTE DE CAPTION NON CONFORME : la forme imposée pour cette génération est « ${opts.captionEnding.instruction} ». ` +
      (opts.captionEnding.requiresQuestion
        ? `La caption ne contient aucune question : réécris le champ "cta" de la CAPTION en question spécifique au sujet.`
        : `La caption se termine par une question alors que la forme imposée n'en est pas une : réécris le champ "cta" de la CAPTION dans la forme imposée, SANS aucun point d'interrogation. Garde le sens, change la forme.`);
  }
  const review = first.parsed.editorial_review;
  // Second review only to retry a technical failure (invalid/unavailable).
  // - Rejected by the fidelity guard: the draft is untouched, re-asking the
  //   same model about the same text is the same call again (28/09).
  // - Reviewed, with or without edits: no verification pass any more (30/09,
  //   arbitrage Laetitia). It cost ~40 s of the ~190 s text phase; kept edits
  //   are already checked in code by the fidelity guard (numbers, quotes,
  //   regressions). Findings measured by the gate (`fixes`) still trigger
  //   their targeted re-pass below.
  const verifySemanticReview = opts.correction.semanticReview && opts.correction.reviewBaseline &&
    review?.status !== "rejected" && review?.status !== "reviewed";
  if (fixes || verifySemanticReview) {
    try {
      opts.onStatus?.("correcting");
      const corrected = await applyGuardedCarouselCorrection(out, {
        inputText: opts.inputText,
        researchText: opts.researchText,
        brandGuardText: opts.brandGuardText,
        echo: opts.echo,
        testimonySource: opts.testimonySource,
        correction: { ...opts.correction, extraInstructions: fixes },
      });
      if (corrected && corrected !== out) {
        out = corrected;
        // A rejected review only rewrites its own report, never the text.
        repassed = parseFenced(corrected)?.parsed?.editorial_review?.status !== "rejected";
      }
    } catch (e) {
      console.error("[redac-gate] re-passe ciblée échouée, contenu conservé :", e);
    }
  }

  const finalDoc = parseFenced(out) || parseFenced(content);
  if (!finalDoc) return { content: out, repassed, before, after: before, score: redacScore(before), violations: redacViolations(before) };

  // Chiffres de la recherche encore sans source après la re-passe : passe dédiée
  // sur les textes balisés (jamais après le juge final : correction désactivée).
  if (research && opts.correction.enabled !== false) {
    try {
      const doc = finalDoc.parsed;
      const analyzeDoc = (d: any) => dropUserSourcedReversals(analyzeCarouselRedac(d, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
      const current = analyzeDoc(doc);
      if (current.unsourcedResearchNumbers?.length) {
        const sourced = await enforceResearchNumberSources(extractCarouselTexts(doc), (b) => analyzeDoc(reinjectCarouselTexts(doc, b)), research, {
          logger: opts.correction.logger, abortTimeoutMs: opts.correction.abortTimeoutMs, before: current,
          otherCount: (a) => carouselRedacRawCount(a) - (a.unsourcedResearchNumbers?.length ?? 0),
        });
        if (sourced.applied) {
          finalDoc.parsed = reinjectCarouselTexts(doc, sourced.content);
          repassed = true;
        }
      }
    } catch (e) {
      console.error("[redac-gate] passe chiffres de recherche échouée, contenu conservé :", e);
    }
  }

  // Témoignages ou vécus au passé inventés encore là après la relecture : passe
  // dédiée courte sur les textes balisés (même patron que les chiffres de
  // recherche ; jamais quand la correction est désactivée). Gardée seulement si
  // le compte baisse, qu'aucun autre compteur ne monte et qu'aucun chiffre
  // sourcé ne disparaît.
  if (opts.testimonySource !== undefined && opts.correction.enabled !== false) {
    try {
      const doc = finalDoc.parsed;
      const analyzeDoc = (d: any) => dropUserSourcedReversals(analyzeCarouselRedac(d, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
      const current = analyzeDoc(doc);
      if (current.inventedTestimonials?.length || current.inventedExperiences?.length) {
        const block = extractCarouselTexts(doc);
        // Les marqueurs « [SLIDE 3 - BODY] » ne sont pas des chiffres du texte.
        const unmarked = (t: string) => t.replace(/\[[^\]\n]{1,40}\]/g, " ");
        const sourcedNumbers = allowedNumbers ? [...numbersIn(unmarked(block))].filter((n) => allowedNumbers.has(n)) : [];
        const cleaned = await enforceNoInventedTestimonials(block, (b) => analyzeDoc(reinjectCarouselTexts(doc, b)), {
          logger: opts.correction.logger, abortTimeoutMs: opts.correction.abortTimeoutMs, before: current,
          otherCount: (a) => carouselRedacRawCount(a) - (a.inventedTestimonials?.length ?? 0) - (a.inventedExperiences?.length ?? 0),
          reject: (candidate) => {
            const kept = numbersIn(unmarked(candidate));
            const lost = sourcedNumbers.filter((n) => !kept.has(n));
            return lost.length ? `chiffre sourcé perdu ${JSON.stringify(lost)}` : null;
          },
        });
        if (cleaned.applied) {
          finalDoc.parsed = reinjectCarouselTexts(doc, cleaned.content);
          repassed = true;
        }
      }
    } catch (e) {
      console.error("[redac-gate] passe témoignages inventés échouée, contenu conservé :", e);
    }
  }

  // Filet schémas : la re-passe ne voit que les textes — un visual_schema qui
  // porte encore des chiffres sans source est retiré en code (la slide redevient
  // texte au rendu). Vu au re-test v3 : slides propres mais schéma stats
  // « 20 % d'eau / 7-14j / 1000°C+ » entièrement inventé.
  if (allowedNumbers) {
    const slides = Array.isArray(finalDoc.parsed?.slides) ? finalDoc.parsed.slides : [];
    for (const sl of slides) {
      if (!sl?.visual_schema) continue;
      const fab = findFabricatedNumbers(JSON.stringify(sl.visual_schema), allowedNumbers);
      if (fab.length) {
        console.log(`[redac-gate] visual_schema slide ${sl.slide_number} retiré (chiffres sans source : ${fab.map((f) => f.split(" ")[0]).join(", ")})`);
        sl.visual_schema = null;
      }
    }
    // Filet gabarits photo : la re-passe LLM ne réécrit que les textes — elle ne
    // peut pas corriger un big_number ou un point de liste. Un chiffre encore
    // sans source ici est retiré EN CODE ; le rendu dégrade proprement le
    // gabarit (resolvePhotoTemplate) plutôt que d'afficher une stat inventée en 170px.
    for (const sl of slides) {
      if (sl?.big_number && findFabricatedNumbers(String(sl.big_number), allowedNumbers).length) {
        console.log(`[redac-gate] big_number slide ${sl.slide_number} retiré (chiffre sans source : ${sl.big_number})`);
        sl.big_number = null;
        if (sl.template === "chiffre") sl.template = null;
      }
      if (Array.isArray(sl?.points) && sl.points.length) {
        const kept = sl.points.filter((p: any) => !findFabricatedNumbers(String(p), allowedNumbers).length);
        if (kept.length !== sl.points.length) {
          console.log(`[redac-gate] points slide ${sl.slide_number} : ${sl.points.length - kept.length} item(s) retiré(s) (chiffres sans source)`);
          sl.points = kept.length >= 2 ? kept : null;
          if (!sl.points && sl.template === "liste") sl.template = null;
        }
      }
    }
  }

  let after = dropUserSourcedReversals(analyzeCarouselRedac(finalDoc.parsed, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
  // Duplication caption/slide PERSISTANTE malgré la re-passe (vue livrée avec le
  // flag true, audit 12/07 lot D) : suppression déterministe — le CTA vit sur la
  // slide, la caption garde sa chute (dernière ligne du body). Supprimer > inventer.
  if (after.ctaDuplicated && finalDoc.parsed?.caption) {
    console.log("[redac-gate] caption.cta supprimé (duplication de la dernière slide persistante après re-passe)");
    finalDoc.parsed.caption.cta = "";
    after = dropUserSourcedReversals(analyzeCarouselRedac(finalDoc.parsed, allowedNumbers, opts.brandGuardText, opts.echo, research, opts.testimonySource), opts.correction.authoredText);
  }
  normalizeCaptionHashtags(finalDoc.parsed, opts.isLinkedIn);
  finalDoc.parsed.quality_check = buildQualityCheck(after, repassed);

  out = out.includes(finalDoc.raw)
    ? out.replace(finalDoc.raw, JSON.stringify(finalDoc.parsed, null, 2))
    : content.replace(first.raw, JSON.stringify(finalDoc.parsed, null, 2));

  console.log(
    `[redac-gate] retournements ${before.reversals.length}→${after.reversals.length}, slides>50 ${before.overlongSlides.length}→${after.overlongSlides.length}, ctaDup ${before.ctaDuplicated}→${after.ctaDuplicated}, moulés ${before.moulded.length}→${after.moulded.length}, chiffres inventés ${before.fabricatedNumbers.length}→${after.fabricatedNumbers.length}, chiffres de recherche sans source ${before.unsourcedResearchNumbers?.length ?? 0}→${after.unsourcedResearchNumbers?.length ?? 0}, témoignages inventés ${before.inventedTestimonials?.length ?? 0}→${after.inventedTestimonials?.length ?? 0}, vécus inventés ${before.inventedExperiences?.length ?? 0}→${after.inventedExperiences?.length ?? 0}, durées contradictoires ${before.durationConflicts.length}→${after.durationConflicts.length}, recopie fiche marque ${before.brandCopyOverlap.length}→${after.brandCopyOverlap.length}, échos d'accroche ${before.hookEchoes.length}→${after.hookEchoes.length}, hashtags ${before.hashtagsCount}→${Math.min(before.hashtagsCount, opts.isLinkedIn ? 2 : 3)}, re-passe=${repassed}${opts.captionEnding ? `, chute caption ${endingViolatedBefore ? "NON CONFORME" : "ok"}→${captionEndingViolated(finalDoc.parsed, opts.captionEnding) ? "NON CONFORME" : "ok"} (forme ${opts.captionEnding.requiresQuestion ? "question" : "non-question"})` : ""}`,
  );

  return { content: out, repassed, before, after, score: redacScore(after), violations: redacViolations(after) };
}

function emptyAnalysis(): RedacAnalysis {
  return { reversals: [], overlongSlides: [], overlongOverlays: [], ctaDuplicated: false, moulded: [], hashtagsCount: 0, fabricatedNumbers: [], durationConflicts: [], brandCopyOverlap: [], hookEchoes: [] };
}

// ── Variante TEXTE (lot 4) : LinkedIn et newsletter ──
// Mêmes mesures que le gate carrousel, sur un texte brut. Le résultat s'injecte
// en `extraInstructions` dans la passe de correction DÉJÀ existante de
// creative-flow (aucun appel IA supplémentaire).

export interface TextRedacAnalysis {
  reversals: string[];
  moulded: string[];
  fabricatedNumbers: string[];
  /** Chiffres que seule la recherche fournit, repris sans leur source dans la même phrase. */
  unsourcedResearchNumbers?: string[];
  /** Paroles rapportées ou rencontres qu'aucune source ne fournit (« une cliente me disait… »). */
  inventedTestimonials?: string[];
  /** Vécu de l'autrice au passé qu'aucune source ne fournit (« j'ai essayé. Résultat : »). */
  inventedExperiences?: string[];
  /** Passages qui recopient quasi mot pour mot un champ de la fiche de marque. */
  brandCopyOverlap: string[];
  /** Accroches DÉJÀ écrites pour ce sujet que celle-ci redit (cf. findHookEchoes). */
  hookEchoes: string[];
}

/** Accroche d'un texte libre : sa 1re ligne non vide, tronquée à une phrase. */
export function textHook(text: string): string {
  const ligne = (text || "").split(/\n+/).map((l) => l.trim()).find(Boolean) || "";
  const phrase = ligne.split(/(?<=[.!?…])\s/)[0] || ligne;
  return phrase.slice(0, 200);
}

/** `testimonySource` : brief + réponses + actu ; absent = témoignages non mesurés. */
export function analyzeTextRedac(text: string, allowedNumbers?: Set<string>, brandGuardText?: string, echo?: EchoContext, research?: ResearchNumbers, testimonySource?: string): TextRedacAnalysis {
  const reversals = findReversals(text || "");
  const moulded = MOULDED_VERBATIMS.map((re) => (text || "").match(re)?.[0]).filter(Boolean) as string[];
  const fabricatedNumbers = allowedNumbers ? findFabricatedNumbers(text || "", allowedNumbers) : [];
  const unsourcedResearchNumbers = findUnsourcedResearchNumbers(text || "", research);
  const brandCopyOverlap = findBrandCopyOverlap(text || "", brandGuardText);
  const hookEchoes = findHookEchoes(textHook(text), echo?.previousHooks, echo?.subject);
  const inventedTestimonials = findInventedTestimonials(text || "", testimonySource);
  const inventedExperiences = findInventedExperiences(text || "", testimonySource);
  return { reversals, moulded, fabricatedNumbers, unsourcedResearchNumbers, inventedTestimonials, inventedExperiences, brandCopyOverlap, hookEchoes };
}

/**
 * Retire des retournements ceux que l'utilisatrice a ÉCRITS elle-même (brief,
 * réponses, message clé) : « Un savon ça se choisit comme une crème, pas comme
 * un produit ménager » fourni en message clé n'est pas un tic du modèle.
 */
export function dropUserSourcedReversals<T extends { reversals: string[] }>(a: T, userSourceText: string | undefined): T {
  if (!userSourceText || !a.reversals.length) return a;
  const src = normalizeWordsForOverlap(userSourceText).join(" ");
  if (!src) return a;
  const kept = a.reversals.filter((r) => {
    const words = normalizeWordsForOverlap(r);
    // Exige tout le passage détecté : partager quelques mots ne suffit pas.
    const probe = words.length >= 3 ? words.join(" ") : "";
    return !(probe && src.includes(probe));
  });
  return kept.length === a.reversals.length ? a : { ...a, reversals: kept };
}

/** Nombre de violations — même formule que redacViolations, pour la variante texte. */
export function textRedacViolations(a: TextRedacAnalysis): number {
  return (
    a.reversals.length +
    a.moulded.length +
    Math.min(3, a.fabricatedNumbers.length) +
    Math.min(3, a.unsourcedResearchNumbers?.length ?? 0) +
    Math.min(3, a.inventedTestimonials?.length ?? 0) +
    Math.min(3, a.inventedExperiences?.length ?? 0) +
    Math.min(3, a.brandCopyOverlap.length) +
    Math.min(1, a.hookEchoes.length)
  );
}

/**
 * Élisions françaises manquantes — correction DÉTERMINISTE, classe non ambiguë
 * uniquement : « le avant/après » → « l'avant/après », « de avant » → « d'avant »,
 * « que après » → « qu'après » (vu au re-test du 21/07 : post LinkedIn « On
 * montre le avant/après qui brille »). Volontairement étroit : pas de règle
 * générale déterminant+voyelle (« le onze », « la ouate » sont légitimes), et
 * « qu'on + nom » (→ « qu'un ») reste à la passe de correction probabiliste —
 * indécidable sans lexique (« qu'on rénove » est correct).
 */
export function fixFrenchElisions(text: string): string {
  if (!text) return text;
  return text
    .replace(/\b([Ll])e (?=(?:avant|après)\b)/g, (_m, l) => `${l}'`)
    .replace(/\b([Dd])e (?=(?:avant|après)\b)/g, (_m, d) => `${d}'`)
    .replace(/\b([Qq])ue (?=(?:avant|après)\b)/g, (_m, q) => `${q}u'`)
    // Variantes tout-en-majuscules (overlays de reels, covers)
    .replace(/\bLE (?=(?:AVANT|APRÈS)\b)/g, "L'")
    .replace(/\bDE (?=(?:AVANT|APRÈS)\b)/g, "D'")
    .replace(/\bQUE (?=(?:AVANT|APRÈS)\b)/g, "QU'");
}

/** Applique fixFrenchElisions à une liste de champs texte d'un objet (mutation en place). */
export function fixElisionsInFields(obj: Record<string, unknown> | null | undefined, fields: string[]): void {
  if (!obj || typeof obj !== "object") return;
  for (const f of fields) {
    if (typeof obj[f] === "string") obj[f] = fixFrenchElisions(obj[f] as string);
  }
}

// ── Mesure seule (audit slop 18/08/2026, lot 5) ──
// 6 familles de tics mesurées dans le corpus mais AUCUNE encore détectée en
// code. Compteurs PURS (aucun effet de bord, aucune re-passe déclenchée) :
// branchés en télémétrie (`content-quality.ts`) pour calibrer des seuils sur
// des vraies données avant d'activer quoi que ce soit. Un mot comme
// « authentique » est parfois juste — on mesure une FRÉQUENCE, pas une
// interdiction.

/** Corps mesurable d'une slide pour les familles inter-slides (mêmes champs que slideTexts). */
function slideTextForSlop(s: any): string {
  return slideTexts(s);
}

/**
 * Rafales de 3+ slides CONSÉCUTIVES courtes (≤ maxWords mots chacune) — le
 * rythme ternaire/staccato qui ne se voit qu'en enchaînant les slides, jamais
 * à l'intérieur d'un seul champ (angle mort de `analyzeCarouselRedac`).
 */
export function countStaccatoAcrossSlides(slides: any[], maxWords = 6): number {
  let bursts = 0;
  let run = 0;
  for (const s of slides || []) {
    const words = wordCount(slideTextForSlop(s));
    if (words > 0 && words <= maxWords) {
      run++;
      if (run === 3) bursts++;
    } else {
      run = 0;
    }
  }
  return bursts;
}

/**
 * Rafales de 3+ slides CONSÉCUTIVES qui démarrent par le même mot — anaphore
 * vue seulement en enchaînant les slides (même angle mort que le staccato).
 */
export function countAnaphoraAcrossSlides(slides: any[]): number {
  const firstWords = (slides || []).map((s) => {
    const m = slideTextForSlop(s).trim().match(/^\p{L}+/u);
    return m ? m[0].toLowerCase() : "";
  });
  let bursts = 0;
  let run = 1;
  for (let i = 1; i <= firstWords.length; i++) {
    if (i < firstWords.length && firstWords[i] && firstWords[i] === firstWords[i - 1]) {
      run++;
    } else {
      if (run >= 3) bursts++;
      run = 1;
    }
  }
  return bursts;
}

// « Résultat : » / « Conclusion : » EN DÉBUT DE PHRASE uniquement — l'usage
// courant du nom commun (« Le résultat de l'enquête… ») n'est pas un tic.
const RESULT_CONCLUSION_OPENER_RE = /(?:^|[.!?]\s+|\n)(?:Résultat|Conclusion)\s*[:.]/gi;

/** Occurrences de « Résultat : » / « Conclusion : » en ouverture de phrase. */
export function countResultConclusionOpeners(text: string): string[] {
  return [...(text || "").matchAll(RESULT_CONCLUSION_OPENER_RE)].map((m) => m[0].trim());
}

/** La 1re phrase du texte se termine-t-elle par « ? » (question rhétorique d'ouverture) ? */
export function isOpeningRhetoricalQuestion(text: string): boolean {
  const first = (text || "").trim().split(/(?<=[.!?])\s+/)[0] || "";
  return /\?\s*$/.test(first.trim());
}

// Adjectifs vides candidats (audit 18/08) : SEUIL à calibrer, pas une liste
// noire — « authentique »/« aligné »/« puissant » sont parfois le mot juste.
// \b évite les faux positifs sur les mots composés/apparentés
// (« désaligné », « impuissant », « alignement » ne matchent PAS).
// \b est ASCII-only en JS/Deno : « é » n'est pas un \w, donc \b après
// « aligné » échoue silencieusement (transition non-mot → non-mot). On
// utilise des frontières Unicode explicites (lookaround sur \p{L}) à la place.
const EMPTY_ADJECTIVES: Record<string, RegExp> = {
  authentique: /(?<![\p{L}])authentiques?(?![\p{L}])/giu,
  aligné: /(?<![\p{L}])aligné(?:e|es|s)?(?![\p{L}])/giu,
  puissant: /(?<![\p{L}])puissante?s?(?![\p{L}])/giu,
};

/** Occurrences par adjectif vide candidat (fréquence brute, pas de blocage). */
export function countEmptyAdjectives(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, re] of Object.entries(EMPTY_ADJECTIVES)) {
    out[name] = ((text || "").match(re) || []).length;
  }
  return out;
}

/**
 * Similarité lexicale entre l'ouverture (hook) et la chute d'un même contenu
 * — la même mesure que `tokenSimilarity` (déjà appliquée au CTA↔dernière
 * slide), ici sur hook↔chute, jamais comparés jusqu'ici.
 */
export function hookEndingSimilarity(hookText: string, endingText: string): number {
  return tokenSimilarity(hookText, endingText);
}

export interface SlopSignals {
  staccato_inter_slides: number;
  anaphora_inter_slides: number;
  result_conclusion_openers: number;
  opening_rhetorical_question: boolean;
  empty_adjectives: Record<string, number>;
  hook_ending_similarity: number;
}

/** Agrège les 6 familles en un objet consultable (télémétrie, aucun calcul de score). */
export function measureSlopSignals(params: {
  fullText: string;
  hookText?: string;
  endingText?: string;
  slides?: any[];
}): SlopSignals {
  const { fullText, hookText = "", endingText = "", slides } = params;
  return {
    staccato_inter_slides: slides ? countStaccatoAcrossSlides(slides) : 0,
    anaphora_inter_slides: slides ? countAnaphoraAcrossSlides(slides) : 0,
    result_conclusion_openers: countResultConclusionOpeners(fullText).length,
    opening_rhetorical_question: isOpeningRhetoricalQuestion(hookText || fullText),
    empty_adjectives: countEmptyAdjectives(fullText),
    hook_ending_similarity: hookText && endingText ? hookEndingSimilarity(hookText, endingText) : 0,
  };
}

/** Instructions ciblées pour la passe de correction texte ("" si rien à corriger). */
export function buildTextFixInstructions(a: TextRedacAnalysis): string {
  const lines: string[] = [];
  if (a.reversals.length > 0) {
    lines.push(
      `RETOURNEMENTS PAR NÉGATION : ${a.reversals.length} détectés, aucun effet ajouté n’est autorisé. Réécris chaque passage signalé en affirmation directe, en préservant les négations factuelles et verbatims fournis à garder. Une concession suivie de « Sauf que… » (« C'est logique, sur le papier. Sauf que ce n'est pas comme ça que ça marche ») disparaît : pose directement le mécanisme réel, sans concession ni « sauf que ». Une antithèse en deux phrases miroir (« On croit en faire plus. On en fait souvent moins. ») devient une seule phrase qui dit le mécanisme (« Publier trop vite coupe l'élan du post précédent. ») :\n${a.reversals.map((r) => `- « ${r} »`).join("\n")}`,
    );
  }
  for (const m of a.moulded) {
    lines.push(`FORMULE MOULÉE : « ${m} » est une signature IA récurrente. Réécris-la autrement (ou supprime-la).`);
  }
  if (a.fabricatedNumbers.length) {
    lines.push(
      `CHIFFRES SANS SOURCE : ces chiffres ne viennent ni du brief, ni des réponses de l'utilisatrice, ni de son branding, ni de l'actu fournie :\n${a.fabricatedNumbers.map((n) => `- ${n}`).join("\n")}\nRemplace CHACUN par une formulation qualitative honnête (« une bonne partie », « plusieurs heures », « bien plus cher »). N'invente JAMAIS de statistique, de prix, de durée ou de proportion.`,
    );
  }
  if (a.unsourcedResearchNumbers?.length) lines.push(UNSOURCED_RESEARCH_FIX(a.unsourcedResearchNumbers));
  if (a.inventedTestimonials?.length) lines.push(INVENTED_TESTIMONY_FIX(a.inventedTestimonials));
  if (a.inventedExperiences?.length) lines.push(INVENTED_EXPERIENCE_FIX(a.inventedExperiences));
  if (a.brandCopyOverlap.length) {
    lines.push(
      `PASSAGES RECOPIÉS DE LA FICHE DE MARQUE : ces extraits reprennent quasi mot pour mot un champ de la fiche de marque de l'utilisatrice (combat, mission, ton, expressions, convictions) :\n${a.brandCopyOverlap.map((o) => `- « ${o} »`).join("\n")}\nCette fiche est la MATIÈRE de l'utilisatrice, jamais son texte final. Reformule CHAQUE extrait avec des mots neufs, garde le sens et l'intensité, mais ne recopie plus la fiche de marque telle quelle.`,
    );
  }
  if (a.hookEchoes.length) {
    lines.push(
      `ACCROCHE DÉJÀ UTILISÉE POUR CE SUJET : cette ouverture redit une accroche déjà écrite pour le même sujet :\n${a.hookEchoes.map((h) => `- « ${h} »`).join("\n")}\nL'audience voit la SÉRIE, pas un contenu isolé : deux publications qui ouvrent pareil donnent l'impression d'un contenu recyclé à la chaîne. Réécris l'accroche avec un angle d'attaque VRAIMENT différent — change ce sur quoi elle ouvre (une scène vécue plutôt qu'un constat, une question plutôt qu'une affirmation, un détail concret plutôt qu'une généralité). Garde le sujet et le fond du contenu, change l'entrée.`,
    );
  }
  return lines.join("\n\n");
}

// ── Gate texte complet : mesure → correction → RE-mesure → garde anti-régression ──
// Diagnostic 18/08 (recyclage, échantillon live) : la passe de correction Haiku
// peut INTRODUIRE les tics qu'elle chasse (contenus conformes avant correction,
// 2-3 retournements après). Tous les appelants texte gardaient la version
// corrigée les yeux fermés — la mesure `after` ne servait qu'à la télémétrie.
// Ce helper est le pendant texte de runRedacGate (carrousels) : il ne rend la
// version corrigée QUE si elle ne dégrade aucun compteur mesuré, et rejoue UNE
// re-passe ciblée quand des violations subsistent (même politique « une seule
// re-passe » que le gate carrousel).

/** Somme brute des 4 familles mesurées — le comparateur de la garde anti-régression.
 * Compte sans plafonner les catégories : une correction qui ajoute un défaut
 * ne doit pas profiter du plafond de pénalité d’une autre catégorie. */
export function textRedacRawCount(a: TextRedacAnalysis): number {
  return a.reversals.length + a.moulded.length + a.fabricatedNumbers.length + a.brandCopyOverlap.length +
    a.hookEchoes.length + (a.unsourcedResearchNumbers?.length ?? 0) + (a.inventedTestimonials?.length ?? 0) +
    (a.inventedExperiences?.length ?? 0);
}

export interface TextGateResult {
  content: string;
  before: TextRedacAnalysis;
  after: TextRedacAnalysis;
  /** Au moins une version corrigée a été conservée. */
  repassed: boolean;
  /** Une correction a été rejetée car mesurablement pire que la meilleure version connue. */
  reverted: boolean;
  score: number;
  violations: number;
}

export async function runTextRedacGate(
  text: string,
  opts: {
    format: CorrectionFormat;
    correction: CorrectionOptions;
    /** Liste blanche des chiffres autorisés (numbersIn du brief/réponses/branding/actu). */
    allowedNumbers?: Set<string>;
    /** Chiffres que seule la recherche fournit (researchNumbers) : autorisés avec leur source. */
    research?: ResearchNumbers;
    brandGuardText?: string;
    /** Passes LLM max (défaut 2 : 1 relecture générale + 1 rattrapage si violations restantes). */
    maxPasses?: number;
    /** Contenus DÉJÀ générés sur ce sujet : garde anti-redite d'accroche. */
    echo?: EchoContext;
    /** Brief + réponses + actu : un témoignage absent de ces sources est inventé (non mesuré si absent). */
    testimonySource?: string;
  },
): Promise<TextGateResult> {
  const analyze = (t: string) => dropUserSourcedReversals(
    analyzeTextRedac(t, opts.allowedNumbers, opts.brandGuardText, opts.echo, opts.research, opts.testimonySource), opts.correction.authoredText,
  );
  const before = analyze(text);
  let best = text;
  let bestA = before;
  let current = text;
  let currentA = before;
  let repassed = false;
  let reverted = false;
  const maxPasses = opts.maxPasses ?? 2;

  for (let pass = 1; pass <= maxPasses; pass++) {
    // La 1re passe tourne toujours (relecture générale + instructions ciblées
    // si mesures) ; les suivantes seulement s'il reste des violations au sens
    // du score officiel (chaque effet ajouté compte).
    if (pass > 1 && textRedacViolations(bestA) === 0) break;
    const corrected = await applyCorrectionPass(current, opts.format, {
      ...opts.correction,
      extraInstructions: [opts.correction.extraInstructions, buildTextFixInstructions(currentA)].filter(Boolean).join("\n\n") || undefined,
    });
    if (!corrected || corrected === current) break;
    const a = analyze(corrected);
    if (textRedacRawCount(a) <= textRedacRawCount(bestA)) {
      // Égalité incluse : la correction porte aussi des améliorations que la
      // mesure ne voit pas (broetry, anaphores…), on garde la plus récente.
      best = corrected;
      bestA = a;
      current = corrected;
      currentA = a;
      repassed = true;
    } else {
      // La correction dérive (elle a introduit plus de tics qu'elle n'en a
      // retiré) : on s'arrête sur la meilleure version connue.
      reverted = true;
      break;
    }
  }

  if (bestA.unsourcedResearchNumbers?.length) {
    const sourced = await enforceResearchNumberSources(best, analyze, opts.research, {
      logger: opts.correction.logger, abortTimeoutMs: opts.correction.abortTimeoutMs, before: bestA,
    });
    if (sourced.applied) {
      best = sourced.content;
      bestA = sourced.analysis;
      repassed = true;
    }
  }

  if (bestA.inventedTestimonials?.length || bestA.inventedExperiences?.length) {
    const cleaned = await enforceNoInventedTestimonials(best, analyze, {
      logger: opts.correction.logger, abortTimeoutMs: opts.correction.abortTimeoutMs, before: bestA,
    });
    if (cleaned.applied) {
      best = cleaned.content;
      bestA = cleaned.analysis;
      repassed = true;
    }
  }

  const violations = textRedacViolations(bestA);
  const score = Math.max(40, 100 - 10 * violations);
  opts.correction.logger?.(
    `[text-gate:${opts.format}] retournements ${before.reversals.length}→${bestA.reversals.length}, moulés ${before.moulded.length}→${bestA.moulded.length}, chiffres inventés ${before.fabricatedNumbers.length}→${bestA.fabricatedNumbers.length}, chiffres de recherche sans source ${before.unsourcedResearchNumbers?.length ?? 0}→${bestA.unsourcedResearchNumbers?.length ?? 0}, témoignages inventés ${before.inventedTestimonials?.length ?? 0}→${bestA.inventedTestimonials?.length ?? 0}, vécus inventés ${before.inventedExperiences?.length ?? 0}→${bestA.inventedExperiences?.length ?? 0}, recopie marque ${before.brandCopyOverlap.length}→${bestA.brandCopyOverlap.length}, échos d'accroche ${before.hookEchoes.length}→${bestA.hookEchoes.length}, repassé=${repassed}, rejeté=${reverted}`,
  );
  return { content: best, before, after: bestA, repassed, reverted, score, violations };
}
