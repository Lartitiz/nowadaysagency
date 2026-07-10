/**
 * Nettoyage déterministe du markdown résiduel dans les contenus destinés
 * au texte brut (newsletter/email). Les modèles glissent du **gras**, de
 * l'*italique* ou des ## titres malgré les consignes ; ici on convertit
 * en texte pur sans toucher au contenu.
 *
 * Copie front : src/lib/strip-markdown.ts (runtimes séparés, garder en sync).
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

/** Applique stripInlineMarkdown aux champs texte d'un résultat newsletter. */
export function stripMarkdownFromNewsletter<T extends Record<string, unknown>>(parsed: T): T {
  const fields = ["subject", "preview_text", "content", "body", "accroche", "cta_suggestion"];
  for (const f of fields) {
    if (typeof parsed[f] === "string") {
      (parsed as Record<string, unknown>)[f] = stripInlineMarkdown(parsed[f] as string);
    }
  }
  return parsed;
}
