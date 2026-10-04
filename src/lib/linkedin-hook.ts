// ACCROCHE LinkedIn : toujours le début exact du post (04/10/2026).
//
// Copie du serveur : supabase/functions/_shared/linkedin-hook.ts (runtimes
// séparés, garder deriveLinkedInHook en sync). Le serveur aligne déjà
// l'accroche ; ce filet couvre les résultats qui ne passent pas par lui
// (photo LinkedIn streamée, anciens brouillons). On ne réécrit jamais le post.

export const LINKEDIN_HOOK_MAX = 210;

/**
 * Accroche alignée sur le post : l'accroche fournie si elle est exactement le
 * début du post et s'arrête en fin de ligne, sinon la première ligne non vide
 * (si ≤ 210 caractères), sinon rien.
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
 * Retire du corps le préfixe couvert par l'accroche, en tolérant les
 * différences d'espaces / retours à la ligne. `matched` = l'accroche est bien
 * le début du corps ; sinon le corps est rendu tel quel.
 */
export function splitHookFromBody(body: string, hook: string): { matched: boolean; rest: string } {
  const h = hook.replace(/\s+/g, " ").trim();
  if (!h) return { matched: false, rest: body };
  let i = 0; // index dans body (whitespace d'origine)
  let j = 0; // index dans h (espaces normalisés)
  while (i < body.length && j < h.length) {
    const bWs = /\s/.test(body[i]);
    const hWs = h[j] === " ";
    if (bWs && hWs) { while (i < body.length && /\s/.test(body[i])) i++; j++; continue; }
    if (bWs) { i++; continue; }       // espace en plus côté corps
    if (hWs) { j++; continue; }       // espace en plus côté accroche
    if (body[i] === h[j]) { i++; j++; continue; }
    return { matched: false, rest: body }; // vraie divergence → on ne retire rien
  }
  return j >= h.length ? { matched: true, rest: body.slice(i).replace(/^\s+/, "") } : { matched: false, rest: body };
}

const LIST_LINE = /^\s*(?:\d{1,2}\s*[.)/]\s+\S|\d️?⃣|[-–—•·▪◦●►▸→✓✔✅👉*+]\s+\S)/u;

/**
 * Remplace l'accroche d'un post par une variante, sans rien perdre d'autre :
 * seul le premier paragraphe est remplacé (jusqu'à la première ligne vide),
 * s'il fait au plus 210 caractères et ne contient aucune ligne de liste ;
 * sinon, seule la première ligne. Les sauts de ligne qui suivent sont gardés
 * tels quels (une liste qui démarre juste après reste une liste).
 */
export function replaceLinkedInHook(text: string, hook: string): string {
  const newHook = hook.trim();
  const source = String(text || "");
  if (!newHook) return source;
  const leading = source.match(/^\s*/)?.[0].length ?? 0;
  const body = source.slice(leading);
  const lines = body.split("\n");
  // Pas de ligne d'accroche (post vide ou qui commence par une liste) : on
  // ajoute l'accroche au-dessus, sans rien retirer.
  if (!body.trim() || LIST_LINE.test(lines[0])) return newHook + (body.trim() ? "\n\n" + body : "");
  let count = 0;
  let length = 0;
  for (const line of lines) {
    if (!line.trim()) break;
    if (LIST_LINE.test(line)) break;
    count++;
    length += line.length + (count > 1 ? 1 : 0);
  }
  if (count > 1 && length > LINKEDIN_HOOK_MAX) length = lines[0].length;
  return newHook + body.slice(length);
}
