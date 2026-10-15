import { tryParseAiJson } from "../_shared/parse-ai-json.ts";

// Lecture de la réponse de Claude (fiche 12, lot 1 : sorti d'index.ts à l'identique).

/**
 * Robust JSON parser that handles common AI response issues:
 * - Trailing commas before } or ]
 * - Markdown code blocks wrapping
 * - Truncated JSON (attempts to close open brackets)
 * - Control characters inside strings
 */
export function robustJsonParse(raw: string): Record<string, unknown> {
  // Parsing robuste centralisé (fences, extraction, réparations courantes).
  const parsed = tryParseAiJson<Record<string, unknown>>(raw, "deep-diagnostic");
  if (parsed !== null) return parsed;

  // Dernier recours, spécifique à cette fonction : le module partagé ne gère
  // ni les caractères de contrôle ni un JSON TRONQUÉ (réponse coupée à
  // max_tokens) — cause historique du bug « domaine Mattioli » (#640/#645).

  // Strip markdown code blocks
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  // Extract the outermost JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) cleaned = objMatch[0];

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");

  // Remove control characters (except newline/tab) that break JSON
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  // Try parsing cleaned version
  try { return JSON.parse(cleaned); } catch {}

  // Try to fix truncated JSON by closing open brackets
  let attempt = cleaned;
  const opens = (attempt.match(/\{/g) || []).length;
  const closes = (attempt.match(/\}/g) || []).length;
  const openBrackets = (attempt.match(/\[/g) || []).length;
  const closeBrackets = (attempt.match(/\]/g) || []).length;

  // Remove trailing incomplete key-value (e.g. `"key": "incomplete...`)
  attempt = attempt.replace(/,?\s*"[^"]*":\s*"[^"]*$/, "");
  attempt = attempt.replace(/,?\s*"[^"]*":\s*$/, "");

  for (let i = 0; i < openBrackets - closeBrackets; i++) attempt += "]";
  for (let i = 0; i < opens - closes; i++) attempt += "}";

  // Clean trailing commas again after surgery
  attempt = attempt.replace(/,\s*([\]}])/g, "$1");

  try { return JSON.parse(attempt); } catch {}

  throw new Error("Réponse IA invalide : impossible de parser le JSON après nettoyage");
}

/** Balise XML/HTML dans une chaîne (ex. `</summary>`, `<strengths>`). */
export const MARKUP_RE = /<\/?[a-z_][a-z0-9_-]*\s*\/?>/i;

/**
 * Sortie « dégénérée » du tool forcé : le modèle a mis sa réponse en
 * pseudo-XML dans `summary` au lieu de remplir les champs, ou a laissé
 * forces ET faiblesses vides. Dans les deux cas le diagnostic est inutilisable
 * tel quel — mieux vaut réessayer, puis basculer sur le fallback assumé.
 */
export function isDegenerateDiagnostic(result: Record<string, unknown>): boolean {
  const strengths = Array.isArray(result.strengths) ? result.strengths : [];
  const weaknesses = Array.isArray(result.weaknesses) ? result.weaknesses : [];
  return strengths.length === 0 && weaknesses.length === 0;
}

/** Filet ultime : si une balise résiduelle traîne dans un summary par ailleurs sain, on coupe avant. */
export function stripMarkupFromSummary(result: Record<string, unknown>): Record<string, unknown> {
  const summary = typeof result.summary === "string" ? result.summary : "";
  const m = summary.match(MARKUP_RE);
  if (!m || m.index === undefined) return result;
  return { ...result, summary: summary.slice(0, m.index).trim() };
}
