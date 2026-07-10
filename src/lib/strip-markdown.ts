/**
 * Nettoyage déterministe du markdown résiduel dans les contenus destinés
 * au texte brut (newsletter/email). Filet de sécurité côté rendu : couvre
 * les contenus déjà stockés avec du markdown et le chemin « adjust » de
 * creative-flow qui ne passe pas par la branche newsletter de l'edge.
 *
 * Copie edge : supabase/functions/_shared/strip-markdown.ts (garder en sync).
 */
export function stripInlineMarkdown(text: string): string {
  if (!text) return text;
  let out = text;

  // Gras/italique par paires, du délimiteur le plus long au plus court.
  // Règle markdown : pas d'espace collé aux délimiteurs — épargne « 2 * 3 = 6 ».
  out = out.replace(/\*\*\*(\S(?:[^*\n]*\S)?)\*\*\*/g, "$1");
  out = out.replace(/\*\*(\S(?:[^*\n]*\S)?)\*\*/g, "$1");
  out = out.replace(/\*(\S(?:[^*\n]*\S)?)\*/g, "$1");
  out = out.replace(/___(\S(?:[^_\n]*\S)?)___/g, "$1");
  out = out.replace(/__(\S(?:[^_\n]*\S)?)__/g, "$1");
  // _italique_ : bornes non-mot pour épargner les snake_case
  out = out.replace(/(^|[^\p{L}\p{N}_])_(\S(?:[^_\n]*\S)?)_(?![\p{L}\p{N}_])/gu, "$1$2");

  // Titres markdown en début de ligne
  out = out.replace(/^#{1,6}\s+/gm, "");

  // Liens [texte](url) → texte (url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");

  return out;
}
