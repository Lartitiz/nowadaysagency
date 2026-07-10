// Garde DÉTERMINISTE de verbatim du texte ancré des slides HTML générées.
//
// Contrat d'ancrage (prompt carousel-visual) : l'élément data-slide-text="title|body"
// contient le texte source VERBATIM — c'est ce que patche l'édition live côté front
// (src/lib/carousel-html-edit.ts). Audit live 10/07/2026 : le modèle dévie malgré la
// règle — casse perdue (MAJUSCULES → minuscules), émojis retirés du texte, body
// ÉCLATÉ quand il contient des chiffres (fragments déplacés hors ancre), attribution
// sortie du titre. Une N-ième règle de prompt ne suffit pas : cette passe compare le
// texte rendu de chaque ancre au texte source et RÉINJECTE la source en cas d'écart.
//
// Conservateur par design :
// - on ne compare qu'après normalisation des variantes d'encodage/typographie
//   NEUTRES (espaces, apostrophes courbes, ellipse, entités HTML) → pas de churn
//   quand le rendu est fidèle à ces détails près ;
// - la réinjection remplace le CONTENU de l'élément ancré par le texte source
//   échappé — les <span> d'accent internes sautent (même compromis assumé que
//   l'édition live : le style mot-à-mot n'a plus de sens si le texte diffère) ;
// - ancre absente, champ source vide ou HTML imbriqué illisible → on ne touche rien.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…",
  laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘",
  eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ucirc: "û", ocirc: "ô", icirc: "î", acirc: "â",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

/**
 * Normalisation pour COMPARER (jamais pour réinjecter) : neutralise les variantes
 * typographiques sans signal (espaces/nbsp, apostrophes courbes, "..." vs "…").
 * La casse, les émojis, les tirets et la ponctuation significative RESTENT
 * discriminants — c'est précisément ce qu'on veut détecter.
 */
export function normalizeForCompare(s: string): string {
  return decodeEntities(s || "")
    .normalize("NFC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\.{3}/g, "…")
    .replace(/[\s ]+/g, " ")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Balise fermante correspondante, en comptant les imbrications du MÊME tag. */
function findClosingTag(
  html: string,
  tag: string,
  contentStart: number,
): { contentEnd: number; end: number } | null {
  const tagRe = new RegExp(`<(/?)${tag}(?=[\\s>/])((?:[^>"']|"[^"]*"|'[^']*')*)>`, "gi");
  tagRe.lastIndex = contentStart;
  let depth = 1;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(html))) {
    const selfClosing = /\/\s*$/.test(t[2] || "");
    if (t[1] === "/") depth--;
    else if (!selfClosing) depth++;
    if (depth === 0) return { contentEnd: t.index, end: t.index + t[0].length };
  }
  return null; // fermeture introuvable → on ne touche pas
}

/** Localise l'élément ancré : [début balise ouvrante, début contenu, début balise fermante, fin]. */
function findAnchoredElement(
  html: string,
  field: string,
): { openStart: number; contentStart: number; contentEnd: number; end: number } | null {
  const openRe = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*\\bdata-slide-text\\s*=\\s*["']${field}["'](?:[^>"']|"[^"]*"|'[^']*')*)>`,
  );
  const m = openRe.exec(html);
  if (!m) return null;
  const contentStart = m.index + m[0].length;
  const close = findClosingTag(html, m[1].toLowerCase(), contentStart);
  if (!close) return null;
  return { openStart: m.index, contentStart, contentEnd: close.contentEnd, end: close.end };
}

export interface VerbatimAnchor {
  field: "title" | "body";
  text: string;
}

/**
 * Vérifie chaque ancre contre son texte source ; réinjecte la source (échappée,
 * \n → <br>) quand le texte rendu diffère. Retourne le HTML corrigé et la liste
 * des champs réécrits.
 */
export function enforceAnchoredText(
  html: string,
  anchors: VerbatimAnchor[],
): { html: string; fixes: string[] } {
  let out = html || "";
  const fixes: string[] = [];
  for (const { field, text } of anchors) {
    const source = (text || "").trim();
    if (!source) continue;
    const loc = findAnchoredElement(out, field);
    if (!loc) continue;
    const rendered = stripTags(out.slice(loc.contentStart, loc.contentEnd));
    if (normalizeForCompare(rendered) === normalizeForCompare(source)) continue;
    const replacement = escapeHtml(source).replace(/\n/g, "<br>");
    out = out.slice(0, loc.contentStart) + replacement + out.slice(loc.contentEnd);
    fixes.push(field);
  }
  return { html: out, fixes };
}

// Balises jamais candidates à porter une ancre : conteneurs de code/style,
// vides (void elements) ou structurelles.
const ANCHOR_SKIP_TAGS = new Set([
  "script", "style", "svg", "html", "head", "body",
  "br", "hr", "img", "input", "meta", "link", "source", "track", "area", "base", "col", "embed", "wbr",
]);

/**
 * Pose l'ancre data-slide-text="<field>" quand elle MANQUE (audit 10/07 : les
 * slides à visual_schema sortent sans ancre title dans ~3 runs sur 4, l'édition
 * live retombe alors sur le repli par correspondance de texte, fragile).
 * Cherche l'élément dont le texte rendu normalisé (normalizeForCompare) égale
 * exactement le texte source ; parmi plusieurs candidats imbriqués, prend le
 * plus PETIT — celui qui contient directement le texte — pour que l'édition
 * live ne patche que lui. Texte éclaté ou réécrit → HTML inchangé ("unmatched").
 */
export function ensureAnchor(
  html: string,
  field: string,
  text: string,
): { html: string; status: "present" | "added" | "unmatched" } {
  const source = normalizeForCompare(text || "");
  if (!html || !source) return { html: html || "", status: "unmatched" };
  if (findAnchoredElement(html, field)) return { html, status: "present" };

  const openRe = /<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let best: { openStart: number; contentStart: number; size: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html))) {
    const tag = m[1].toLowerCase();
    if (ANCHOR_SKIP_TAGS.has(tag)) continue;
    if (/\/\s*$/.test(m[2] || "")) continue; // auto-fermante
    if (/\bdata-slide-text\s*=/.test(m[2] || "")) continue; // déjà ancré pour un autre champ
    const contentStart = m.index + m[0].length;
    const close = findClosingTag(html, tag, contentStart);
    if (!close) continue;
    if (normalizeForCompare(stripTags(html.slice(contentStart, close.contentEnd))) !== source) continue;
    const size = close.contentEnd - contentStart;
    if (!best || size < best.size) best = { openStart: m.index, contentStart, size };
  }
  if (!best) return { html, status: "unmatched" };
  const openTag = html.slice(best.openStart, best.contentStart);
  const patched = openTag.replace(/>$/, ` data-slide-text="${field}">`);
  return {
    html: html.slice(0, best.openStart) + patched + html.slice(best.contentStart),
    status: "added",
  };
}
