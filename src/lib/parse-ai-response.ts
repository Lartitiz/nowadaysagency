import { tryParseAiJson } from "@/lib/parse-ai-json";

/**
 * Lecture d'une réponse IA en JSON (objet ou tableau).
 * Délègue au lecteur partagé (fences, prose autour, retours à la ligne bruts,
 * virgules traînantes, guillemets simples) et garde le contrat historique :
 * lève une Error au message inchangé si rien n'est lisible.
 */
export function parseAIResponse<T = any>(raw: string): T {
  const parsed = tryParseAiJson<T>(raw ?? "", "parse-ai-response");
  if (parsed === null || parsed === undefined) {
    throw new Error("L'IA a renvoyé un format inattendu. Réessaie !");
  }
  return parsed;
}
