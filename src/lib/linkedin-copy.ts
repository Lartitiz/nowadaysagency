import { stripInlineMarkdown } from "./strip-markdown";

/**
 * Texte prêt à coller dans LinkedIn : LinkedIn n'interprète pas le markdown,
 * un **gras** glissé par l'IA serait collé en astérisques bruts. On retire
 * seulement les marques inline (gras, italique, titres « # », liens
 * [texte](url)) ; la numérotation, les puces, les sauts de ligne et les
 * hashtags restent tels quels. Les URL sont protégées (un « _ » ou « * »
 * dans un lien ne doit pas bouger).
 *
 * Même nettoyage que la publication directe :
 * supabase/functions/_shared/linkedin-graph.ts (prepareLinkedInText) — garder en sync.
 */
export function prepareLinkedInText(text: string): string {
  let out = String(text || "");
  // Liens markdown d'abord (avant de protéger les URL nues).
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
  const urls: string[] = [];
  out = out.replace(/https?:\/\/[^\s)]+/g, (url) => `\u0000${urls.push(url) - 1}\u0000`);
  out = stripInlineMarkdown(out);
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i) => urls[Number(i)]);
  return out.trim();
}

/** Vrai si le canal / format désigne LinkedIn (« linkedin », « post_linkedin », « linkedin_post »…). */
export function isLinkedInChannel(channel: string | null | undefined): boolean {
  return typeof channel === "string" && channel.toLowerCase().includes("linkedin");
}

/** Texte à copier : nettoyé pour LinkedIn si le canal est LinkedIn, sinon inchangé. */
export function copyTextForChannel(text: string, channel: string | null | undefined): string {
  return isLinkedInChannel(channel) ? prepareLinkedInText(text) : text;
}
