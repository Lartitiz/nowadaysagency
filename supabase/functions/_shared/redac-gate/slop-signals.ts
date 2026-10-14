// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 2, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Corrections fixes (élisions) et mesures « slop » de télémétrie : compteurs
// purs, aucun blocage ni re-passe.

import { wordCount, tokenSimilarity } from "./text-utils.ts";
import { slideTexts } from "./carousel-analysis.ts";

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

// ── Style haché (retour de Laetitia du 05/10/2026 sur des stories réelles :
// « 7 500 € ou 2 100 €. Même prestation. ») : fragments courts SANS verbe
// conjugué, enchaînés dans un même texte. Mesure seulement (journal
// stories-gate et slop_signals) : aucun blocage, aucune passe déclenchée.
// Heuristique volontairement simple : une phrase de 10 mots au plus, qui
// n'est pas une question, sans pronom sujet ni verbe courant conjugué.
// Chaque ligne (story, slide, section) est lue à part : un petit titre ou
// une ligne de sticker n'est jamais enchaîné au texte qui suit.
const CHOPPY_MAX_WORDS = 10;
const SUBJECT_RE = /(?<![\p{L}])(?:(?:je|tu|il|elle|on|nous|vous|ils|elles|ça|ce sont|y a)(?![\p{L}])|(?:j|c|ç|qu)['’])/iu;
const COMMON_VERB_RE = /(?<![\p{L}])(?:est|sont|suis|es|était|étaient|étais|sera|serait|seront|ai|as|a|avons|avez|ont|avait|avais|aura|fait|font|fais|faisait|va|vais|vas|vont|allait|peut|peux|peuvent|pouvait|faut|fallait|veut|veux|voulait|doit|dois|doivent|devait|sait|sais|savait|dit|dis|disait|voit|vois|voyait|vient|viens|viennent|reste|restent|coûte|coûtent|change|changent|marche|marchent|compte|comptent|choisis|choisit|utilise|utilisent|travaille|travaillent|pense|pensent|crois|croit|aime|aiment|parle|parlent|trouve|trouvent|donne|donnent|prend|prends|prennent|met|mets|mettent|passe|passent|arrive|arrivent|semble|semblent|ressemble|ressemblent|devient|deviennent|existe|existent|manque|manquent|suffit|vaut|valent|permet|permettent)(?![\p{L}])/iu;

function isChoppyFragment(sentence: string): boolean {
  const s = sentence.trim();
  if (!s || /\?\s*$/.test(s)) return false;
  const words = s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0 || words.length > CHOPPY_MAX_WORDS) return false;
  return !SUBJECT_RE.test(s) && !COMMON_VERB_RE.test(s);
}

/**
 * Rafales de 2+ fragments sans verbe CONSÉCUTIFS dans une même ligne
 * (« 7 500 € ou 2 100 €. Même prestation. »). Renvoie chaque rafale telle
 * qu'écrite, et `fragments` = nombre total de fragments (isolés compris).
 */
export function findChoppyFragments(text: string): { runs: string[]; fragments: number } {
  const runs: string[] = [];
  let fragments = 0;
  for (const line of (text || "").split(/\n+/)) {
    const sentences = line.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
    let run: string[] = [];
    const flush = () => {
      if (run.length >= 2) runs.push(run.join(" "));
      run = [];
    };
    for (const sentence of sentences) {
      if (isChoppyFragment(sentence)) {
        fragments++;
        run.push(sentence);
      } else {
        flush();
      }
    }
    flush();
  }
  return { runs, fragments };
}

/** Nombre de rafales de fragments sans verbe enchaînés (mesure du style haché). */
export function countChoppyFragments(text: string): number {
  return findChoppyFragments(text).runs.length;
}

export interface SlopSignals {
  staccato_inter_slides: number;
  anaphora_inter_slides: number;
  result_conclusion_openers: number;
  opening_rhetorical_question: boolean;
  empty_adjectives: Record<string, number>;
  hook_ending_similarity: number;
  /** Rafales de fragments sans verbe enchaînés dans une même ligne (style haché). */
  choppy_fragment_runs: number;
  /** Fragments courts sans verbe, isolés compris. */
  choppy_fragments: number;
}

/** Agrège les 6 familles en un objet consultable (télémétrie, aucun calcul de score). */
export function measureSlopSignals(params: {
  fullText: string;
  hookText?: string;
  endingText?: string;
  slides?: any[];
}): SlopSignals {
  const { fullText, hookText = "", endingText = "", slides } = params;
  const choppy = findChoppyFragments(fullText);
  return {
    staccato_inter_slides: slides ? countStaccatoAcrossSlides(slides) : 0,
    anaphora_inter_slides: slides ? countAnaphoraAcrossSlides(slides) : 0,
    result_conclusion_openers: countResultConclusionOpeners(fullText).length,
    opening_rhetorical_question: isOpeningRhetoricalQuestion(hookText || fullText),
    empty_adjectives: countEmptyAdjectives(fullText),
    hook_ending_similarity: hookText && endingText ? hookEndingSimilarity(hookText, endingText) : 0,
    choppy_fragment_runs: choppy.runs.length,
    choppy_fragments: choppy.fragments,
  };
}
