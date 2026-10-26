// Capacités par modèle Anthropic (température, réflexion, outil forcé, plafond de
// tokens) et tiers Haiku / Opus. Sorti de `anthropic.ts` le 26/10/2026 (cliquet
// gros fichiers) : un fichier = une mission. `anthropic.ts` ré-exporte tout ;
// l'import de type ci-dessous est effacé à la compilation (pas de cycle).
import type { AnthropicModel } from "./anthropic.ts";

/**
 * Tier « Haiku » de l'app (plan de carrousel hors Max, passe de correction,
 * description/tri de photos, extraction, questions, interprète du Studio…).
 * Point de vérité unique : bascule Haiku 4.5 → Haiku 5.5 le 26/10/2026
 * (0,10 $ / 0,50 $ par Mtok au lieu de 1 $ / 5 $, contexte 1M). Retour arrière
 * = secret Lovable `AI_MODEL_HAIKU=claude-haiku-4-5` (valeur inconnue ignorée).
 * ⚠️ Haiku 5.5 : `temperature` non défaut et prefill → 400 (cf
 * MODELS_REJECTING_SAMPLING) ; pense par défaut quand `thinking` est omis (cf
 * MODELS_THINKING_ON_WHEN_OMITTED) ; `tool_choice` forcé reste ACCEPTÉ (≠ Opus 5.5) ;
 * tokenizer ~30 % plus dense (cf maxTokensFor).
 */
const HAIKU_MODELS: ReadonlySet<string> = new Set(["claude-haiku-5-5", "claude-haiku-4-5"]);
function readHaikuModel(): AnthropicModel {
  const v = Deno.env.get("AI_MODEL_HAIKU");
  return v && HAIKU_MODELS.has(v) ? (v as AnthropicModel) : "claude-haiku-5-5";
}
export const HAIKU_MODEL: AnthropicModel = readHaikuModel();

/**
 * Opus 4.8 (et 4.7) REJETTENT les paramètres d'échantillonnage (temperature,
 * top_p, top_k) → erreur 400. Sonnet 4.6 et Haiku 4.5 les acceptent encore ;
 * Haiku 5.5 ne les accepte plus.
 * On retire donc `temperature` du corps de requête pour ces modèles ; ils
 * utilisent leur échantillonnage par défaut (comportement attendu et seul valide).
 */
const MODELS_REJECTING_SAMPLING = new Set<string>([
  "claude-opus-5-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  // Sonnet 5 rejette lui aussi temperature/top_p/top_k (valeur non-défaut → 400).
  "claude-sonnet-5",
  // Haiku 5.5 : temperature ≠ 1 → 400, et le prefill (dernier tour assistant) → 400
  // (doc « Migrating to Claude Haiku 5.5 », breaking changes 2 et 3). Haiku 4.5
  // les acceptait encore.
  "claude-haiku-5-5",
]);

export function supportsTemperature(model: string): boolean {
  return !MODELS_REJECTING_SAMPLING.has(model);
}

/**
 * Certains modèles activent le thinking ADAPTATIF quand le champ `thinking` est OMIS
 * (Sonnet 5 : omission ⇒ adaptatif ON ; ≠ Sonnet 4.6 / Opus 4.8 où omission ⇒ off).
 * Comme ce code n'envoie jamais `thinking`, on force `disabled` pour ces modèles afin
 * de préserver le comportement historique (sortie directe, sans latence ni blocs de
 * réflexion non gérés par le parsing JSON). N'affecte que Sonnet 5 → no-op tant que
 * `AI_MODEL_SONNET` n'est pas basculé.
 */
const MODELS_THINKING_ON_WHEN_OMITTED = new Set<string>([
  "claude-sonnet-5",
  // Haiku 5.5 : omission ⇒ réflexion adaptative (comptée dans max_tokens, un
  // plafond court de 300 tokens pourrait être mangé avant le texte). `disabled` est
  // accepté à l'effort par défaut (medium) ; Haiku 4.5 ne réfléchissait jamais ici,
  // on garde ce comportement. `tool_choice` forcé reste accepté avec ou sans réflexion.
  "claude-haiku-5-5",
]);

export function forcesDisabledThinking(model: string): boolean {
  return MODELS_THINKING_ON_WHEN_OMITTED.has(model);
}

/**
 * Tier « Opus » de l'app (coaching, stratégie, audit branding, assistant, visuels
 * Qualité Max, Pinterest). Point de vérité unique : changer ici suffit.
 */
export const OPUS_MODEL: AnthropicModel = "claude-opus-5-5";

/**
 * Opus 5.5 ne coupe JAMAIS sa réflexion : `thinking: disabled` → 400, et
 * `tool_choice` forcé (`tool`/`any`) → 400 aussi. La réflexion compte dans
 * `max_tokens` sans être renvoyée, et le premier bloc de la réponse peut être un
 * bloc `thinking` (d'où `responseText`, jamais `content[0].text`).
 */
const MODELS_ALWAYS_THINKING = new Set<string>(["claude-opus-5-5"]);

export function alwaysThinks(model: string): boolean {
  return MODELS_ALWAYS_THINKING.has(model);
}

/**
 * Ces routes tournaient SANS réflexion sur Opus 4.8. La doc Opus 5.5 recommande
 * alors l'effort `low` (le défaut API est `medium`) : réflexion courte, latence
 * proche de l'ancien comportement. Monter ici si la qualité le demande.
 */
const ALWAYS_THINKING_EFFORT = "low";

/**
 * Haiku 5.5 : tokenizer plus dense (le même texte ≈ 30 % de tokens en plus que
 * Haiku 4.5, doc de migration). Un `max_tokens` réglé pour Haiku 4.5 couperait
 * donc la même sortie → on élargit le plafond d'autant (c'est un plafond, pas
 * une dépense : seuls les tokens produits sont facturés).
 */
const MODELS_DENSER_TOKENIZER = new Set<string>(["claude-haiku-5-5"]);

/** Marge de `max_tokens` pour la réflexion (comptée dans le plafond) ou le tokenizer. */
export function maxTokensFor(model: string, requested: number): number {
  if (alwaysThinks(model)) return Math.max(16000, Math.ceil(requested * 1.5));
  if (MODELS_DENSER_TOKENIZER.has(model)) return Math.ceil(requested * 1.3);
  return requested;
}

/**
 * Champs de requête qui dépendent du modèle (appels bruts, stream ou non) :
 * plafond de tokens, effort, réflexion, choix d'outil. Seul endroit à toucher
 * pour un nouveau modèle.
 */
export function modelRequestFields(
  model: string,
  maxTokens: number,
  tool?: { name: string },
): Record<string, unknown> {
  const fields: Record<string, unknown> = { max_tokens: maxTokensFor(model, maxTokens) };
  if (forcesDisabledThinking(model)) fields.thinking = { type: "disabled" };
  if (alwaysThinks(model)) fields.output_config = { effort: ALWAYS_THINKING_EFFORT };
  if (tool) {
    fields.tool_choice = alwaysThinks(model)
      ? { type: "auto", disable_parallel_tool_use: true }
      : { type: "tool", name: tool.name };
  }
  return fields;
}

/** Consigne ajoutée au system quand l'outil ne peut pas être forcé (Opus 5.5). */
export function toolInstruction(model: string, tool?: { name: string }): string {
  return tool && alwaysThinks(model)
    ? `\n\nLivre ta réponse uniquement en appelant l'outil \`${tool.name}\`, une seule fois.`
    : "";
}
