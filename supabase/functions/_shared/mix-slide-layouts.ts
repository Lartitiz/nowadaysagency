import { hexLuminance } from "./contrast-guard.ts";
import type { PhotoFormat } from "./photo-format-types.ts";
import { motifHeight, motifSvg, STEP_HEADER_H, stepHeader } from "./format-render.ts";
import { mixSchemaBlock } from "./mix-schema-render.ts";

// Composition PAR CODE du carrousel MIXTE (photos + slides texte), maquette
// validée avec Laetitia le 02/10/2026 (« Carrousel céramiste »).
//
// Le modèle a déjà écrit le récit (titre, corps, overlay, photo, type de slide) ;
// ce module ne change aucun mot. Il choisit une famille de mise en page par slide
// selon le type, la longueur du texte et la slide précédente, puis dessine :
//   couverture_aplat — aplat de charte en haut (titre), photo en bas
//   photo_aplat      — photo en haut, texte sur un aplat de charte en bas
//   passe_partout    — photo encadrée sur le fond de charte, texte dessous
//   cote_a_cote      — photo sur une colonne, texte sur l'autre
//   sur_photo        — overlay court dans un bloc de charte posé sur la photo
//   respiration      — slide texte sans photo, fond de charte
//   pause            — slide texte qui porte un SCHÉMA : aplat de charte, texte
//                      entier en haut, schéma en cartes claires dessous (piste B
//                      choisie par Laetitia le 03/10/2026, mix-schema-render.ts).
//                      Le schéma cède si le texte ne tient plus avec lui.
//   vignette         — dernier recours d'un passage très développé : photo en
//                      vignette, texte pleine largeur dessous (02/10/2026, vu en
//                      prod : un passage de 74 mots faisait basculer TOUT le
//                      carrousel sur le rendu modèle)
// Le texte n'est jamais posé sur la photo au-delà de 15 mots : un passage
// développé va à côté de l'image. Deux slides voisines ne partagent jamais la
// même famille quand une autre tient. Si aucune famille ne contient le texte,
// la fonction renvoie null et l'appelant garde le rendu par le modèle.
//
// Contrats (édition live, export PPTX hybride) :
//   - racine <div style="width:1080px;height:1350px;position:relative…">
//   - photo : élément background-image:url({{PHOTO_N}}) annoté data-pptx-photo="N"
//   - title / body / overlay VERBATIM dans data-slide-text + data-pptx-editable
//   - CTA : wrapper data-slide-cta, texte data-slide-text="cta"
//   - aplats annotés data-pptx-shape="card" (jamais un élément contenant la photo)
//
// MISE EN FORME (03/10/2026) : `mix_format` (étapes, motif libre), décidé par
// l'étage séparé de l'écriture (photo-formatting.ts), est dessiné en tête de la
// colonne de texte. Le motif exige une colonne d'au moins MOTIF_MIN_W de large
// (jamais sur la photo, jamais dans la colonne étroite du côte-à-côte).

export type MixLayout = "couverture_aplat" | "photo_aplat" | "passe_partout" | "cote_a_cote" | "sur_photo" | "respiration" | "pause" | "vignette";

export interface MixSlideSpec {
  slide_number: number;
  slide_type?: string | null; // photo_full | photo_integrated | text_only
  photo_index?: number | null;
  photo_layout?: string | null;
  title?: string | null;
  body?: string | null;
  overlay_text?: string | null;
  overlay_position?: string | null;
  cta_label?: string | null;
  visual_schema?: unknown;
  role?: string | null;
  mix_format?: PhotoFormat | null;
}

export interface MixCharter {
  color_primary?: string;
  color_secondary?: string;
  color_background?: string;
  color_text?: string;
  color_accent?: string;
  border_radius?: string | number;
  font_title?: string;
  font_body?: string;
}

export interface ComposedMixSlide {
  slide_number: number;
  html: string;
  contrast_ok: true;
  legibility: string;
  layout: MixLayout;
  /** La slide portait un visual_schema qui n'a pas pu être dessiné (texte trop long). */
  schema_dropped?: true;
}

const W = 1080;
const H = 1350;
const SIDE = 80;
const TEXT_BOTTOM = 1230; // dernière ligne de texte : 120 px du bas
const SHORT_ON_PHOTO = 15;
const MOTIF_MIN_W = 700;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const hex = (c: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : fallback;
const fontName = (v: unknown, fallback: string) => String(v || "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim() || fallback;

function contrast(a: string, b: string): number {
  const x = hexLuminance(a.slice(1)), y = hexLuminance(b.slice(1));
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function readable(preferred: string, bg: string): string {
  if (contrast(preferred, bg) >= 4.5) return preferred;
  return contrast("#1A1A1A", bg) >= contrast("#FFFFFF", bg) ? "#1A1A1A" : "#FFFFFF";
}

/** Jetons de charte. Un aplat trop pâle pour porter du texte prend la couleur
 * de titre (secondaire) ; à défaut, un encre sombre neutre. */
function tokens(ch: MixCharter) {
  const background = hex(ch.color_background, "#FFFFFF");
  const ink = readable(hex(ch.color_text, "#1A1A1A"), background);
  const heading = readable(hex(ch.color_secondary, hex(ch.color_primary, ink)), background);
  const candidates = [hex(ch.color_primary, ""), hex(ch.color_secondary, ""), hex(ch.color_accent, "")].filter(Boolean);
  const flat = candidates.find(c => contrast(c, background) >= 1.6) || (hexLuminance(background.slice(1)) > .5 ? "#1A1A1A" : "#F4F1EC");
  const onFlat = readable(background, flat);
  const radiusRaw = String(ch.border_radius ?? "").trim().toLowerCase();
  const named: Record<string, number> = { none: 0, square: 0, sharp: 0, rounded: 20, soft: 20, pill: 24, organic: 24 };
  const radius = named[radiusRaw] ?? (/^\d+(?:\.\d+)?(?:px)?$/.test(radiusRaw) ? Math.min(24, Number.parseFloat(radiusRaw)) : 16);
  return { background, ink, heading, flat, onFlat, radius,
    titleFont: fontName(ch.font_title, "Libre Baskerville"), bodyFont: fontName(ch.font_body, "IBM Plex Sans") };
}
type Tokens = ReturnType<typeof tokens>;

/** Estimation prudente du nombre de lignes (sauts de ligne et mots insécables compris). */
function lineCount(text: string, width: number, size: number): number {
  if (!text) return 0;
  const capacity = Math.max(1, Math.floor(width / (size * .56)));
  return text.split("\n").reduce((sum, paragraph) => {
    let count = 1, used = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (word.length > capacity) { count += Math.floor(word.length / capacity); used = word.length % capacity; }
      else if (used && used + word.length + 1 > capacity) { count++; used = word.length; }
      else used += word.length + (used ? 1 : 0);
    }
    return sum + count;
  }, 0);
}

interface TextParts { title: string; body: string; cta: string; field: "title_body" | "overlay"; headline?: boolean; format?: PhotoFormat | null; schema?: { html: string; height: number } | null }

/** Hauteur réservée à la mise en forme en tête d'une colonne de `width`. */
function formatHeight(p: TextParts, width: number): number {
  const f = p.format;
  const schema = p.schema && width >= MOTIF_MIN_W ? p.schema.height : 0;
  if (!f) return schema;
  return schema + (f.step ? STEP_HEADER_H : 0) + (f.motif && width >= MOTIF_MIN_W ? motifHeight(f.motif, width) : 0);
}

function softOf(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const n = (i: number) => parseInt(color.slice(i, i + 2), 16);
  return `rgba(${n(1)},${n(3)},${n(5)},.32)`;
}

function textParts(s: MixSlideSpec): TextParts {
  const cta = String(s.cta_label || "").trim();
  if (s.slide_type === "photo_full") {
    // Une slide photo_full s'édite par son overlay (CarouselPhotoResult) : on
    // n'y recompose pas un titre/corps qui ne serait pas éditable.
    const overlay = String(s.overlay_text || s.body || s.title || "");
    return { title: "", body: overlay, cta, field: "overlay", format: s.mix_format || null };
  }
  return { title: String(s.title || ""), body: String(s.body || ""), cta, field: "title_body", format: s.mix_format || null };
}

/** Bloc de texte mesuré : place titre, corps et CTA dans une colonne, en
 * descendant les tailles jusqu'aux planchers. null = ne tient pas. */
function fitColumn(p: TextParts, width: number, maxHeight: number, base: { title: number; body: number }) {
  let ts = base.title, bs = base.body;
  const minTitle = Math.min(base.title, 52), minBody = p.headline ? 56 : Math.min(base.body, 40);
  const ctaH = (p.cta ? 96 : 0) + formatHeight(p, width);
  const measure = () => {
    const th = p.title ? Math.ceil(lineCount(p.title, width, ts) * ts * 1.15) : 0;
    const bh = p.body ? Math.ceil(lineCount(p.body, width, bs) * bs * (p.headline ? 1.15 : 1.4)) : 0;
    const gap = p.title && p.body ? Math.round(bs * .9) : 0;
    return { th, bh, total: th + gap + bh + ctaH, gap };
  };
  let m = measure();
  while (m.total > maxHeight && (ts > minTitle || bs > minBody)) {
    if (ts > minTitle) ts = Math.max(minTitle, ts - 4);
    if (bs > minBody) bs = Math.max(minBody, bs - 2);
    m = measure();
  }
  if (m.total > maxHeight) return null;
  return { ts, bs, ...m };
}

function column(p: TextParts, t: Tokens, fit: NonNullable<ReturnType<typeof fitColumn>>, box: { x: number; y: number; w: number }, colors: { heading: string; ink: string; ctaBg: string; ctaInk: string }, align: "left" | "center" = "left"): string {
  const common = `margin:0;font-weight:400;white-space:pre-wrap;overflow-wrap:anywhere;text-align:${align};`;
  const title = p.title ? `<h1 data-slide-text="title" data-pptx-editable="title" style="${common}font-family:'${t.titleFont}', Georgia, serif;font-size:${fit.ts}px;line-height:1.15;letter-spacing:-.01em;color:${colors.heading};">${escapeHtml(p.title)}</h1>` : "";
  const field = p.field === "overlay" ? "overlay" : "body";
  // headline : texte court seul (accroche d'une couverture photo_full) composé
  // comme un titre, mais ancré dans son champ d'origine (overlay) pour l'édition.
  const bodyType = p.headline
    ? `font-family:'${t.titleFont}', Georgia, serif;font-size:${fit.bs}px;line-height:1.15;letter-spacing:-.01em;color:${colors.heading};`
    : `font-family:'${t.bodyFont}', sans-serif;font-size:${fit.bs}px;line-height:1.4;color:${colors.ink};`;
  const body = p.body ? `<p data-slide-text="${field}" data-pptx-editable="${field}" style="${common}${bodyType}${p.title ? `margin-top:${fit.gap}px;` : ""}">${escapeHtml(p.body)}</p>` : "";
  const cta = p.cta ? `<div data-slide-cta="1" style="margin-top:32px;"><span data-slide-text="cta" data-pptx-editable="caption" style="display:inline-block;background:${colors.ctaBg};color:${colors.ctaInk};border-radius:${Math.min(t.radius, 16)}px;padding:14px 22px;font-family:'${t.bodyFont}', sans-serif;font-size:32px;line-height:1.3;">${escapeHtml(p.cta)}</span></div>` : "";
  const f = p.format;
  const pre = (f?.step ? stepHeader(f.step, colors.heading) : "") +
    (f?.motif && box.w >= MOTIF_MIN_W ? motifSvg(f.motif, { ink: colors.ink, soft: softOf(colors.ink), accent: colors.heading }, { title: `'${t.titleFont}', Georgia, serif`, body: `'${t.bodyFont}', sans-serif` }) : "");
  const schema = p.schema && box.w >= MOTIF_MIN_W ? p.schema.html : "";
  return `<div data-mix-text="1" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;">${pre}${title}${body}${schema}${cta}</div>`;
}

function photoBox(n: number, box: { x: number; y: number; w: number; h: number }, radius = 0): string {
  return `<div data-pptx-photo="${n}" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;background-image:url({{PHOTO_${n}}});background-size:cover;background-position:center;${radius ? `border-radius:${radius}px;` : ""}"></div>`;
}

function flatBox(color: string, box: { x: number; y: number; w: number; h: number }): string {
  return `<div data-pptx-shape="card" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;background:${color};border-radius:0px;"></div>`;
}

function root(t: Tokens, layout: MixLayout, bg: string, inner: string): string {
  return `<div data-carousel-layout="mix-${layout}" data-design-version="mix-1" style="width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${bg};font-family:'${t.bodyFont}', sans-serif;color:${t.ink};">${inner}</div>`;
}

// ── Familles ────────────────────────────────────────────────────────────────

function couvertureAplat(p: TextParts, n: number, t: Tokens): string | null {
  // L'aplat prend la hauteur du titre, la photo garde au moins 52 % de la slide.
  const maxFlat = Math.round(H * .48);
  if (!p.title && words(p.body) <= 20) p = { ...p, headline: true };
  const fit = fitColumn(p, W - 2 * SIDE, maxFlat - 200, p.headline ? { title: 92, body: 92 } : { title: 92, body: 40 });
  if (!fit) return null;
  const flatH = Math.max(420, 110 + fit.total + 90);
  const colors = { heading: t.onFlat, ink: t.onFlat, ctaBg: t.background, ctaInk: t.ink };
  return root(t, "couverture_aplat", t.flat,
    flatBox(t.flat, { x: 0, y: 0, w: W, h: flatH }) +
    photoBox(n, { x: 0, y: flatH, w: W, h: H - flatH }) +
    column(p, t, fit, { x: SIDE, y: 110, w: W - 2 * SIDE }, colors));
}

function photoAplat(p: TextParts, n: number, t: Tokens): string | null {
  // Texte court → la photo prend la place ; texte développé → l'aplat grandit.
  for (const photoH of [860, 780, 700, 620, 540, 460]) {
    const fit = fitColumn(p, W - 2 * SIDE, TEXT_BOTTOM - (photoH + 72), { title: 64, body: 44 });
    if (!fit) continue;
    const colors = { heading: t.onFlat, ink: t.onFlat, ctaBg: t.background, ctaInk: t.ink };
    return root(t, "photo_aplat", t.flat,
      photoBox(n, { x: 0, y: 0, w: W, h: photoH }) +
      flatBox(t.flat, { x: 0, y: photoH, w: W, h: H - photoH }) +
      column(p, t, fit, { x: SIDE, y: photoH + Math.max(72, Math.round((TEXT_BOTTOM + 60 - photoH - fit.total) / 2)), w: W - 2 * SIDE }, colors));
  }
  return null;
}

function passePartout(p: TextParts, n: number, t: Tokens): string | null {
  const m = 70;
  for (const photoH of [820, 720, 620]) {
    const top = m + photoH + 56;
    const fit = fitColumn(p, W - 2 * SIDE, TEXT_BOTTOM + 20 - top, { title: 56, body: 44 });
    if (!fit) continue;
    const colors = { heading: t.heading, ink: t.ink, ctaBg: t.flat, ctaInk: t.onFlat };
    return root(t, "passe_partout", t.background,
      photoBox(n, { x: m, y: m, w: W - 2 * m, h: photoH }, t.radius) +
      column(p, t, fit, { x: SIDE, y: top, w: W - 2 * SIDE }, colors));
  }
  return null;
}

function coteACote(p: TextParts, n: number, t: Tokens, side: "left" | "right"): string | null {
  const photoW = 470, gap = 70;
  const textW = W - photoW - gap - SIDE;
  const fit = fitColumn(p, textW, TEXT_BOTTOM - 120, { title: 56, body: 42 });
  if (!fit) return null;
  const y = Math.max(120, Math.round((H - fit.total) / 2) - 20);
  const textX = side === "left" ? photoW + gap : SIDE;
  const colors = { heading: t.heading, ink: t.ink, ctaBg: t.flat, ctaInk: t.onFlat };
  return root(t, "cote_a_cote", t.background,
    photoBox(n, { x: side === "left" ? 0 : W - photoW, y: 0, w: photoW, h: H }) +
    column(p, t, fit, { x: textX, y, w: textW }, colors));
}

function respiration(p: TextParts, t: Tokens, inverted: boolean): string | null {
  const bg = inverted ? t.flat : t.background;
  const fit = fitColumn(p, W - 2 * SIDE, TEXT_BOTTOM - 170, { title: 84, body: 46 });
  if (!fit) return null;
  const colors = inverted
    ? { heading: t.onFlat, ink: t.onFlat, ctaBg: t.background, ctaInk: t.ink }
    : { heading: t.heading, ink: t.ink, ctaBg: t.flat, ctaInk: t.onFlat };
  const y = Math.max(170, Math.round((H - fit.total) / 2) - 40);
  return root(t, "respiration", bg, column(p, t, fit, { x: SIDE, y, w: W - 2 * SIDE }, colors));
}

/** Slide « pause » (piste B) : aplat de charte, texte entier, schéma en cartes
 * claires dessous. null si le texte ne tient pas avec le schéma. */
function pause(p: TextParts, t: Tokens, schema: unknown): string | null {
  const w = W - 2 * SIDE;
  const block = mixSchemaBlock(schema, w, {
    card: t.background, cardAlt: mixHex(t.flat, t.background, .16), ink: t.ink,
    soft: softOf(t.ink).replace(/,\.32\)$/, ",.18)"), accent: readable(t.flat, t.background) === t.flat ? t.flat : t.ink,
  }, { title: `'${t.titleFont}', Georgia, serif`, body: `'${t.bodyFont}', sans-serif` }, t.radius);
  if (!block) return null;
  const q = { ...p, schema: block };
  const fit = fitColumn(q, w, TEXT_BOTTOM - 130, { title: 72, body: 42 });
  if (!fit) return null;
  const colors = { heading: t.onFlat, ink: t.onFlat, ctaBg: t.background, ctaInk: t.ink };
  const y = Math.max(130, Math.round((H - fit.total) / 2) - 20);
  return root(t, "pause", t.flat, column(q, t, fit, { x: SIDE, y, w }, colors));
}

/** Le texte de cette slide texte tient-il avec ce schéma en slide « pause » ?
 * Les mesures ne dépendent pas des couleurs : charte neutre. Sert à l'étage de
 * schémas pour ne proposer un schéma que là où il sera vraiment dessiné. */
export function mixPauseFits(s: MixSlideSpec, schema: unknown): boolean {
  return !!pause(textParts({ ...s, slide_type: "text_only" }), tokens({}), schema);
}
/** Schéma témoin (récapitulatif de trois éléments courts) : une slide qui ne le
 * contient pas n'a pas la place pour un schéma. */
export const MIX_SCHEMA_ROOM_PROBE = { type: "checklist", items: [{ text: "un élément court" }, { text: "un élément court" }, { text: "un élément court" }] };

/** Mélange deux couleurs hex (part `k` de la première). */
function mixHex(a: string, b: string, k: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return b;
  const c = (x: string, i: number) => parseInt(x.slice(i, i + 2), 16);
  return "#" + [1, 3, 5].map(i => Math.round(c(a, i) * k + c(b, i) * (1 - k)).toString(16).padStart(2, "0")).join("");
}

/** Overlay court : photo plein cadre, texte dans un bloc plein de la charte
 * posé en haut ou en bas à gauche (position choisie à la rédaction). */
function surPhoto(p: TextParts, n: number, t: Tokens, position: string | null | undefined): string | null {
  const pad = 44, maxText = 700;
  const fit = fitColumn(p, maxText, 520, { title: 56, body: 52 });
  if (!fit) return null;
  const longest = Math.max(...[p.title, p.body].filter(Boolean).map(x => Math.min(x.length, Math.floor(maxText / (fit.bs * .56)))));
  const textW = Math.min(maxText, Math.max(360, Math.ceil(longest * fit.bs * .56)));
  const blockH = fit.total + 2 * pad;
  const top = /^top/.test(String(position || "")) ? 96 : H - 200 - blockH;
  const colors = { heading: t.onFlat, ink: t.onFlat, ctaBg: t.background, ctaInk: t.ink };
  return root(t, "sur_photo", t.background,
    photoBox(n, { x: 0, y: 0, w: W, h: H }) +
    `<div data-pptx-shape="card" style="position:absolute;left:64px;top:${top}px;width:${textW + 2 * pad}px;height:${blockH}px;background:${t.flat};border-radius:${t.radius}px;"></div>` +
    column(p, t, fit, { x: 64 + pad, y: top + pad, w: textW }, colors));
}

/** Passage très développé : la photo reste présente (association conservée)
 * en vignette, le texte prend toute la largeur. */
function vignette(p: TextParts, n: number, t: Tokens): string | null {
  for (const h of [400, 300, 220]) {
    const photo = { x: SIDE, y: 96, w: Math.round(h * .8), h };
    const top = photo.y + photo.h + 48;
    const fit = fitColumn(p, W - 2 * SIDE, TEXT_BOTTOM + 30 - top, { title: 52, body: 42 });
    if (!fit) continue;
    const colors = { heading: t.heading, ink: t.ink, ctaBg: t.flat, ctaInk: t.onFlat };
    return root(t, "vignette", t.background,
      photoBox(n, photo, t.radius) +
      column(p, t, fit, { x: SIDE, y: top, w: W - 2 * SIDE }, colors));
  }
  return null;
}

// ── Choix de la famille ─────────────────────────────────────────────────────

function preferredPhotoLayouts(s: MixSlideSpec, previous: MixLayout | null, nextIsPause = false): MixLayout[] {
  const layout = String(s.photo_layout || "");
  // À côté d'une slide « pause » (aplat de charte), la photo passe sur fond
  // clair : deux aplats voisins effaceraient l'alternance.
  if (previous === "pause" || nextIsPause) {
    const light: MixLayout[] = /left_photo|right_photo/.test(layout) ? ["cote_a_cote", "passe_partout", "photo_aplat"] : ["passe_partout", "cote_a_cote", "photo_aplat"];
    return light;
  }
  const order: MixLayout[] =
    /left_photo|right_photo/.test(layout) ? ["cote_a_cote", "photo_aplat", "passe_partout"]
    : /card_photo/.test(layout) ? ["passe_partout", "photo_aplat", "cote_a_cote"]
    : /top_photo|banner_photo/.test(layout) ? ["photo_aplat", "passe_partout", "cote_a_cote"]
    : previous === "photo_aplat" ? ["passe_partout", "photo_aplat", "cote_a_cote"]
    : ["photo_aplat", "passe_partout", "cote_a_cote"];
  // Jamais deux fois la même famille d'affilée quand une autre tient.
  return previous ? [...order.filter(l => l !== previous), ...order.filter(l => l === previous)] : order;
}

/**
 * Compose une slide du carrousel mixte. `previous` = famille de la slide
 * précédente (rythme). Un schéma (visual_schema) sur une slide texte la
 * dessine en « pause » ; renvoie null seulement quand aucune famille ne contient
 * son texte.
 */
export function composeMixSlide(
  s: MixSlideSpec,
  charter: MixCharter,
  opts: { isFirst: boolean; isLast: boolean; previous: MixLayout | null; photoCount: number; nextIsPause?: boolean },
): ComposedMixSlide | null {
  const t = tokens(charter);
  const p = textParts(s);
  const hasText = !!(p.title.trim() || p.body.trim());
  const photoN = Number(s.photo_index);
  const hasPhoto = s.slide_type !== "text_only" && Number.isInteger(photoN) && photoN >= 1 && photoN <= Math.max(1, opts.photoCount);
  const done = (html: string | null, layout: MixLayout): ComposedMixSlide | null => html
    ? { slide_number: s.slide_number, html, contrast_ok: true, legibility: `mix-v1 · ${layout}, texte hors photo ou surface de charte`, layout }
    : null;

  if (!hasPhoto) {
    if (!hasText) return null;
    // Schéma : slide « pause ». Ne tient pas → la slide reste une respiration,
    // texte entier, sans schéma (on dégrade l'élément, jamais la slide).
    if (s.visual_schema) {
      const html = !opts.isFirst ? pause(p, t, s.visual_schema) : null;
      if (html) return done(html, "pause");
      const plain = done(respiration(p, t, opts.previous === "respiration" && !opts.isFirst || opts.isFirst), "respiration");
      return plain ? { ...plain, schema_dropped: true } : null;
    }
    // Deux slides texte d'affilée : la seconde passe sur l'aplat de charte.
    return done(respiration(p, t, opts.previous === "respiration" && !opts.isFirst || opts.isFirst), "respiration");
  }
  if (!hasText) {
    // Photo seule : plein cadre, sans voile.
    return done(root(t, "sur_photo", t.background, photoBox(photoN, { x: 0, y: 0, w: W, h: H })), "sur_photo");
  }
  if (opts.isFirst) {
    const cover = couvertureAplat(p, photoN, t);
    if (cover) return done(cover, "couverture_aplat");
  }
  // Overlay court sur photo plein cadre, sauf si la slide précédente l'était déjà.
  if (s.slide_type === "photo_full" && words(p.body) <= SHORT_ON_PHOTO && !p.title && opts.previous !== "sur_photo" && !p.format?.motif) {
    const html = surPhoto(p, photoN, t, s.overlay_position);
    if (html) return done(html, "sur_photo");
  }
  // Un motif demande une colonne large : le côte-à-côte passe en dernier.
  const layouts = preferredPhotoLayouts(s, opts.previous, opts.nextIsPause);
  for (const layout of p.format?.motif ? [...layouts.filter(l => l !== "cote_a_cote"), "cote_a_cote" as MixLayout] : layouts) {
    const side = /right_photo/.test(String(s.photo_layout || "")) ? "right" : "left";
    const html = layout === "photo_aplat" ? photoAplat(p, photoN, t)
      : layout === "passe_partout" ? passePartout(p, photoN, t)
      : coteACote(p, photoN, t, side);
    if (html) return done(html, layout);
  }
  return done(vignette(p, photoN, t), "vignette");
}

/** Compose tout le carrousel, ou null si une seule slide exige le rendu modèle
 * (le mélange de deux moteurs casserait l'unité visuelle de la série). */
export function composeMixCarousel(slides: MixSlideSpec[], charter: MixCharter, photoCount: number): ComposedMixSlide[] | null {
  const nums = slides.map((s, i) => Number(s.slide_number) || i + 1);
  const first = Math.min(...nums), last = Math.max(...nums);
  const out: ComposedMixSlide[] = [];
  let previous: MixLayout | null = null;
  let stepsLost = false;
  for (let i = 0; i < slides.length; i++) {
    const next = slides[i + 1];
    const nextIsPause = !!(next?.visual_schema && (next.slide_type === "text_only" || !Number.isInteger(Number(next.photo_index))));
    const opts: { isFirst: boolean; isLast: boolean; previous: MixLayout | null; photoCount: number; nextIsPause: boolean } = { isFirst: nums[i] === first, isLast: nums[i] === last, previous, photoCount, nextIsPause };
    const base = { ...slides[i], slide_number: nums[i] };
    const plain = composeMixSlide({ ...base, mix_format: null }, charter, opts);
    let composed: ComposedMixSlide | null = plain;
    // La mise en forme ne doit jamais faire perdre la composition ni réduire la
    // photo en vignette : le motif cède d'abord, puis l'étape.
    const f = base.mix_format;
    if (f && (f.step || f.motif)) {
      const tries = [f, f.step && f.motif ? { step: f.step } : null].filter(Boolean) as PhotoFormat[];
      const chosen = tries.map(fmt => composeMixSlide({ ...base, mix_format: fmt }, charter, opts))
        .find(c => c && !(c.layout === "vignette" && plain && plain.layout !== "vignette"));
      if (chosen) composed = chosen;
      if (f.step && !composed?.html.includes("data-photo-step=")) stepsLost = true;
    }
    if (!composed) return null;
    if (base.visual_schema && composed.layout !== "pause") composed = { ...composed, schema_dropped: true };
    out.push(composed);
    previous = composed.layout;
  }
  // Une suite d'étapes est entière ou absente : jamais « Étape 1, 3 ».
  if (stepsLost) return composeMixCarousel(slides.map(s => s.mix_format?.step ? { ...s, mix_format: s.mix_format.motif ? { motif: s.mix_format.motif } : null } : s), charter, photoCount);
  return out;
}

/** Pose la mise en forme validée (étapes, motifs) sur les slides du mixte. */
export function applyMixFormatting<T extends MixSlideSpec>(slides: T[], plan: { steps: Array<{ slide_number: number; label: string }>; motifs: Array<{ slide_number: number; elements: any[]; reason: string }> } | null | undefined): T[] {
  if (!plan || (!plan.steps.length && !plan.motifs.length)) return slides;
  return slides.map((s, i) => {
    const n = Number(s.slide_number) || i + 1;
    const k = plan.steps.findIndex(st => st.slide_number === n);
    const m = plan.motifs.find(x => x.slide_number === n);
    if (k < 0 && !m) return s;
    const format: PhotoFormat = {};
    if (k >= 0) format.step = { index: k + 1, total: plan.steps.length, label: plan.steps[k].label };
    if (m) format.motif = { elements: m.elements, reason: m.reason };
    return { ...s, mix_format: format };
  });
}

/** Texte complet d'une slide du mixte, tel que lu par l'étage de mise en forme. */
export function mixSlideText(s: MixSlideSpec): string {
  return s.slide_type === "photo_full"
    ? String(s.overlay_text || s.body || s.title || "")
    : [s.title, s.body].filter(Boolean).join("\n");
}
