// Règles juridiques ajoutées par l'IA (décision de Laetitia, 13/11/2026 :
// « Source obligatoire pour les dates, pas de règle juridique ajoutée : oui »).
// Vu en QA le 12/11 (post LinkedIn d'une marchande de biens qui cherchait des
// apporteurs d'affaires) : « la mise en relation… relève de l'entremise
// immobilière au sens de la loi Hoguet… la jurisprudence est constante sur ce
// point depuis 2012 ». Elle n'avait parlé d'aucune loi. Pour tous les formats et
// tous les métiers : une loi, un article de code, une jurisprudence, une
// obligation ou une interdiction légale que le brief, les réponses ou l'actu
// n'évoquent pas est retirée par une passe courte, relue par le code.

import { applyLegalRuleRemovalPass } from "../correction-pass/factual-passes.ts";
import { sentencesOf } from "./text-utils.ts";

/** Une règle de droit affirmée : loi nommée, article, code, jurisprudence, obligation ou interdiction légale. */
const LEGAL_RULE_MARKERS: RegExp[] = [
  // « loi Hoguet », « loi n° 70-9 », « loi du 2 janvier 1970 », « loi de 2019 »
  /(?<!\p{L})lois?\s+(?:n°|du\s+\d|de\s+(?:19|20)\d{2}|\p{Lu}\p{L}+)/u,
  /(?<!\p{L})au\s+sens\s+(?:de\s+la\s+loi|du\s+code|de\s+l['’]article)/iu,
  // « la loi impose », « la réglementation interdit », « le RGPD oblige »
  /(?<!\p{L})(?:lois?|r[éè]glementations?|l[ée]gislations?|RGPD)\s+(?:[\p{L}'’-]+\s+){0,3}(?:impos|oblig|interdi|exig|pr[ée]voi|puni|sanctionn|r[ée]serv|encadr)\p{L}*/iu,
  /(?<!\p{L})(?:selon|d['’]apr[eè]s|par|devant|aux\s+yeux\s+de)\s+la\s+loi(?!\p{L})/iu,
  /(?<!\p{L})(?:l[ée]galement|juridiquement|ill[ée]gale?s?|ill[ée]galement|illicites?)(?!\p{L})/iu,
  /(?<!\p{L})obligations?\s+l[ée]gales?(?!\p{L})/iu,
  /(?<!\p{L})(?:jurisprudences?|cour\s+de\s+cassation|conseil\s+d['’][ée]tat|cour\s+d['’]appel)(?!\p{L})/iu,
  /(?<!\p{L})articles?\s+[LRD]\.?\s?\d|(?<!\p{L})articles?\s+\d+[\w-]*\s+du\s+code(?!\p{L})/iu,
  /(?<!\p{L})code\s+(?:civil|p[ée]nal|du\s+travail|de\s+commerce|du\s+commerce|de\s+la\s+consommation|de\s+l['’]urbanisme|de\s+la\s+construction|g[ée]n[ée]ral\s+des\s+imp[ôo]ts|de\s+la\s+sant[ée]|mon[ée]taire)(?!\p{L})/iu,
  /(?<!\p{L})(?:d[ée]crets?|arr[êe]t[ée]\s+(?:du\s+\d|n°|minist[ée]riel|pr[ée]fectoral)|directive\s+(?:europ[ée]enne|\(?UE|\d))(?!\p{L})/iu,
  /(?<!\p{L})(?:passible\s+d['’]|peines?\s+de\s+prison|amendes?\s+(?:de\s+\d|pouvant|jusqu))/iu,
];

/**
 * Le sujet juridique est évoqué par l'utilisatrice (brief, réponses, actu) :
 * elle en parle elle-même, la rédaction peut l'expliquer. Volontairement large
 * (« droit du travail », « contrat », « bail ») pour ne pas brider un contenu
 * dont le droit est le sujet.
 */
const LEGAL_TOPIC_IN_SOURCE = /(?<!\p{L})(?:lois?|l[ée]gal\p{L}*|ill[ée]gal\p{L}*|juridi\p{L}*|r[ée]glement\p{L}*|l[ée]gisla\p{L}*|jurisprudence\p{L}*|d[ée]crets?|RGPD|code\s+(?:civil|p[ée]nal|du|de\s+la|de\s+l['’]|de\s+commerce|g[ée]n[ée]ral)|droits?\s+(?:du|de\s+la|de\s+l['’]|des|immobilier|social|fiscal|de\s+r[ée]tractation|d['’]auteur)|contrats?|bail|baux|statuts|CGV|mentions\s+l[ée]gales|avocat\p{L}*|juriste\p{L}*|tribunal|tribunaux|obligatoire\p{L}*|interdi\p{L}*|conformit[ée]|norme\p{L}*)(?!\p{L})/iu;

// « loi de Pareto », « loi de l'attraction » : des lois au sens courant, pas du droit.
const NON_LEGAL_LAWS = /(?<!\p{L})lois?\s+(?:de\s+|d['’]|du\s+|des\s+)?(?:l['’]|la\s+|le\s+)?(?:Pareto|Murphy|Parkinson|Brandolini|Moore|Zipf|Goodhart|Metcalfe|Hofstadter|Laffont|Laffer|attraction|offre|demande|nature|gravit\p{L}*|s[ée]ries|moyennes|jungle|silence|plus\s+fort|march[ée]|nombres?|physique)(?!\p{L})/giu;

function legalPassages(text: string): string[] {
  const out: string[] = [];
  for (const sentence of sentencesOf(text || "")) {
    const s = sentence.replace(/\s+/g, " ").trim();
    const probe = s.replace(NON_LEGAL_LAWS, " ");
    if (s && LEGAL_RULE_MARKERS.some((re) => re.test(probe))) out.push(s.length > 220 ? s.slice(0, 217) + "…" : s);
  }
  return out;
}

/**
 * Phrases qui posent une règle de droit alors que l'utilisatrice n'a évoqué
 * aucun sujet juridique. `sourceText` absent = pas de mesure (l'appelant ne
 * sait pas ce qu'elle a fourni). La recherche web ne compte PAS comme source :
 * c'est elle qui apporte ces règles.
 */
export function findAddedLegalRules(text: string, sourceText?: string): string[] {
  if (sourceText === undefined) return [];
  if (LEGAL_TOPIC_IN_SOURCE.test(sourceText) || legalPassages(sourceText).length) return [];
  return legalPassages(text);
}

/**
 * Passe courte qui retire les règles juridiques ajoutées. Gardée seulement si
 * le code en compte moins après et que `otherCount` (somme des autres
 * compteurs de l'appelant) ne monte pas, ni le `reject` propre à l'appelant.
 */
export async function enforceNoAddedLegalRules<A>(
  text: string,
  sourceText: string | undefined,
  opts: {
    analyze?: (t: string) => A;
    otherCount?: (a: A) => number;
    reject?: (candidate: string) => string | null;
    /** Texte audité si différent du texte corrigé (marqueurs, champs). */
    audited?: (t: string) => string;
    logger?: (msg: string) => void;
    abortTimeoutMs?: number;
  } = {},
): Promise<{ content: string; applied: boolean; found: string[] }> {
  const audited = opts.audited ?? ((t: string) => t);
  const items = findAddedLegalRules(audited(text), sourceText);
  if (!items.length) return { content: text, applied: false, found: [] };
  const candidate = await applyLegalRuleRemovalPass(text, { items, logger: opts.logger, abortTimeoutMs: opts.abortTimeoutMs });
  if (!candidate || candidate === text) return { content: text, applied: false, found: items };
  const after = findAddedLegalRules(audited(candidate), sourceText);
  const othersBefore = opts.analyze && opts.otherCount ? opts.otherCount(opts.analyze(text)) : 0;
  const othersAfter = opts.analyze && opts.otherCount ? opts.otherCount(opts.analyze(candidate)) : 0;
  const rejected = opts.reject?.(candidate) ?? null;
  const kept = after.length < items.length && othersAfter <= othersBefore && !rejected;
  opts.logger?.(`[legal-removal] règles juridiques ajoutées ${items.length}→${after.length}, autres ${othersBefore}→${othersAfter}${rejected ? `, refus ${rejected}` : ""}, gardé=${kept}`);
  return kept ? { content: candidate, applied: true, found: items } : { content: text, applied: false, found: items };
}
