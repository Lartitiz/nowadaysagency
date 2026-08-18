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
 *
 * Copie edge : supabase/functions/_shared/parse-ai-json.ts (garder en sync).
 * Duplication VOULUE, pas de la dette : ce fichier tourne dans le navigateur
 * (import `@/lib/error-tracker`, alias Vite), l'autre tourne en Deno côté edge
 * function — aucun bundler ne peut les faire partager un seul fichier source à
 * travers cette frontière de runtime (même limite que strip-markdown.ts). La
 * logique de parsing (`attemptParse`, `repairSingleQuotedJson`, `excerpt`) doit
 * rester identique entre les deux copies ; seuls le canal de log (trackError/
 * trackWarning ici vs console côté edge) et le statut HTTP (absent ici, 502
 * côté edge) diffèrent légitimement. Tout correctif touchant `attemptParse` ou
 * `repairSingleQuotedJson` ici doit être répercuté dans la copie edge (cf. PR
 * #785 et #841, qui ont modifié les deux à chaque fois).
 */

export class AiParseError extends Error {
  readonly rawExcerpt: string;
  constructor(rawExcerpt: string) {
    super("La génération a échoué (réponse IA illisible). Réessaie, ça marche en général au 2ᵉ essai.");
    this.name = "AiParseError";
    this.rawExcerpt = rawExcerpt;
  }
}

/**
 * Convertit les clés/valeurs entre guillemets simples (`'foo': 'bar'`) en JSON
 * valide (`"foo": "bar"`), SANS toucher aux apostrophes à l'intérieur d'un mot
 * (l'IA, j'ai, c'est…). Contrairement à un `replace(/'/g, '"')` global, on
 * n'ouvre une chaîne que si le `'` suit immédiatement `{`, `[`, `,` ou `:`, et
 * on ne la ferme que sur un `'` immédiatement suivi de `:`, `,`, `}`, `]` ou
 * fin de texte. Un contenu qui contient une apostrophe brute (ex: "c'est") ne
 * peut alors plus matcher jusqu'à ce délimiteur : la conversion échoue pour ce
 * fragment et le laisse tel quel plutôt que de le corrompre.
 */
function repairSingleQuotedJson(input: string): string {
  const QUOTED = /((?:[^'\\]|\\.)*)/.source; // contenu sans apostrophe brute (échappées OK)
  let fixed = input;
  // clés : 'foo': -> "foo"
  // (délimiteur de fin en lookahead, pas consommé : sinon une virgule partagée
  // entre deux paires 'a': 1, 'b': 2 ne serait plus dispo comme préfixe de la suivante)
  fixed = fixed.replace(
    new RegExp(`([{,]\\s*)'${QUOTED}'(?=\\s*:)`, "g"),
    (_m, pre, content) => `${pre}"${content.replace(/"/g, '\\"')}"`
  );
  // valeurs (objet ou tableau) : 'bar' -> "bar"
  fixed = fixed.replace(
    new RegExp(`([:\\[,]\\s*)'${QUOTED}'(?=\\s*(?:[,}\\]]|$))`, "g"),
    (_m, pre, content) => `${pre}"${content.replace(/"/g, '\\"')}"`
  );
  return fixed;
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

  // Un objet clairement voulu (le texte commence par `{`) ne doit JAMAIS retomber
  // sur le fallback tableau : si l'objet racine est tronqué (réponse coupée à
  // max_tokens), il peut rester un tableau IMBRIQUÉ mais valide plus loin dans le
  // texte (ex: "strengths":[...] fermé, alors que l'objet englobant ne l'est pas).
  // Sans cette garde, on renvoie silencieusement ce sous-tableau au lieu de
  // signaler l'échec — un faux succès pire qu'un échec propre.
  const looksLikeObject = cleaned.startsWith("{");

  // Premier objet JSON repérable
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* on tente plus bas */ }
  }

  // Premier tableau JSON repérable
  if (!looksLikeObject) {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch { /* on tente plus bas */ }
    }
  }

  // Dernier recours : réparations courantes (virgules traînantes, quotes simples
  // de délimitation — jamais les apostrophes internes, cf. repairSingleQuotedJson)
  try {
    const fixed = repairSingleQuotedJson(cleaned.replace(/,\s*([}\]])/g, "$1"));
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
