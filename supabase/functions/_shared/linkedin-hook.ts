// ACCROCHE LinkedIn dérivée du texte (04/10/2026).
//
// L'aperçu joint « accroche » + reste du post. Une accroche reformulée par le
// modèle (ou laissée telle quelle alors que la correction a changé le début
// du post) ne peut pas être retirée du corps : elle s'affiche deux fois, ou
// coupe une phrase en deux. Règle : l'accroche est TOUJOURS le début exact de
// `content`, et c'est le code qui la dérive. On ne réécrit jamais `content`.
//
// Copie front : src/lib/linkedin-hook.ts (runtimes séparés, garder en sync).

/** Limite LinkedIn avant « voir plus ». */
export const LINKEDIN_HOOK_MAX = 210;

/**
 * Accroche alignée sur `content` :
 * - l'accroche fournie est gardée si elle est exactement le début du post et
 *   s'arrête en fin de ligne (rien n'est coupé au milieu d'une phrase) ;
 * - sinon, la première ligne non vide du post (si ≤ 210 caractères) ;
 * - sinon, chaîne vide (pas d'accroche séparée plutôt qu'une accroche fausse).
 */
export function deriveLinkedInHook(content: string, declared?: unknown): string {
  const text = String(content || "").replace(/\r\n?/g, "\n").trimStart();
  if (!text.trim()) return "";
  const hook = typeof declared === "string" ? declared.replace(/\r\n?/g, "\n").trim() : "";
  if (hook && hook.length <= LINKEDIN_HOOK_MAX && text.startsWith(hook)) {
    const next = text.charAt(hook.length);
    if (next === "" || next === "\n") return hook;
  }
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length <= LINKEDIN_HOOK_MAX ? firstLine : "";
}

/**
 * Aligne `accroche` (et `hook` s'il existe) sur `content`, en place.
 * Ne touche jamais `content`. Sans `content` texte, ne fait rien.
 */
export function alignLinkedInHookFields<T extends Record<string, any>>(
  parsed: T,
  logger: (msg: string) => void = (m) => console.log(m),
): T {
  if (!parsed || typeof parsed !== "object" || typeof parsed.content !== "string") return parsed;
  const declared = typeof parsed.accroche === "string" ? parsed.accroche : parsed.hook;
  const aligned = deriveLinkedInHook(parsed.content, declared);
  if (typeof declared === "string" && declared.trim() !== aligned) {
    logger(`[linkedin-hook] accroche réalignée sur le début du post (${declared.trim().length} → ${aligned.length} car.)`);
  }
  (parsed as Record<string, unknown>).accroche = aligned;
  if (typeof parsed.hook === "string") (parsed as Record<string, unknown>).hook = aligned;
  return parsed;
}
