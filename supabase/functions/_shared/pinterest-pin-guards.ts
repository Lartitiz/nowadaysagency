// Gardes DÉTERMINISTES des épingles Pinterest (pinterest-visual,
// pinterest-photo-brief). Chantier « séparation écriture / design » :
// l'IA rédige, le CODE répare ce qui est cassé, sans jamais réécrire le texte.
//
// 1. finalizePinHtml : post-traitement commun du HTML d'épingle (retrait du
//    @import Google Fonts qui fuyait en texte visible, contraste texte/fond,
//    plancher de taille de police, <link> de polices). Avant, seul
//    pinterest-visual avait les gardes contraste/police ; l'overlay de
//    pinterest-photo-brief n'en avait aucune.
// 2. normalizePinData : pin_type / badge_label manquants ou invalides →
//    dérivés par le code depuis le type d'épingle demandé. Un badge fourni par
//    l'IA et valide est GARDÉ tel quel (c'est du texte affiché).
// 3. findPinDataTextMismatches : vérifie que les mots de pin_data (titre,
//    libellés) se retrouvent dans le HTML. L'export PNG lit le HTML, l'export
//    PPTX éditable lit pin_data : une divergence = deux textes différents
//    selon l'export. On ne bloque pas et on ne réécrit rien, on mesure
//    (télémétrie `[pinterest:pin-data-mismatch]`).

import { enforceTextContrast } from "./contrast-guard.ts";
import { enforceGlobalMinFontSize } from "./font-size-guard.ts";

export const PIN_TYPES = ["infographie", "checklist", "mini_tuto", "avant_apres", "schema_visuel"] as const;
export type PinType = typeof PIN_TYPES[number];

/**
 * Badge par défaut de chaque type — mêmes libellés que les replis historiques
 * de l'export PPTX éditable (src/lib/export-pinterest-editable-pptx.ts) et que
 * ceux annoncés dans le prompt (« TUTO », « CHECKLIST »…).
 */
export const DEFAULT_BADGE_BY_PIN_TYPE: Record<PinType, string> = {
  infographie: "INFOGRAPHIE",
  checklist: "CHECKLIST",
  mini_tuto: "TUTO",
  avant_apres: "AVANT / APRÈS",
  schema_visuel: "SCHÉMA",
};

function isPinType(v: unknown): v is PinType {
  return typeof v === "string" && (PIN_TYPES as readonly string[]).includes(v);
}

/**
 * Complète pin_data quand l'IA a laissé des champs de structure vides ou
 * invalides. Ne touche à AUCUN texte présent et valide. Retourne la liste des
 * corrections (pour log).
 */
// deno-lint-ignore no-explicit-any
export function normalizePinData(pinData: any, requestedPinType: string): { pinData: any; fixes: string[] } {
  const fixes: string[] = [];
  if (!pinData || typeof pinData !== "object" || Array.isArray(pinData)) return { pinData, fixes };
  const out = { ...pinData };
  if (!isPinType(out.pin_type) && isPinType(requestedPinType)) {
    out.pin_type = requestedPinType;
    fixes.push("pin_type");
  }
  if (typeof out.badge_label !== "string" || out.badge_label.trim() === "") {
    if (isPinType(out.pin_type)) {
      const pinType: PinType = out.pin_type;
      out.badge_label = DEFAULT_BADGE_BY_PIN_TYPE[pinType];
      fixes.push("badge_label");
    }
  }
  return { pinData: out, fixes };
}

/**
 * Post-traitement commun du HTML d'épingle : retire le @import Google Fonts
 * (où qu'il soit), applique les gardes contraste + plancher de police, puis
 * préfixe le <link> des polices. Les gardes n'agissent que sur les cas cassés
 * (contraste < seuil, font-size inline sous le plancher) : un HTML sain sort
 * identique, au <link> près.
 */
export function finalizePinHtml(
  rawHtml: string,
  fonts: { title: string; body: string },
  floorPx: number,
): { html: string; contrastFixes: number; fontFixes: number } {
  const fontsLink = `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(fonts.title)}:ital,wght@0,400;0,700;1,400&family=${encodeURIComponent(fonts.body)}:wght@400;500;600;700&display=swap" rel="stylesheet">`;
  // Retirer le @import Google Fonts OÙ QU'IL SOIT (nu ou dans un <style> plus
  // large) — sinon il fuite en TEXTE VISIBLE quand le modèle oublie le wrapper
  // <style>. La police reste fournie par le <link>.
  const html = rawHtml
    .replace(/@import\s+url\(\s*['"]?[^)]*fonts\.googleapis\.com[^)]*['"]?\s*\)\s*;?/gi, "")
    .replace(/<style>\s*<\/style>/gi, "");
  const contrast = enforceTextContrast(html);
  const fontFloor = enforceGlobalMinFontSize(contrast.html, floorPx);
  return { html: fontsLink + fontFloor.html, contrastFixes: contrast.fixes, fontFixes: fontFloor.fixes };
}

// ── Cohérence texte pin_data ↔ pin_html ────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">",
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', laquo: '"', raquo: '"',
  hellip: "…", mdash: "—", ndash: "–", oelig: "oe", aelig: "ae", szlig: "ss",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    // &eacute; &Agrave; &ccedil;… → lettre de base (les accents sont ignorés à la comparaison)
    .replace(/&([a-zA-Z])(acute|grave|circ|uml|cedil|tilde|ring|slash);/g, "$1")
    .replace(/&([a-zA-Z]+);/g, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}

/** Mots comparables : minuscules, sans accents, ≥ 3 caractères (les « de », « à » ne prouvent rien). */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);
}

/** Texte visible du HTML (hors <style>/<script>, balises → espaces, entités décodées). */
export function visibleTextOfHtml(html: string): string {
  return decodeEntities(
    (html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

export interface PinTextMismatch {
  /** Champ de pin_data concerné : "main_title" ou "elements[i].label". */
  field: string;
  /** Mots du champ absents du HTML. */
  missing: string[];
}

/**
 * Liste les textes de pin_data (titre affiché + libellés d'éléments) dont au
 * moins un mot n'apparaît pas dans le texte visible de pin_html. Lecture
 * seule : ne modifie ni pin_data ni le HTML.
 */
// deno-lint-ignore no-explicit-any
export function findPinDataTextMismatches(pinData: any, pinHtml: string): PinTextMismatch[] {
  if (!pinData || typeof pinData !== "object" || !pinHtml) return [];
  const htmlWords = new Set(words(visibleTextOfHtml(pinHtml)));
  const fields: Array<[string, unknown]> = [["main_title", pinData.main_title]];
  if (Array.isArray(pinData.elements)) {
    pinData.elements.forEach((el: { label?: unknown } | null, i: number) => {
      fields.push([`elements[${i}].label`, el?.label]);
    });
  }
  const out: PinTextMismatch[] = [];
  for (const [field, value] of fields) {
    if (typeof value !== "string") continue;
    const missing = [...new Set(words(value).filter((w) => !htmlWords.has(w)))];
    if (missing.length) out.push({ field, missing });
  }
  return out;
}

/**
 * Mesure (sans bloquer ni réécrire) la cohérence pin_data ↔ pin_html et
 * journalise `[pinterest:pin-data-mismatch]` en cas d'écart. Le log ne
 * contient que des noms de champs et des compteurs, jamais le texte de
 * l'utilisatrice.
 */
// deno-lint-ignore no-explicit-any
export function reportPinDataMismatch(pinData: any, pinHtml: string, source: string): PinTextMismatch[] {
  const mismatches = findPinDataTextMismatches(pinData, pinHtml);
  if (mismatches.length) {
    console.warn("[pinterest:pin-data-mismatch]", JSON.stringify({
      source,
      pin_type: pinData?.pin_type ?? null,
      fields: mismatches.map((m) => ({ field: m.field, missing_words: m.missing.length })),
    }));
  }
  return mismatches;
}
