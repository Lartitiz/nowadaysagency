// Tu ou vous sur les sorties STRUCTURÉES (04/10/2026, PR « tu/vous partout »).
// Le contrôle `enforceAudienceAddress` (audience-address.ts) travaille sur UN
// texte. Les formats publiés sont des objets : légende + accroche, stories,
// newsletter (objet, aperçu, corps), épingle (titre, description, textes du
// visuel)… Ce module rassemble les champs PUBLICS d'une sortie en un seul bloc
// balisé (« [T1] », « [T2] »…), lance UNE passe (seulement s'il y a une
// contradiction), puis réinjecte champ par champ.
//
// Garde-fous, en plus de ceux d'enforceAudienceAddress (compte qui baisse,
// aucun chiffre perdu ni ajouté) : un marqueur perdu, doublé ou déplacé, ou un
// champ vidé → rien n'est réinjecté. Un champ qui ne diffère que par des
// espaces garde son texte d'origine.
//
// Hors champ : le texte que l'utilisatrice a écrit elle-même et la façon dont
// l'appli lui parle (conseils, astuces, consignes de tournage) : on ne liste
// QUE des chemins de texte publié.

import { enforceAudienceAddress, type AudienceAddress, type AudienceAddressPass, type AudienceAddressReceipt } from "./audience-address.ts";
import { tryParseAiJson } from "./parse-ai-json.ts";

export interface TextSlot {
  get(): unknown;
  set(value: string): void;
}

type Holder = Record<string | number, unknown>;
const isHolder = (v: unknown): v is Holder => !!v && typeof v === "object";

/**
 * Emplacements de texte d'une sortie, d'après des chemins :
 * - « content », « caption.text » : champ simple ;
 * - « stories[].text » : chaque élément d'un tableau ;
 * - « hooks[] » : les chaînes d'un tableau ;
 * - « versions.*.full_text » : chaque clé d'un objet ;
 * - « ** » : toutes les chaînes sous ce point (sortie 100 % publique).
 * Un chemin absent ne donne rien ; un champ non textuel est ignoré.
 */
export function collectTextSlots(root: unknown, paths: string[]): TextSlot[] {
  const out: TextSlot[] = [];
  const seen = new Set<string>();
  const ids = new WeakMap<object, number>();
  let nextId = 0;
  const idOf = (o: object) => {
    if (!ids.has(o)) ids.set(o, nextId++);
    return ids.get(o)!;
  };
  const push = (holder: Holder, key: string | number) => {
    if (typeof holder[key] !== "string") return;
    const k = `${idOf(holder)}:${key}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ get: () => holder[key], set: (v) => { holder[key] = v; } });
  };
  const all = (holder: Holder, key: string | number, depth = 0) => {
    const v = holder[key];
    if (typeof v === "string") return push(holder, key);
    if (!isHolder(v) || depth > 8) return;
    for (const k of Array.isArray(v) ? v.keys() : Object.keys(v)) all(v as Holder, k, depth + 1);
  };
  const walk = (holder: Holder, key: string | number, segs: string[]) => {
    if (!segs.length) return push(holder, key);
    const [seg, ...rest] = segs;
    const v = holder[key];
    if (seg === "**") return all(holder, key);
    if (!isHolder(v)) return;
    if (seg === "[]") {
      if (Array.isArray(v)) v.forEach((_, i) => walk(v as unknown as Holder, i, rest));
      return;
    }
    if (seg === "*") {
      if (!Array.isArray(v)) for (const k of Object.keys(v)) walk(v, k, rest);
      return;
    }
    walk(v, seg, rest);
  };
  const box: Holder = { root };
  for (const p of paths) {
    const segs = p.replace(/\[\]/g, ".[]").split(".").filter(Boolean);
    walk(box, "root", segs);
  }
  return out;
}

const marker = (i: number) => `[T${i + 1}]`;

/** Bloc balisé : un marqueur seul sur sa ligne, puis le texte du champ. */
export function joinTextSlots(texts: string[]): string {
  return texts.map((t, i) => `${marker(i)}\n${t.trim()}`).join("\n\n");
}

/** Découpe le bloc corrigé ; null si un marqueur manque, est doublé, déplacé, ou si un champ est vide. */
export function splitTextSlots(block: string, n: number): string[] | null {
  const parts = block.split(/^\[T(\d+)\][ \t]*/m);
  if (parts[0].trim() || parts.length !== 1 + 2 * n) return null;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (Number(parts[1 + 2 * i]) !== i + 1) return null;
    const text = parts[2 + 2 * i].trim();
    if (!text) return null;
    out.push(text);
  }
  return out;
}

/** Garde les espaces de début et de fin du champ d'origine (sauts de ligne compris). */
function keepEdges(original: string, corrected: string): string {
  const lead = original.match(/^\s*/)?.[0] ?? "";
  const trail = original.match(/\s*$/)?.[0] ?? "";
  return lead + corrected + trail;
}

export interface AudienceAddressFieldsOptions {
  pass: AudienceAddressPass;
  abortTimeoutMs?: number;
  logger?: (m: string) => void;
  /** Nom du chemin dans les journaux (« creative-flow:stories », « pinterest-visual »…). */
  scope?: string;
}

/**
 * Contrôle tu/vous sur plusieurs champs d'une même sortie. Sans réglage ou
 * sans texte : aucun appel, null. Texte conforme : aucun appel. Sinon UNE
 * passe ; les champs ne sont modifiés que si elle est gardée et que tous les
 * marqueurs reviennent dans l'ordre.
 */
export async function enforceAudienceAddressInSlots(
  slots: TextSlot[],
  addr: AudienceAddress | null | undefined,
  opts: AudienceAddressFieldsOptions,
): Promise<AudienceAddressReceipt | null> {
  if (!addr) return null;
  const live = slots.filter((s) => typeof s.get() === "string" && String(s.get()).trim());
  if (!live.length) return null;
  const originals = live.map((s) => String(s.get()));
  try {
    const result = await enforceAudienceAddress(joinTextSlots(originals), addr, opts);
    let receipt = result.receipt;
    if (receipt?.applied) {
      const parts = splitTextSlots(result.content, live.length);
      if (!parts) {
        opts.logger?.(`[audience-address] ${opts.scope ?? ""} marqueurs perdus : sortie inchangée`);
        receipt = { ...receipt, wrong_after: receipt.wrong_before, applied: false, reason: "inchange" };
      } else {
        live.forEach((s, i) => {
          const before = originals[i];
          if (parts[i].replace(/\s+/g, "") === before.replace(/\s+/g, "")) return;
          s.set(keepEdges(before, parts[i]));
        });
      }
    }
    if (receipt && receipt.wrong_before > 0) {
      console.log(JSON.stringify({ event: "audience_address", scope: opts.scope ?? "", ...receipt }));
    }
    return receipt;
  } catch (e) {
    opts.logger?.(`[audience-address] ${opts.scope ?? ""} contrôle ignoré (sortie intacte) : ${e}`);
    return null;
  }
}

/** Raccourci : chemins d'un objet (cf. collectTextSlots). Mute l'objet. */
export function enforceAudienceAddressInFields(
  root: unknown,
  paths: string[],
  addr: AudienceAddress | null | undefined,
  opts: AudienceAddressFieldsOptions,
): Promise<AudienceAddressReceipt | null> {
  if (!addr) return Promise.resolve(null);
  return enforceAudienceAddressInSlots(collectTextSlots(root, paths), addr, opts);
}

/** Texte seul (légende en texte brut…). Renvoie le texte final. */
export async function enforceAudienceAddressInText(
  text: string,
  addr: AudienceAddress | null | undefined,
  opts: AudienceAddressFieldsOptions,
): Promise<string> {
  if (!addr || typeof text !== "string" || !text.trim()) return text;
  const box = { text };
  await enforceAudienceAddressInFields(box, ["text"], addr, opts);
  return box.text;
}

/**
 * Sortie JSON en texte (flux SSE, réponses renvoyées telles quelles) :
 * renvoie le JSON réécrit si un champ a changé, sinon undefined (le texte
 * d'origine reste celui qui part). JSON illisible : undefined.
 */
export async function enforceAudienceAddressInJsonText(
  raw: string,
  paths: string[],
  addr: AudienceAddress | null | undefined,
  opts: AudienceAddressFieldsOptions,
): Promise<string | undefined> {
  if (!addr || typeof raw !== "string" || !raw.trim()) return undefined;
  const parsed = tryParseAiJson<unknown>(raw, `audience-address:${opts.scope ?? ""}`);
  if (!isHolder(parsed)) return undefined;
  const receipt = await enforceAudienceAddressInFields(parsed, paths, addr, opts);
  return receipt?.applied ? JSON.stringify(parsed) : undefined;
}
