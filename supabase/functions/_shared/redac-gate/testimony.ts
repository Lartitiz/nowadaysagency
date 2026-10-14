// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 3, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Témoignages et vécus inventés : mesure, et passe courte qui les retire.

import { applyTestimonyRemovalPass } from "../correction-pass.ts";
import { sentencesOf } from "./text-utils.ts";
import { textRedacRawCount, type TextRedacAnalysis } from "./scoring.ts";

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
const EXPERIENCE_PARTICIPLES = String.raw`(?:essayée?s?|testée?s?|tentée?s?|fait(?!\s+(?:le\s+|ce\s+)?(?:choix|pari))|refait|publiée?s?|postée?s?|doublée?|triplée?|multipliée?|augmentée?|arrêtée?|commencée?|recommencée?|lancée?s?|perdue?s?|gagnée?s?|passée?s?|vue?s?|remarquée?|constatée?|observée?|appris|compris|découverte?|cru|suivie?s?|appliquée?s?|changée?|mesurée?|vécue?|connue?|misée?|mise?\s+(?:\p{L}+\s+){0,3}?(?:à|pour)|finie?s?|terminée?s?|créée?s?|fabriquée?s?|vendue?s?|livrée?s?|sortie?s?|ouverte?s?|fermée?s?|réalisée?s?|montée?s?|quittée?s?|abandonnée?s?|reçue?s?)`;
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

export const INVENTED_EXPERIENCE_FIX = (items: string[]) =>
  `VÉCU PERSONNEL INVENTÉ : ces passages racontent une expérience de l'autrice au passé (« j'ai essayé », « je pensais », « résultat : »), alors que ni le brief, ni les réponses, ni l'actu ne la fournissent :\n${items.map((t) => `- « ${t} »`).join("\n")}\nRéécris CHAQUE passage en opinion au présent (« Je pense que… », « Pour moi… ») ou en constat général (« c'est courant », « souvent, la portée baisse même »). Garde l'idée et la position ; aucun test, essai, résultat ou croyance passée de l'autrice.`;

export const INVENTED_TESTIMONY_FIX = (items: string[]) =>
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

