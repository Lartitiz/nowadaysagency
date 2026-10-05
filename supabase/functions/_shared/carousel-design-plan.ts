/** A sequence is planned once, before chunking. No model call or user-data writes.
 * Geometry is deliberately separate from copy: an over-budget slide returns null
 * from the composer and uses the existing reference/schema-aware model renderer. */
export type EditorialLayout = "opening" | "essay" | "offset" | "statement" | "split" | "closing" | "schema" | "photo";
export interface DesignBeat {
  slide_number: number;
  layout: EditorialLayout;
  alignment: "left" | "center";
  density: "low" | "medium" | "high";
  /** Fond inversé : seulement quand l'étage « design au service du sens » juge
   * que le TEXTE marque une rupture (décision de Laetitia du 04/10/2026 : plus
   * de slide à fond plein imposée par la position ni par le nombre de slides). */
  inverted: boolean;
  /** Groupe de mots du titre (de l'accroche pour la couverture) en italique,
   * couleur d'accent. Extrait EXACT, validé par le code (validExtract). */
  accent?: string;
  /** Un seul mot ou groupe du texte surligné. Extrait EXACT, validé par le code. */
  highlight?: string;
}
export interface CarouselDesignPlan {
  version: 2;
  direction: "editorial";
  sequence: DesignBeat[];
  constraints: { maxCentered: number; maxPills: number; maxCardSlides: number };
}
import type { PhotoFormat } from "./photo-format-types.ts";
import { motifHeight, motifSvg, STEP_HEADER_H, stepHeader } from "./format-render.ts";

type Slide = Record<string, any>;
type Charter = Record<string, any>;

const wordsOf = (t: unknown) => String(t || "").trim().split(/\s+/).filter(Boolean).length;

/** Phrases du texte, découpées sur . ! ? … suivis d'une espace (extraits exacts). */
export function sentences(text: string): string[] {
  return (String(text || "").match(/[^.!?…]+(?:[.!?…]+|$)(?:\s+|$)/g) || []).map(x => x.trim()).filter(Boolean);
}

/** Phrase seule (respiration, relance, comme « Alors pourquoi je l'utilise
 * quand même ? » dans le carrousel de référence de Laetitia) : une seule phrase
 * courte, sans titre ET texte. C'est le TEXTE qui décide, jamais la position. */
export function isSingleSentence(s: Slide): boolean {
  const title = String(s.title || "").trim(), body = String(s.body || "").trim();
  const text = title && body ? "" : title || body;
  return !!text && wordsOf(text) <= 14 && sentences(text).length === 1;
}

/** Plan de REPLI, calculé par le code (décision de Laetitia du 04/10/2026) :
 * fond uni partout, aucune forme attribuée selon la position de la slide (fin
 * de la rotation des six traitements de #1348 et de la slide à fond plein
 * obligatoire dès 5 slides). Une phrase seule passe en très grand, tout le
 * reste en texte nu. L'étage « design au service du sens »
 * (carousel-sense-design.ts) change ensuite la forme d'une slide selon le sens
 * de son texte ; sans réponse exploitable, ce plan reste tel quel. */
export function buildCarouselDesignPlan(slides: Slide[]): CarouselDesignPlan {
  const sequence = slides.map((s, i): DesignBeat => {
    const words = wordsOf(s.body || s.overlay_text);
    let layout: EditorialLayout;
    if (/^photo/.test(s.slide_type || "")) layout = "photo";
    else if (s.visual_schema) layout = "schema";
    else if (i === 0) layout = "opening";
    else if (isSingleSentence(s)) layout = "statement";
    else if (i === slides.length - 1 && slides.length > 1) layout = "closing";
    else layout = "essay";
    return { slide_number: Number(s.slide_number) || i + 1, layout, alignment: layout === "opening" || layout === "statement" ? "center" : "left", density: words > 65 ? "high" : words > 30 ? "medium" : "low", inverted: false };
  });
  return { version: 2, direction: "editorial", sequence, constraints: { maxCentered: Math.max(1, Math.floor(slides.length / 3)), maxPills: 1, maxCardSlides: Math.max(1, Math.floor(slides.length / 3)) } };
}

const LAYOUT_LABEL: Record<EditorialLayout, string> = {
  opening: "couverture", essay: "texte", offset: "texte", split: "texte", closing: "dernière slide",
  statement: "phrase seule, en très grand", schema: "schéma", photo: "photo",
};
const DENSITY_LABEL = { low: "faible", medium: "moyenne", high: "forte" } as const;

/** Plan transmis à l'IA qui dessine les slides. Aucune forme n'est attribuée
 * d'avance : c'est le sens du texte qui décide, slide par slide. */
export function describeCarouselDesignPlan(plan: CarouselDesignPlan): string {
  return `PLAN DU CARROUSEL : mêmes polices, palette et grille sur toutes les slides ; fond uni par défaut.
${plan.sequence.map(s => `Slide ${s.slide_number} : ${LAYOUT_LABEL[s.layout]}, densité ${DENSITY_LABEL[s.density]}`).join("\n")}
Aucune forme n'est imposée par la position de la slide : pour chacune, c'est le SENS du texte qui décide. Quand le design peut montrer l'idée (une énumération, un enchaînement, un prix, un calcul, une perte), montre-la ; sinon le texte seul, sobre, très grand et lisible. Une rupture de fond seulement quand le texte marque une rupture. Le bloc titre + texte est centré verticalement, jamais collé en haut avec un grand vide dessous, et occupe toute la largeur utile (au moins 840px).
Les références et interdits explicites de la marque restent prioritaires. Au plus ${plan.constraints.maxPills} pastille. Le texte source reste intégral et inchangé. Aucun remplissage artificiel du bas de page. Les schémas conservent toutes leurs relations et données. Les photos gardent l'ordre et le type choisis.`;
}

/** Position d'un extrait dans le texte, apostrophes courbes et espaces
 * insécables confondues (remplacements d'un caractère par un caractère : les
 * index valent pour le texte d'origine). */
export function locateExtract(text: string, extract: unknown): [number, number] | null {
  if (typeof extract !== "string") return null;
  const fold = (t: string) => t.replace(/[’‘ʼ]/g, "'").replace(/[  ]/g, " ");
  const x = fold(extract.trim());
  if (!x) return null;
  const at = fold(String(text || "")).indexOf(x);
  return at < 0 ? null : [at, at + x.length];
}

/** Un extrait mis en valeur : présent tel quel dans le texte, plus court que le
 * texte entier, au plus `maxWords` mots. Sinon rien : l'élément cède, jamais le
 * texte. Retourne l'extrait tel qu'il est écrit dans le texte. */
export function validExtract(text: string, extract: unknown, maxWords: number): string | undefined {
  const at = locateExtract(text, extract);
  if (!at) return undefined;
  const piece = String(text).slice(at[0], at[1]);
  const n = wordsOf(piece);
  if (!/[\p{L}\p{N}]/u.test(piece) || n > maxWords || n >= wordsOf(text)) return undefined;
  return piece;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const color = (c: unknown, fallback: string) => /^#[\da-f]{6}$/i.test(String(c)) ? String(c) : fallback;
function luminance(c: string) {
  const rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
function readable(preferred: string, bg: string) {
  if (contrast(preferred, bg) >= 4.5) return preferred;
  return contrast("#1A1A1A", bg) >= contrast("#FFFFFF", bg) ? "#1A1A1A" : "#FFFFFF";
}
function font(value: unknown, fallback: string) {
  return String(value || fallback).replace(/[^\p{L}\p{N} ._-]/gu, "").trim() || fallback;
}
/** Conservative estimate, including explicit newlines and unbreakable words.
 * This only selects a layout; the browser QA still measures the actual font. */
function lines(text: string, width: number, size: number) {
  const capacity = Math.max(1, Math.floor(width / (size * .59)));
  return text.split("\n").reduce((sum, paragraph) => {
    let count = 1, used = 0;
    for (const word of paragraph.split(/\s+/)) {
      if (word.length > capacity) { count += Math.floor(word.length / capacity); used = word.length % capacity; }
      else if (used && used + word.length + 1 > capacity) { count++; used = word.length; }
      else used += word.length + (used ? 1 : 0);
    }
    return sum + count;
  }, 0);
}

/** Couleur d'accent pour un grand texte en italique : la couleur principale de
 * la charte si elle se lit sur le fond (3:1 suffit pour un texte de plus de
 * 60px), sinon la couleur du titre (l'italique seul porte alors l'accent). */
function accentInk(ch: Charter, bg: string, fallback: string) {
  const c = color(ch.color_primary, "");
  return c && contrast(c, bg) >= 3 ? c : fallback;
}
/** Texte échappé avec, au plus, un extrait enveloppé dans un <span> stylé. Le
 * texte rendu reste identique au texte source (garde verbatim, édition live). */
function emphasize(text: string, extract: string | undefined, style: string): string {
  const at = extract ? locateExtract(text, extract) : null;
  if (!at) return escape(text);
  return `${escape(text.slice(0, at[0]))}<span style="${style}">${escape(text.slice(at[0], at[1]))}</span>${escape(text.slice(at[1]))}`;
}
/** Accroche d'une couverture PHOTO ou MIXTE (socle, règle 7 : couverture =
 * accroche + un mot clé, quand le gabarit le permet) : le mot clé
 * (`cover_accent`, extrait exact et court, validé ici) passe en italique, sans
 * changer de couleur (sur photo, une couleur d'accent n'est pas garantie
 * lisible). Absent ou invalide : le texte échappé tel quel. */
export function coverHookWithAccent(hook: string, accent: unknown): string {
  return emphasize(hook, validExtract(hook, accent, coverAccentMaxWords(wordsOf(hook))), "font-style:italic");
}
/** Groupe de mots en italique sur la couverture : au plus 60 % de l'accroche,
 * 5 mots au plus (« l'IA générative » dans « Oui, j'utilise l'IA générative. »). */
export const coverAccentMaxWords = (hookWords: number) => Math.min(5, Math.max(1, Math.ceil(hookWords * .6)));

/**
 * Couverture d'un carrousel texte : l'accroche en très grand et le sous-titre
 * facultatif, centrés sur l'aplat de charte. Utilisée par la composition par le
 * code ET, pour la slide 1, à la place du HTML dessiné par l'IA (test réel du
 * 04/10 : l'IA ajoutait une illustration décorative sur la couverture).
 * Décision de Laetitia du 04/10/2026 (carrousel de référence) : taille jusqu'à
 * 168px pour 4-5 mots, et UN groupe de mots de l'accroche en italique couleur
 * d'accent (`accent`, extrait exact validé ici ; absent ou invalide → aucun).
 * null si le texte ne tient pas (texte fourni très long).
 */
export function composeCoverSlide(slide: Slide, ch: Charter, slideNumber: number, bgOverride?: string | null, accent?: string | null): { slide_number: number; html: string } | null {
  const title = String(slide.title || slide.overlay_text || "").trim();
  const body = String(slide.title || slide.overlay_text ? slide.body || slide.detail || "" : slide.body || "").trim();
  const hook = title || body, sub = title ? body : "";
  if (!hook) return null;
  const bg = color(bgOverride || ch.color_background, "#FFFFFF");
  const ink = readable(color(ch.color_text, "#1A1A1A"), bg);
  const heading = readable(color(ch.color_secondary, ink), bg);
  const titleFont = font(ch.font_title, "Libre Baskerville");
  const bodyFont = font(ch.font_body, "IBM Plex Sans");
  const n = wordsOf(hook);
  let size = n <= 5 ? 168 : n <= 7 ? 148 : n <= 9 ? 128 : n <= 12 ? 112 : 96;
  while (size > 72 && lines(hook, 920, size) > 5) size -= 4;
  const hh = Math.ceil(lines(hook, 920, size) * size * 1.12);
  const sh = sub ? 48 + Math.ceil(lines(sub, 780, 40) * 40 * 1.4) : 0;
  if (hh + sh > 1050) return null;
  const acc = validExtract(hook, accent, coverAccentMaxWords(n));
  // Bloc en flux centré (comme la couverture du mixte) : l'estimation des
  // lignes sert seulement à vérifier que tout tient.
  const field = title ? "title" : "body";
  const block = (f: "title" | "body", inner: string, px: number, family: string, c: string, lh: number, weight: number, extra: string) => `<${f === "title" ? "h1" : "p"} data-slide-text="${f}" data-pptx-editable="${f}" style="margin:0;font-family:'${family}';font-size:${px}px;font-weight:${weight};line-height:${lh};color:${c};white-space:pre-wrap;overflow-wrap:anywhere;text-align:center;${extra}">${inner}</${f === "title" ? "h1" : "p"}>`;
  const imports = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(titleFont)}:ital,wght@0,400;1,400&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap">`;
  const hookHtml = emphasize(hook, acc, `font-style:italic;color:${accentInk(ch, bg, heading)}`);
  return { slide_number: slideNumber, html: `${imports}<div data-pptx-shape="background" data-carousel-layout="opening" data-design-version="1" style="width:1080px;height:1350px;position:relative;overflow:hidden;background:${bg};font-family:'${bodyFont}';color:${ink};"><div data-cover="1" style="position:absolute;top:0;left:0;width:1080px;height:1350px;padding:150px 80px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;">${block(field, hookHtml, size, titleFont, heading, 1.12, 400, "max-width:920px;")}${sub ? block("body", escape(sub), 40, bodyFont, ink, 1.4, 500, "margin-top:48px;max-width:780px;") : ""}</div></div>` };
}

/** Tailles alignées sur le carrousel de référence de Laetitia (04/10/2026,
 * rapportées à 1080px de large) : titres 92 à 150px, texte 46 à 52px. La taille
 * ne baisse que si la slide reste longue (estimation des lignes plus bas). */
export function editorialTitleSize(title: string, statement: boolean): number {
  const n = wordsOf(title);
  if (statement) return n <= 6 ? 150 : n <= 10 ? 132 : 112;
  return n <= 6 ? 120 : n <= 12 ? 104 : 92;
}
export function editorialBodySize(body: string): number {
  const n = wordsOf(body);
  return n <= 25 ? 52 : n <= 45 ? 50 : 46;
}

/** Curated layouts for plain text. Custom references, schemas and photos are
 * intentionally handled by their specialized renderer, never flattened here. */
export function composeEditorialSlide(slide: Slide, beat: DesignBeat, ch: Charter, format?: PhotoFormat | null): { slide_number: number; html: string } | null {
  if (slide.visual_schema || /^photo/.test(slide.slide_type || "") || slide.cta_label || slide.kicker || slide.detail || slide.points || slide.big_number || slide.attribution || ch.template_layout_description || ch.texture_url || ch.visual_donts || ch.ai_generated_brief || ch.moodboard_description) return null;
  const title = String(slide.title || "");
  const body = String(slide.body || "");
  if (!title && !body) return null;
  const bg = color(beat.inverted ? ch.color_secondary : ch.color_background, beat.inverted ? "#243746" : "#FFFFFF");
  const ink = readable(color(ch.color_text, "#1A1A1A"), bg);
  const heading = readable(color(beat.inverted ? ch.color_accent : ch.color_secondary, ink), bg);
  const titleFont = font(ch.font_title, "Libre Baskerville");
  const bodyFont = font(ch.font_body, "IBM Plex Sans");
  const type = beat.layout;
  // COUVERTURE : l'accroche en très grand et le sous-titre facultatif, centrés
  // sur l'aplat ; aucune mise en forme (étape, motif) sur la couverture.
  if (type === "opening") {
    if (format && (format.step || format.motif)) return null;
    return composeCoverSlide(slide, ch, beat.slide_number, null, beat.accent);
  }
  const statement = type === "statement";
  // Phrase seule écrite dans le texte (sans titre) : même très grande taille,
  // dans la police des titres ; le champ reste « body » (édition, export).
  const lone = statement && !title;
  const centered = statement || type === "essay" || type === "closing";
  let tx = 80, ty = type === "closing" ? 280 : 170;
  let tw = 920, bx = 80, bw = statement ? 920 : 840, by = 0;
  let fs = editorialTitleSize(title, statement);
  let bs = lone ? editorialTitleSize(body, true) : editorialBodySize(body);
  if (type === "offset") { tx = 80; tw = 830; bx = 245; bw = 755; ty = 160; }
  if (type === "split" && title.length < 85 && body.length < 260) { tw = 420; bx = 560; bw = 440; fs = 76; by = 390; ty = 190; }
  if (type === "split" && tw !== 420) { tw = 880; bx = 160; bw = 840; }
  if (type === "essay" || type === "closing") bw = 920;
  const maxLines = 5;
  while (fs > 72 && lines(title, tw, fs) > maxLines) fs -= 4;
  while (lone && bs > 72 && lines(body, bw, bs) > maxLines) bs -= 4;
  const bodyLh = lone ? 1.15 : 1.45;
  const gapOf = () => title && body ? 56 : 0;
  let th = title ? Math.ceil(lines(title, tw, fs) * fs * 1.15) : 0;
  let bh = body ? Math.ceil(lines(body, bw, bs) * bs * bodyLh) : 0;
  if (!by) by = ty + th + gapOf();
  // Bloc centré verticalement (référence de Laetitia) : titre + texte au milieu
  // de la slide, jamais collés en haut avec un grand vide dessous.
  const center = (extra = 0) => {
    const top = Math.max(140, Math.round((1350 - extra - th - gapOf() - bh) / 2));
    ty = top + extra; by = ty + th + gapOf();
    return top;
  };
  if (centered) center();
  // A long explanation gets a wider stacked layout before the model fallback.
  // Recompute every box together: reducing a font without moving the body overlaps it.
  let long = false;
  if (Math.max(ty + th, by + bh) > 1220 || lines(title, tw, fs) > 6) {
    long = true;
    tx = bx = 80; tw = bw = 920; ty = 140;
    fs = Math.min(fs, lone ? fs : 92);
    bs = Math.min(bs, lone ? bs : 46);
    const measure = () => {
      th = title ? Math.ceil(lines(title, tw, fs) * fs * 1.15) : 0;
      bh = body ? Math.ceil(lines(body, bw, bs) * bs * bodyLh) : 0;
      by = ty + th + gapOf();
    };
    measure();
    while (by + bh > 1220 && (fs > 64 || bs > 40)) {
      fs = Math.max(64, fs - 4); bs = Math.max(40, bs - 2); measure();
    }
    if (Math.max(ty + th, by + bh) > 1220 || lines(title, tw, fs) > 6) return null;
  }
  // MISE EN FORME (03/10/2026) : étape et motif posés en tête du texte, tout le
  // reste descend d'autant. Sans `format`, rendu strictement inchangé ; si le
  // tout ne tient plus, null et l'appelant garde la slide sans mise en forme.
  let pre = "";
  if (format && (format.step || format.motif)) {
    const px = title ? tx : bx, pw = title ? tw : bw;
    const motifOk = !!format.motif && pw >= 700;
    if (!format.step && !motifOk) return null;
    const ph = (format.step ? STEP_HEADER_H : 0) + (motifOk ? motifHeight(format.motif!, pw) : 0);
    let py = title ? ty : by;
    if (centered && !long) py = center(ph);
    else if (title) { ty += ph; by += ph; }
    else by += ph;
    if (Math.max(ty + th, by + bh) > 1220) return null;
    const soft = /^#[\da-f]{6}$/i.test(ink) ? `rgba(${parseInt(ink.slice(1, 3), 16)},${parseInt(ink.slice(3, 5), 16)},${parseInt(ink.slice(5, 7), 16)},.32)` : ink;
    pre = `<div data-format-block="1" style="${centered && !long ? "" : `position:absolute;left:${px}px;top:${py}px;`}width:${pw}px;text-align:${beat.alignment};">` +
      (format.step ? stepHeader(format.step, heading) : "") +
      (motifOk ? motifSvg(format.motif!, { ink, soft, accent: heading }, { title: `'${titleFont}', serif`, body: `'${bodyFont}', sans-serif` }) : "") + `</div>`;
  }
  const align = beat.alignment;
  // Mises en valeur choisies selon le SENS (étage carousel-sense-design.ts),
  // extraits exacts revalidés ici : un groupe du titre en italique couleur
  // d'accent, un seul mot ou groupe du texte surligné.
  const titleAccent = validExtract(title, beat.accent, 5);
  const hl = color(ch.color_accent, "");
  const bodyHighlight = !beat.inverted && hl && contrast(ink, hl) >= 4.5 ? validExtract(body, beat.highlight, 6) : undefined;
  const titleInner = emphasize(title, titleAccent, `font-style:italic;color:${accentInk(ch, bg, heading)}`);
  const bodyInner = lone ? emphasize(body, validExtract(body, beat.accent, 5), `font-style:italic;color:${accentInk(ch, bg, heading)}`)
    : emphasize(body, bodyHighlight, `background:linear-gradient(transparent 58%, ${hl} 58%);padding:0 4px`);
  const textBlock = (field: "title" | "body", inner: string, text: string, x: number, y: number, w: number, size: number, family: string, c: string, lineHeight: number) => text ? `<${field === "title" ? "h1" : "p"} data-slide-text="${field}" data-pptx-editable="${field}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;margin:0;font-family:'${family}';font-size:${size}px;font-weight:400;line-height:${lineHeight};color:${c};white-space:pre-wrap;overflow-wrap:anywhere;text-align:${align};">${inner}</${field === "title" ? "h1" : "p"}>` : "";
  const imports = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(titleFont)}:ital,wght@0,400;1,400&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap">`;
  const open = `${imports}<div data-pptx-shape="background" data-carousel-layout="${type}" data-design-version="2" style="width:1080px;height:1350px;position:relative;overflow:hidden;background:${bg};font-family:'${bodyFont}';color:${ink};">`;
  if (centered && !long) {
    // Bloc en flux, centré verticalement par le navigateur (comme la
    // couverture) : l'estimation des lignes, prudente, ne sert qu'à vérifier
    // que tout tient ; elle décalait le bloc vers le haut (rendu du 04/10).
    const flowBlock = (field: "title" | "body", inner: string, text: string, size: number, family: string, c: string, lineHeight: number, extra: string) => text ? `<${field === "title" ? "h1" : "p"} data-slide-text="${field}" data-pptx-editable="${field}" style="margin:0;width:920px;font-family:'${family}';font-size:${size}px;font-weight:400;line-height:${lineHeight};color:${c};white-space:pre-wrap;overflow-wrap:anywhere;text-align:${align};${extra}">${inner}</${field === "title" ? "h1" : "p"}>` : "";
    return { slide_number: beat.slide_number, html: `${open}<div data-text-block="1" style="position:absolute;top:0;left:0;width:1080px;height:1350px;padding:140px 80px 130px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;">${pre}${flowBlock("title", titleInner, title, fs, titleFont, heading, 1.15, pre ? "margin-top:24px;" : "")}${flowBlock("body", bodyInner, body, bs, lone ? titleFont : bodyFont, lone ? heading : ink, bodyLh, title ? "margin-top:48px;" : pre ? "margin-top:24px;" : "")}</div></div>` };
  }
  return { slide_number: beat.slide_number, html: `${open}${pre}${textBlock("title", titleInner, title, tx, ty, tw, fs, titleFont, heading, 1.15)}${textBlock("body", bodyInner, body, bx, by, bw, bs, lone ? titleFont : bodyFont, lone ? heading : ink, bodyLh)}</div>` };
}

/** Applique à un plan le choix de l'étage « design au service du sens »
 * (validé en amont par validateTextSenseDesign). Pour chaque slide, la forme
 * choisie n'est gardée que si la slide tient avec ; sinon la slide garde la
 * composition du plan de repli (l'élément cède, jamais le texte). */
export function applyTextSenseDesign(
  slides: Slide[], plan: CarouselDesignPlan, ch: Charter,
  sense: { cover_accent?: string; slides: Array<{ slide_number: number; forme: "texte" | "phrase_seule" | "rupture"; accent?: string; surligne?: string }> } | null | undefined,
): CarouselDesignPlan {
  if (!sense) return plan;
  const sequence = plan.sequence.map((beat, i) => {
    const s = slides[i];
    if (!s) return beat;
    if (beat.layout === "opening") return sense.cover_accent ? { ...beat, accent: sense.cover_accent } : beat;
    if (!["essay", "statement", "closing", "offset", "split"].includes(beat.layout)) return beat;
    const choice = sense.slides.find(c => c.slide_number === beat.slide_number);
    if (!choice) return beat;
    const next: DesignBeat = { ...beat, accent: choice.accent, highlight: choice.surligne };
    if (choice.forme === "phrase_seule" && wordsOf(`${s.title || ""} ${s.body || ""}`) <= 20) { next.layout = "statement"; next.alignment = "center"; }
    if (choice.forme === "texte" && beat.layout === "statement") { next.layout = i === slides.length - 1 ? "closing" : "essay"; next.alignment = "left"; }
    if (choice.forme === "rupture") next.inverted = true;
    if (composeEditorialSlide(s, next, ch)) return next;
    const soft = { ...beat, accent: choice.accent, highlight: choice.surligne };
    return composeEditorialSlide(s, soft, ch) ? soft : beat;
  });
  return { ...plan, sequence };
}

/** Applique la mise en forme validée aux slides texte composées par le code.
 * `base` = composition sans mise en forme (null = slide rendue ailleurs, jamais
 * touchée). Une suite d'étapes est posée entière ou pas du tout ; un motif qui
 * ne tient pas est retiré, la slide garde alors sa composition d'origine. */
export function formatEditorialSlides(
  slides: Slide[], plan: CarouselDesignPlan, ch: Charter,
  base: Array<{ slide_number: number; html: string } | null>,
  formatting: { steps: Array<{ slide_number: number; label: string }>; motifs: Array<{ slide_number: number; elements: any[]; reason: string }> } | null | undefined,
): Array<{ slide_number: number; html: string } | null> {
  if (!formatting || (!formatting.steps.length && !formatting.motifs.length)) return base;
  const idx = (n: number) => slides.findIndex((s, i) => (Number(s.slide_number) || i + 1) === n);
  const stepOf = (k: number) => ({ index: k + 1, total: formatting.steps.length, label: formatting.steps[k].label });
  const stepsOk = formatting.steps.length >= 3 && formatting.steps.every((st, k) => {
    const i = idx(st.slide_number);
    return i >= 0 && !!base[i] && !!composeEditorialSlide(slides[i], plan.sequence[i], ch, { step: stepOf(k) });
  });
  return base.map((b, i) => {
    if (!b) return b;
    const n = Number(slides[i].slide_number) || i + 1;
    const k = stepsOk ? formatting.steps.findIndex(st => st.slide_number === n) : -1;
    const m = formatting.motifs.find(x => x.slide_number === n);
    const step = k >= 0 ? stepOf(k) : undefined;
    const motif = m ? { elements: m.elements, reason: m.reason } : undefined;
    if (!step && !motif) return b;
    return (motif && composeEditorialSlide(slides[i], plan.sequence[i], ch, { step, motif }))
      || (step && composeEditorialSlide(slides[i], plan.sequence[i], ch, { step }))
      || b;
  });
}

/** Texte complet d'une slide texte, tel que lu par l'étage de mise en forme. */
export function editorialSlideText(s: Slide): string {
  return [s.title, s.body].filter(Boolean).join("\n");
}
