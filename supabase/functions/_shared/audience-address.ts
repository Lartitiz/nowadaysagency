// Tu ou vous : comment la marque s'adresse à son public (décision de Laetitia,
// 04/10/2026). Le réglage vit dans brand_profile.tone_register (fiche de marque,
// « Je m'adresse à mon public en : tu / vous / pas de préférence »).
//
// Ce module porte les trois morceaux du contrat :
//   1. lire le réglage (valeurs historiques en texte libre comprises) ;
//   2. la RÈGLE FERME injectée en tête des prompts de rédaction ;
//   3. le contrôle par le code APRÈS rédaction : compter les adresses au
//      lecteur dans la mauvaise forme, puis une passe de correction courte et
//      ciblée, gardée seulement si le compte baisse sans perdre de chiffre.
// Sans réglage (vide, « pas de préférence », valeur ambiguë) : rien ne change.

// Module PUR (aucun import) : user-context.ts le lit pour la règle ferme.
// L'appel IA de la passe vit dans audience-address-pass.ts.

export type AudienceAddress = "tu" | "vous";


const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lit le réglage. Accepte « tutoiement »/« vouvoiement » (écrits par l'écran et
 * l'analyse de marque) et le texte libre historique (« tu », « Vouvoiement,
 * ton chaleureux », « je vouvoie »). Une valeur qui cite les deux formes
 * (« tu/vous ») ou aucune (« familier ») ne fixe rien.
 */
export function parseAudienceAddress(raw: unknown): AudienceAddress | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = fold(raw);
  const vous = /vouvoi|vouvoy|(^|[^a-z])vous([^a-z]|$)/.test(s);
  const tu = /tutoi|tutoy|(^|[^a-z])tu([^a-z]|$)/.test(s);
  if (vous === tu) return null;
  return vous ? "vous" : "tu";
}

/** Règle ferme placée en tête de la rédaction. Chaîne vide sans réglage. */
export function audienceAddressRule(addr: AudienceAddress | null | undefined): string {
  if (addr === "vous") {
    return `ADRESSE AU PUBLIC : VOUVOIEMENT (RÈGLE FERME, réglée dans sa fiche de marque)
Dans tout texte destiné à son public (carrousel, couverture, légende, post, accroche, script, newsletter…), elle VOUVOIE la personne qui lit : « vous », « votre », « vos », impératifs en « -ez » (« Regardez », « Osez »). Jamais de « tu », « ton », « ta », « tes », « te », « t' » ni d'impératif tutoyé adressé au lecteur, même si un exemple, une réponse, une note ou un texte de référence tutoie. Une citation exacte entre guillemets garde ses mots. Ce réglage ne change pas la façon dont l'appli s'adresse à elle.`;
  }
  if (addr === "tu") {
    return `ADRESSE AU PUBLIC : TUTOIEMENT (RÈGLE FERME, réglée dans sa fiche de marque)
Dans tout texte destiné à son public (carrousel, couverture, légende, post, accroche, script, newsletter…), elle TUTOIE la personne qui lit : « tu », « ton », « ta », « tes », impératifs tutoyés (« Regarde », « Ose »). Pas de « vous », « votre », « vos » adressé au lecteur, même si un exemple, une réponse ou un texte de référence vouvoie ; « vous » reste possible seulement pour parler à plusieurs personnes à la fois (« beaucoup d'entre vous »). Une citation exacte entre guillemets garde ses mots. Ce réglage ne change pas la façon dont l'appli s'adresse à elle.`;
  }
  return "";
}

// ── Comptage ────────────────────────────────────────────────────────────────

const NOT_LETTER_BEFORE = "(?<![\\p{L}\\p{N}_'’])";
const NOT_LETTER_AFTER = "(?![\\p{L}\\p{N}_])";
const TU_RE = new RegExp(`${NOT_LETTER_BEFORE}(?:tu|toi|ta|tes|te)${NOT_LETTER_AFTER}|${NOT_LETTER_BEFORE}t['’](?=\\p{L})`, "giu");
const TON_RE = new RegExp(`${NOT_LETTER_BEFORE}ton${NOT_LETTER_AFTER}`, "giu");
const VOUS_RE = new RegExp(`${NOT_LETTER_BEFORE}(?:vous|votre|vos|vôtres?)${NOT_LETTER_AFTER}`, "giu");
/** « le ton », « un ton juste », « changer de ton. » : le nom, pas le possessif. */
const TON_NOUN_BEFORE = new Set(["le", "un", "du", "au", "ce", "cet", "même", "meme", "bon", "mauvais", "quel", "son", "mon", "votre", "notre", "leur", "juste", "nouveau"]);
/** « vous » qui parle à un groupe : légitime dans une marque qui tutoie. */
const GROUP_VOUS_RE = /d['’]entre vous|vous (?:toutes|tous)\b|vous [êe]tes (?:nombreu|plusieurs|beaucoup)|vous avez (?:été|ete) nombreu/i;

/** Masque (à longueur égale) ce qui n'est pas une adresse au lecteur. */
function maskNonAddress(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return text
    // Marqueurs de blocs balisés « [SLIDE 3 - BODY] ».
    .replace(/\[[^\]\n]{1,40}\]/g, blank)
    // Citations : leurs mots appartiennent à quelqu'un d'autre.
    .replace(/«[^»]*»/g, blank)
    .replace(/“[^”]*”/g, blank)
    .replace(/"[^"\n]*"/g, blank)
    // Parole ou pensée rapportée sans guillemets : « On se dit : tu n'y arriveras pas. »
    .replace(/(\p{L}+)(\s*:\s*)([^\n.!?…]*)/gu, (m, verb: string, colon: string, rest: string) =>
      /^(?:dis|dit|dites|disent|dire|disais|disait|disaient|demande|demandes|demandez|demandent|demandait|pense|penses|pensez|pensent|pensais|pensait|répète|repete|répètes|répétez|répètent|entends|entend|entendez|entendent|entendu|lis|lit|lisez|écrit|ecrit|écris|écrivez|répond|repond|répondu|reponds|réponds|répondent)$/iu.test(verb)
        ? verb + colon + blank(rest)
        : m)
    // Mots-dièse, mentions, liens.
    .replace(/(?:#|@)[\p{L}\p{N}_.]+/gu, blank)
    .replace(/https?:\/\/\S+/g, blank);
}

function countTu(masked: string): number {
  let n = [...masked.matchAll(TU_RE)].length;
  for (const m of masked.matchAll(TON_RE)) {
    const before = masked.slice(0, m.index!).match(/(\p{L}+)[\s’']*$/u)?.[1]?.toLowerCase() ?? "";
    const after = masked.slice(m.index! + 3);
    // Possessif = suivi d'un mot ; « le ton », « changer de ton. » = le nom.
    if (TON_NOUN_BEFORE.has(before) || !/^\s+\p{L}/u.test(after)) continue;
    n++;
  }
  return n;
}

const countVous = (masked: string): number => [...masked.matchAll(VOUS_RE)].length;

export interface AudienceAddressCheck {
  /** Adresses au lecteur en tutoiement / vouvoiement (hors citations). */
  tu: number;
  vous: number;
  /** Adresses dans la forme contraire au réglage. */
  wrong: number;
  /** Phrases à corriger (texte d'origine), dans l'ordre, sans doublon. */
  items: string[];
}

/**
 * Compte les adresses au lecteur et repère celles qui contredisent le réglage.
 * Sans réglage, `wrong` vaut 0. Les citations (« … », “…”, "…"), les paroles
 * ou pensées rapportées après « dit : », « se dit : », les mots-dièse et les
 * marqueurs de blocs ne comptent pas.
 */
export function checkAudienceAddress(text: string, addr: AudienceAddress | null | undefined): AudienceAddressCheck {
  const source = text || "";
  const masked = maskNonAddress(source);
  let tu = 0, vous = 0, wrong = 0;
  const items: string[] = [];
  for (const m of source.matchAll(/[^\n.!?…]+[.!?…]*/g)) {
    const seg = masked.slice(m.index!, m.index! + m[0].length);
    const t = countTu(seg);
    // Dans une marque qui tutoie, « vous » qui parle à un groupe est légitime.
    const v = addr === "tu" && GROUP_VOUS_RE.test(seg) ? 0 : countVous(seg);
    tu += t;
    vous += v;
    const bad = addr === "vous" ? t : addr === "tu" ? v : 0;
    if (bad) {
      wrong += bad;
      const sentence = m[0].replace(/\[[^\]\n]{1,40}\]\s*/g, "").trim();
      if (sentence && !items.includes(sentence)) items.push(sentence);
    }
  }
  return { tu, vous, wrong, items };
}

// ── Passe de correction ─────────────────────────────────────────────────────

export function audienceAddressFixPrompt(addr: AudienceAddress): string {
  const target = addr === "vous"
    ? "VOUVOIE son public. Passe chaque adresse au lecteur au vouvoiement : « tu » → « vous », « ton/ta/tes » → « votre/vos », « te/t' » → « vous », impératif tutoyé → impératif en « -ez », avec les accords du verbe."
    : "TUTOIE son public. Passe chaque adresse au lecteur au tutoiement : « vous » → « tu » ou « te/toi », « votre/vos » → « ton/ta/tes », impératif en « -ez » → impératif tutoyé, avec les accords du verbe. « vous » qui parle à plusieurs personnes à la fois peut rester.";
  return `Tu es correctrice. La personne qui publie ce texte ${target}
C'est un réglage ferme de sa fiche de marque.
Corrige UNIQUEMENT les passages listés (et les mots voisins qu'il faut accorder). Ne touche à rien d'autre : même texte, mêmes marqueurs entre crochets, mêmes retours à la ligne, mêmes chiffres, même longueur à quelques mots près. Ne raccourcis rien. Une citation exacte entre guillemets garde ses mots.
Renvoie le texte complet corrigé, sans commentaire ni balise.`;
}

export type AudienceAddressPass = (content: string, addr: AudienceAddress, items: string[], opts: { abortTimeoutMs?: number; logger?: (m: string) => void }) => Promise<string>;

const digits = (t: string) => new Set((t.replace(/\[[^\]\n]{1,40}\]/g, " ").match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", ".")));

export interface AudienceAddressReceipt {
  address: AudienceAddress;
  wrong_before: number;
  wrong_after: number;
  applied: boolean;
  reason: "conforme" | "corrige" | "refus_compte" | "refus_chiffre" | "inchange";
}

/**
 * Contrôle après rédaction. Si le texte contredit le réglage : UNE passe
 * courte ciblée (`pass`, cf. audience-address-pass.ts), gardée seulement si le nombre d'adresses fautives baisse et
 * qu'aucun chiffre ne disparaît ni n'apparaît. Sans réglage : no-op.
 */
export async function enforceAudienceAddress(
  text: string,
  addr: AudienceAddress | null | undefined,
  opts: { pass: AudienceAddressPass; abortTimeoutMs?: number; logger?: (m: string) => void },
): Promise<{ content: string; receipt: AudienceAddressReceipt | null }> {
  if (!addr || !text) return { content: text, receipt: null };
  const before = checkAudienceAddress(text, addr);
  if (!before.wrong) return { content: text, receipt: { address: addr, wrong_before: 0, wrong_after: 0, applied: false, reason: "conforme" } };
  const candidate = await opts.pass(text, addr, before.items, { abortTimeoutMs: opts.abortTimeoutMs, logger: opts.logger });
  const base = { address: addr, wrong_before: before.wrong };
  if (!candidate || candidate === text) return { content: text, receipt: { ...base, wrong_after: before.wrong, applied: false, reason: "inchange" } };
  const after = checkAudienceAddress(candidate, addr);
  if (after.wrong >= before.wrong) return { content: text, receipt: { ...base, wrong_after: after.wrong, applied: false, reason: "refus_compte" } };
  const a = digits(text), b = digits(candidate);
  if (a.size !== b.size || [...a].some((n) => !b.has(n))) return { content: text, receipt: { ...base, wrong_after: after.wrong, applied: false, reason: "refus_chiffre" } };
  opts.logger?.(`[audience-address] ${addr} : adresses fautives ${before.wrong}→${after.wrong}, gardé`);
  return { content: candidate, receipt: { ...base, wrong_after: after.wrong, applied: true, reason: "corrige" } };
}
