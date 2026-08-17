// Jumeau edge (Deno) de src/lib/parse-ai-json.ts.
//
// Pourquoi : partout les edge functions refont JSON.parse(texte_IA) dans un
// try/catch dont le catch retombe EN SILENCE sur {} / [] / { raw } / texte brut,
// renvoyé en HTTP 200 -> le client croit que ça a marché et affiche du vide/cassé,
// + le quota est souvent débité pour un résultat inexploitable. On centralise :
// soit JSON valide, soit on SIGNALE (console + erreur typée). Pas de fallback muet.
//
//  - parseAiJson    : LÈVE AiParseError (status 502) -> l'appelant / handleError
//                     renvoie une erreur propre.
//  - tryParseAiJson : retourne null mais loggue (affichage tolérant / retour 502
//                     explicite côté appelant).

export class AiParseError extends Error {
  readonly status = 502;
  readonly rawExcerpt: string;
  constructor(rawExcerpt: string) {
    super("L'IA a renvoyé une réponse illisible. Réessaie, ça marche en général au 2ᵉ essai.");
    this.name = "AiParseError";
    this.rawExcerpt = rawExcerpt;
  }
}

/** Parsing robuste (fences markdown, objet/array, réparations courantes). */
function attemptParse(raw: string | object): unknown {
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw !== "string") return undefined;

  let cleaned = raw.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
  }
  cleaned = cleaned.trim();

  try { return JSON.parse(cleaned); } catch { /* on tente plus bas */ }

  // Un objet clairement voulu (le texte commence par `{`) ne doit JAMAIS retomber
  // sur le fallback tableau : si l'objet racine est tronqué (réponse coupée à
  // max_tokens), il peut rester un tableau IMBRIQUÉ mais valide plus loin dans le
  // texte (ex: "strengths":[...] fermé, alors que l'objet englobant ne l'est pas).
  // Sans cette garde, on renvoie silencieusement ce sous-tableau au lieu de
  // signaler l'échec — un faux succès pire qu'un échec propre.
  const looksLikeObject = cleaned.startsWith("{");

  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* on tente plus bas */ }
  }

  if (!looksLikeObject) {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch { /* on tente plus bas */ }
    }
  }

  try {
    const fixed = cleaned.replace(/,\s*([}\]])/g, "$1").replace(/'/g, '"');
    const obj2 = fixed.match(/\{[\s\S]*\}/);
    if (obj2) return JSON.parse(obj2[0]);
    if (!looksLikeObject) {
      const arr2 = fixed.match(/\[[\s\S]*\]/);
      if (arr2) return JSON.parse(arr2[0]);
    }
  } catch { /* échec définitif */ }

  return undefined;
}

function excerpt(raw: string | object): string {
  const s = typeof raw === "string" ? raw : JSON.stringify(raw);
  return (s || "").slice(0, 300);
}

/** Parse une réponse IA, LÈVE AiParseError si illisible. */
export function parseAiJson<T = unknown>(raw: string | object, context?: string): T {
  const parsed = attemptParse(raw);
  if (parsed === undefined) {
    const rawExcerpt = excerpt(raw);
    console.error(`[parse-ai-json] échec (${context || "?"}):`, rawExcerpt);
    throw new AiParseError(rawExcerpt);
  }
  return parsed as T;
}

/** Parse une réponse IA, retourne null si illisible (mais loggue). */
export function tryParseAiJson<T = unknown>(raw: string | object, context?: string): T | null {
  const parsed = attemptParse(raw);
  if (parsed === undefined) {
    console.warn(`[parse-ai-json] échec souple (${context || "?"}):`, excerpt(raw));
    return null;
  }
  return parsed as T;
}
