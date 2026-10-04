// TEXTE INVENTÉ sur les slides d'un carrousel TEXTE (décision de Laetitia du
// 04/10/2026, carrousel de référence).
//
// Principe : la rédaction écrit le texte ; un étage séparé décide la mise en
// forme APRÈS, validée par le code, et c'est l'élément qui cède, jamais le
// texte. L'IA qui dessine le HTML peut donc illustrer une idée (étiquettes,
// cartes numérotées, ticket d'addition…), mais chaque mot visible doit venir de
// la slide. Vu dans l'outil le 04/10 : bulles de discussion « Comment tu
// travailles avec l'IA ? », barres « grosses structures / projets engagés »,
// absentes du texte. La garde du carrousel photo (stripInventedSurtitres) ne
// couvrait pas le texte.
//
// Ce que fait la garde, slide par slide :
// - le texte ancré (data-slide-text="title|body") n'est jamais touché ;
// - la mise en forme validée (étapes, motifs : data-format-block,
//   data-photo-step, data-photo-format) n'est jamais touchée ;
// - les slides à schéma (visual_schema) sont hors champ (libellés du schéma) ;
// - tout autre texte visible doit être un extrait de la slide (titre, texte,
//   champs fournis, données) : sinon l'élément qui le porte est retiré, et son
//   cadre aussi s'il ne contient plus rien de lisible. Les repères d'ordre nus
//   (« 1 », « 02 ») et les symboles (« + », « = », « → ») restent.

const SOURCE_KEYS = ["title", "body", "overlay_text", "kicker", "detail", "attribution", "cta_label", "big_number", "subtitle", "hook"];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", laquo: "«", raquo: "»", hellip: "…", mdash: "—", ndash: "–", euro: "€" };
function decode(s: string): string {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Forme de comparaison : minuscules, sans accents, chiffres groupés recollés
 * (« 2 100 » = « 2100 »), tout le reste en espaces. */
export function normalizeForMatch(t: string): string {
  return ` ${decode(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(\d)[\s  .](?=\d{3}\b)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function collectStrings(v: unknown, out: string[], depth = 0): void {
  if (depth > 6 || v == null) return;
  if (typeof v === "string" || typeof v === "number") { out.push(String(v)); return; }
  if (Array.isArray(v)) { for (const x of v) collectStrings(x, out, depth + 1); return; }
  if (typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) collectStrings(x, out, depth + 1);
}

/** Tout le texte que la slide a le droit d'afficher. */
export function slideSourceText(s: Record<string, any>): string {
  const parts: string[] = [];
  for (const k of SOURCE_KEYS) collectStrings(s?.[k], parts);
  collectStrings(s?.points, parts);
  return normalizeForMatch(parts.join(" \n "));
}

/** Un texte visible est-il permis ? Symboles et repères d'ordre nus : oui.
 * Sinon il doit être un extrait (mots entiers) du texte de la slide. */
export function isAllowedVisibleText(raw: string, source: string): boolean {
  const t = decode(raw).trim();
  if (!t || !/[\p{L}\p{N}]/u.test(t)) return true;
  if (/^0?\d{1,2}\s*[.)·:/-]?$/.test(t)) return true;
  const n = normalizeForMatch(t);
  if (n.trim() === "") return true;
  return source.includes(n);
}

/** Met à l'abri (marqueurs) les éléments dont la balise ouvrante vérifie `attr`,
 * balises imbriquées du même nom comprises. */
function protect(html: string, attr: RegExp, kept: string[]): string {
  let out = "", pos = 0;
  const open = /<([a-z][a-z0-9]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  let m: RegExpExecArray | null;
  while ((m = open.exec(html))) {
    if (m.index < pos || !attr.test(m[0])) continue;
    const tag = m[1].toLowerCase();
    if (/\/>$/.test(m[0])) continue;
    const re = new RegExp(`<(/?)${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi");
    re.lastIndex = m.index + m[0].length;
    let depth = 1, end = -1, t: RegExpExecArray | null;
    while ((t = re.exec(html))) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    if (end < 0) break;
    out += html.slice(pos, m.index) + `<!--abri-${kept.length}-->`;
    kept.push(html.slice(m.index, end));
    pos = end;
    open.lastIndex = end;
  }
  return out + html.slice(pos);
}

const MARK = "<!--texte-invente-retire-->";
const KEEP_ATTR = /data-slide-text\s*=\s*["'](?:title|body)["']|data-format-block|data-photo-step|data-photo-format/i;

/** Retire le texte inventé d'UNE slide. Retourne le HTML et le nombre d'éléments retirés. */
export function stripInventedTextFromHtml(html: string, source: string): { html: string; removed: number } {
  if (!html) return { html, removed: 0 };
  const kept: string[] = [];
  let out = protect(html, /^<(?:style|script|title|head)\b/i, kept);
  out = protect(out, KEEP_ATTR, kept);
  let removed = 0;
  // 1) Élément feuille (sans balise dedans) dont le texte n'est pas dans la slide.
  out = out.replace(/<([a-z][a-z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([^<]*)<\/\1>/gi, (m: string, _t: string, _a: string, txt: string) => {
    if (isAllowedVisibleText(txt, source)) return m;
    removed++;
    return MARK;
  });
  // 2) Texte libre entre deux balises (hors feuille), même règle.
  out = out.replace(/>([^<]+)</g, (m: string, txt: string) => {
    if (isAllowedVisibleText(txt, source)) return m;
    removed++;
    return `>${MARK}<`;
  });
  if (!removed) return { html, removed: 0 };
  // 3) Cadres vidés (il ne reste que des marques, des espaces, des traits SVG
  //    ou des éléments vides) : retirés aussi, sur trois niveaux au plus. Le
  //    fond de slide et tout ce qui porte une photo ou du texte restent.
  const emptied = new RegExp(`<(div|span|figure|p|section|aside|blockquote)\\b(?![^>]*data-pptx-shape="background")(?:[^>"']|"[^"]*"|'[^']*')*>(?:\\s|${MARK}|<svg\\b[\\s\\S]*?<\\/svg>|<(div|span)\\b[^>]*>\\s*<\\/\\2>)*${MARK}(?:\\s|${MARK}|<svg\\b[\\s\\S]*?<\\/svg>|<(div|span)\\b[^>]*>\\s*<\\/\\3>)*<\\/\\1>`, "gi");
  for (let k = 0; k < 3; k++) {
    const next = out.replace(emptied, (m: string) => /<!--abri-|data-pptx-photo|\{\{PHOTO_|<img\b/i.test(m) ? m : MARK);
    if (next === out) break;
    out = next;
  }
  out = out.split(MARK).join("");
  for (let k = 0; k < 4 && /<!--abri-\d+-->/.test(out); k++) out = out.replace(/<!--abri-(\d+)-->/g, (_m: string, i: string) => kept[Number(i)]);
  return { html: out, removed };
}

/** Garde sur tout le carrousel TEXTE (jamais photo ni mixte). */
export function stripInventedSlideText(result: any, params: { isText: boolean; slides: any[] }): void {
  if (!params.isText || !Array.isArray(result?.slides_html)) return;
  const bySlide = new Map<number, any>();
  (params.slides || []).forEach((s: any, i: number) => bySlide.set(Number(s?.slide_number) || i + 1, s));
  const touched: number[] = [];
  let total = 0;
  result.slides_html = result.slides_html.map((slide: any) => {
    const src = bySlide.get(Number(slide?.slide_number));
    if (!src || src.visual_schema || /^photo/.test(String(src.slide_type || "")) || typeof slide?.html !== "string") return slide;
    const { html, removed } = stripInventedTextFromHtml(slide.html, slideSourceText(src));
    if (!removed) return slide;
    total += removed;
    touched.push(Number(slide.slide_number));
    return { ...slide, html };
  });
  if (total) console.log(JSON.stringify({ event: "carousel_invented_text_removed", removed: total, slides: touched }));
}
