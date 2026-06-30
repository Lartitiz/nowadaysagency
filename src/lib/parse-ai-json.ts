import { trackError, trackWarning } from "@/lib/error-tracker";

/**
 * Parsing centralisé des réponses JSON de l'IA.
 *
 * Pourquoi ce helper : partout dans l'app on refaisait `JSON.parse(reponse_IA)`
 * dans un `try/catch` artisanal dont le `catch` retombait EN SILENCE sur `[]` /
 * `{ raw }` / `null` / du texte brut. Résultat : l'utilisatrice voyait un contenu
 * vide ou cassé en pensant que « ça avait marché », et c'était indébogable (aucun
 * log). On centralise ici : soit on a du JSON valide, soit on le SIGNALE (log +
 * erreur typée). Le fallback muet est interdit.
 *
 * Deux portes :
 *  - `parseAiJson`    : LÈVE `AiParseError` en cas d'échec (chemins « la génération
 *                       a réussi ou pas » → l'appelant toast/erreur).
 *  - `tryParseAiJson` : retourne `null` MAIS loggue un warning (affichage tolérant,
 *                       où l'absence de JSON est parfois légitime).
 */

export class AiParseError extends Error {
  readonly rawExcerpt: string;
  constructor(rawExcerpt: string) {
    super("La génération a échoué (réponse IA illisible). Réessaie, ça marche en général au 2ᵉ essai.");
    this.name = "AiParseError";
    this.rawExcerpt = rawExcerpt;
  }
}

/** Tentative de parsing robuste (fences markdown, objet/array, réparations courantes). */
function attemptParse(raw: string | object): unknown {
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw !== "string") return undefined;

  let cleaned = raw.trim();

  // Retire les fences markdown (avec ou sans tag de langage)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
  }
  cleaned = cleaned.trim();

  // Parse direct
  try {
    return JSON.parse(cleaned);
  } catch { /* on tente plus bas */ }

  // Premier objet JSON repérable
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* on tente plus bas */ }
  }

  // Premier tableau JSON repérable
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { /* on tente plus bas */ }
  }

  // Dernier recours : réparations courantes (virgules traînantes, quotes simples)
  try {
    const fixed = cleaned.replace(/,\s*([}\]])/g, "$1").replace(/'/g, '"');
    const obj2 = fixed.match(/\{[\s\S]*\}/);
    if (obj2) return JSON.parse(obj2[0]);
    const arr2 = fixed.match(/\[[\s\S]*\]/);
    if (arr2) return JSON.parse(arr2[0]);
  } catch { /* échec définitif */ }

  return undefined;
}

function excerpt(raw: string | object): string {
  const s = typeof raw === "string" ? raw : JSON.stringify(raw);
  return (s || "").slice(0, 300);
}

/**
 * Parse une réponse IA et LÈVE `AiParseError` si elle est illisible.
 * À utiliser quand l'absence de JSON valide = échec de génération (l'appelant
 * doit afficher un toast / renvoyer une erreur, pas un contenu vide).
 */
export function parseAiJson<T = unknown>(raw: string | object, context?: string): T {
  const parsed = attemptParse(raw);
  if (parsed === undefined) {
    const rawExcerpt = excerpt(raw);
    trackError(new Error("AI JSON parse failed"), { context: context || "parse-ai-json", rawExcerpt });
    throw new AiParseError(rawExcerpt);
  }
  return parsed as T;
}

/**
 * Parse une réponse IA et retourne `null` si illisible — mais loggue un warning
 * (plus de catch totalement muet). À réserver aux chemins où `null` est un état
 * légitime (affichage tolérant). Préférer `parseAiJson` partout ailleurs.
 */
export function tryParseAiJson<T = unknown>(raw: string | object, context?: string): T | null {
  const parsed = attemptParse(raw);
  if (parsed === undefined) {
    trackWarning("AI JSON parse failed (soft)", { context: context || "try-parse-ai-json", rawExcerpt: excerpt(raw) });
    return null;
  }
  return parsed as T;
}
