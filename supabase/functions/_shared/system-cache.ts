// Limite du cache dans un prompt système (audit de coût API du 20/10/2026).
//
// Avant : tout le system était mis en cache d'un bloc. Comme il contient les
// données de la cliente (fiche de marque, compteur de crédits…), chaque appel
// payait l'ÉCRITURE du cache (×1,25) sans jamais le relire.
//
// Maintenant : un constructeur de prompt place `SYSTEM_CACHE_BREAK` entre les
// règles FIXES (identiques pour toutes) et la partie propre à la cliente ou à
// la requête. Seule la partie fixe porte `cache_control` : elle est relue
// (×0,1) d'un appel à l'autre, quelle que soit la cliente ; la suite part sans
// cache. Le marqueur est retiré : le modèle lit exactement le même texte.
// Sans marqueur, comportement d'avant (tout le system en cache).

/** Marqueur de la limite (caractère de la zone privée Unicode, jamais tapé par personne). */
export const SYSTEM_CACHE_BREAK = "";

/** Retire tout marqueur d'un texte (message utilisateur, instructions OpenAI…). */
export function stripCacheBreak(text: string): string {
  return typeof text === "string" && text.includes(SYSTEM_CACHE_BREAK)
    ? text.split(SYSTEM_CACHE_BREAK).join("")
    : text;
}

export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/**
 * Blocs `system` pour l'API Anthropic. `suffix` (ex. consigne d'outil d'Opus 5.5)
 * s'ajoute à la fin, dans la partie non mise en cache s'il y a un marqueur.
 */
export function systemBlocks(system: string, suffix = ""): SystemBlock[] {
  const i = system.indexOf(SYSTEM_CACHE_BREAK);
  if (i < 0) {
    return [{ type: "text", text: system + suffix, cache_control: { type: "ephemeral" } }];
  }
  const fixe = system.slice(0, i);
  const reste = stripCacheBreak(system.slice(i + SYSTEM_CACHE_BREAK.length)) + suffix;
  const blocs: SystemBlock[] = [];
  if (fixe) blocs.push({ type: "text", text: fixe, cache_control: { type: "ephemeral" } });
  if (reste) blocs.push({ type: "text", text: reste });
  return blocs.length ? blocs : [{ type: "text", text: suffix || " " }];
}

/** Messages : retire les marqueurs d'un system recopié dans un message (réparations…). */
// deno-lint-ignore no-explicit-any
export function stripCacheBreakFromMessages<T extends { content: any }>(messages: T[]): T[] {
  let changed = false;
  const out = messages.map((m) => {
    if (typeof m.content === "string") {
      const c = stripCacheBreak(m.content);
      if (c !== m.content) { changed = true; return { ...m, content: c }; }
      return m;
    }
    if (Array.isArray(m.content)) {
      // deno-lint-ignore no-explicit-any
      const blocs = m.content.map((b: any) => {
        if (b?.type === "text" && typeof b.text === "string" && b.text.includes(SYSTEM_CACHE_BREAK)) {
          changed = true;
          return { ...b, text: stripCacheBreak(b.text) };
        }
        return b;
      });
      return changed ? { ...m, content: blocs } : m;
    }
    return m;
  });
  return changed ? out : messages;
}
