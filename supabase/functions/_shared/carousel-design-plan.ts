/** A sequence is planned once, before chunking. No model call or user-data writes.
 * Geometry is deliberately separate from copy: an over-budget slide returns null
 * from the composer and uses the existing reference/schema-aware model renderer. */
export type EditorialLayout = "opening" | "essay" | "offset" | "statement" | "split" | "closing" | "schema" | "photo";
export interface DesignBeat {
  slide_number: number;
  layout: EditorialLayout;
  alignment: "left" | "center";
  density: "low" | "medium" | "high";
  inverted: boolean;
}
export interface CarouselDesignPlan {
  version: 1;
  direction: "editorial";
  sequence: DesignBeat[];
  constraints: { maxCentered: number; maxPills: number; maxCardSlides: number };
}
import type { PhotoFormat } from "./photo-format-types.ts";
import { motifHeight, motifSvg, STEP_HEADER_H, stepHeader } from "./format-render.ts";

type Slide = Record<string, any>;
type Charter = Record<string, any>;

/** Rôle libre écrit par l'IA, lu sans accents, casse ni séparateurs. */
const roleKey = (role: unknown) => typeof role === "string" ? role.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_\-\u2013\u2014/]+/g, " ") : "";
/** Slide de rupture désignée par son rôle : mêmes mots qu'avant, aucun synonyme
 * ajouté. Rôle inconnu → aucune, le plan retombe sur la slide du milieu. */
export const isRuptureRole = (role: unknown) => /manifest|synth|conclu|punch|separator|constat/.test(roleKey(role));

export function buildCarouselDesignPlan(slides: Slide[]): CarouselDesignPlan {
  const wordCount = (s: Slide) => String(s.body || s.overlay_text || "").trim().split(/\s+/).filter(Boolean).length;
  const candidates = slides.map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && i < slides.length - 1 && !s.visual_schema && !/^photo/.test(s.slide_type || "") && wordCount(s) <= 45);
  const rupture = slides.length >= 5
    ? (candidates.find(({ s }) => isRuptureRole(s.role)) || candidates.sort((a, b) => Math.abs(a.i - slides.length / 2) - Math.abs(b.i - slides.length / 2))[0])?.i
    : undefined;
  let textIndex = 0;
  const sequence = slides.map((s, i): DesignBeat => {
    const words = wordCount(s);
    let layout: EditorialLayout;
    if (/^photo/.test(s.slide_type || "")) layout = "photo";
    else if (s.visual_schema) layout = "schema";
    else if (i === 0) layout = "opening";
    else if (i === slides.length - 1 && slides.length > 1) layout = "closing";
    else if (i === rupture) layout = "statement";
    else layout = (["essay", "offset", "split"] as EditorialLayout[])[textIndex++ % 3];
    return { slide_number: Number(s.slide_number) || i + 1, layout, alignment: layout === "opening" || (layout === "statement" && words < 20) ? "center" : "left", density: words > 65 ? "high" : words > 30 ? "medium" : "low", inverted: i === rupture };
  });
  return { version: 1, direction: "editorial", sequence, constraints: { maxCentered: Math.max(1, Math.floor(slides.length / 3)), maxPills: 1, maxCardSlides: Math.max(1, Math.floor(slides.length / 3)) } };
}

export function describeCarouselDesignPlan(plan: CarouselDesignPlan): string {
  return `PLAN ÉDITORIAL GLOBAL : mêmes polices, palette et grille ; compositions adaptées au récit.
${plan.sequence.map(s => `Slide ${s.slide_number} : ${s.layout}, alignement ${s.alignment}, densité ${s.density}${s.inverted ? ", rupture avec fond de charte inversé" : ""}`).join("\n")}
Les références et interdits explicites de la marque restent prioritaires. Pas de pastille, carte, emoji ou surlignage automatique. Maximum ${plan.constraints.maxCentered} compositions centrées, ${plan.constraints.maxPills} pastille et ${plan.constraints.maxCardSlides} slides à cartes. Le texte source reste intégral et inchangé. Aucun remplissage artificiel du bas de page. Les schémas conservent toutes leurs relations et données. Les photos gardent l'ordre et le type choisis.`;
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
  // COUVERTURE (04/10/2026, maquettes validées par Laetitia) : l'accroche en
  // très grand et le sous-titre facultatif, centrés sur l'aplat ; aucune mise
  // en forme (étape, motif) sur la couverture.
  if (type === "opening") {
    if (format && (format.step || format.motif)) return null;
    const hook = title || body, sub = title ? body : "";
    const n = hook.trim().split(/\s+/).filter(Boolean).length;
    let size = n <= 4 ? 120 : n <= 6 ? 112 : n <= 8 ? 104 : n <= 10 ? 96 : 80;
    while (size > 64 && lines(hook, 920, size) > 5) size -= 4;
    const hh = Math.ceil(lines(hook, 920, size) * size * 1.12);
    const sh = sub ? 48 + Math.ceil(lines(sub, 780, 40) * 40 * 1.4) : 0;
    if (hh + sh > 1050) return null;
    // Bloc en flux centré (comme la couverture du mixte) : l'estimation des
    // lignes sert seulement à vérifier que tout tient.
    const block = (field: "title" | "body", text: string, size: number, family: string, c: string, lh: number, weight: number, extra: string) => `<${field === "title" ? "h1" : "p"} data-slide-text="${field}" data-pptx-editable="${field}" style="margin:0;font-family:'${family}';font-size:${size}px;font-weight:${weight};line-height:${lh};color:${c};white-space:pre-wrap;overflow-wrap:anywhere;text-align:center;${extra}">${escape(text)}</${field === "title" ? "h1" : "p"}>`;
    const imports = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(titleFont)}:wght@400&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap">`;
    return { slide_number: beat.slide_number, html: `${imports}<div data-pptx-shape="background" data-carousel-layout="opening" data-design-version="1" style="width:1080px;height:1350px;position:relative;overflow:hidden;background:${bg};font-family:'${bodyFont}';color:${ink};"><div data-cover="1" style="position:absolute;top:0;left:0;width:1080px;height:1350px;padding:150px 80px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;">${block(title ? "title" : "body", hook, size, titleFont, heading, 1.12, 400, "max-width:920px;")}${sub ? block("body", sub, 40, bodyFont, ink, 1.4, 500, "margin-top:48px;max-width:780px;") : ""}</div></div>` };
  }
  let tx = 80, ty = type === "closing" ? 280 : 170;
  let tw = 920, bx = 80, bw = 840, by = 0;
  let fs = type === "statement" ? 100 : 80;
  let bs = body.trim().split(/\s+/).length <= 45 ? 50 : 40;
  if (type === "offset") { tx = 80; tw = 830; bx = 245; bw = 755; ty = 160; }
  if (type === "split" && title.length < 85 && body.length < 260) { tw = 420; bx = 560; bw = 440; fs = 76; by = 390; ty = 190; }
  if (type === "split" && tw !== 420) { tw = 880; bx = 160; bw = 840; }
  while (fs > 64 && lines(title, tw, fs) > 4) fs -= 4;
  let th = title ? Math.ceil(lines(title, tw, fs) * fs * 1.2) : 0;
  let bh = body ? Math.ceil(lines(body, bw, bs) * bs * 1.5) : 0;
  if (!by) by = ty + th + (title && body ? 64 : 0);
  if (type === "statement") {
    ty = Math.max(150, Math.round((1230 - th - bh - 64) / 2));
    by = ty + th + 64;
    bw = tw;
  }
  // A long explanation gets a wider stacked layout before the model fallback.
  // Recompute every box together: reducing a font without moving the body overlaps it.
  if (Math.max(ty + th, by + bh) > 1220 || lines(title, tw, fs) > 6) {
    tx = bx = 80; tw = bw = 920; ty = 140;
    fs = Math.min(fs, 80);
    bs = Math.min(bs, 44);
    const measure = () => {
      th = title ? Math.ceil(lines(title, tw, fs) * fs * 1.2) : 0;
      bh = body ? Math.ceil(lines(body, bw, bs) * bs * 1.5) : 0;
      by = ty + th + (title && body ? 56 : 0);
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
    if (type === "statement") {
      py = Math.max(150, Math.round((1230 - ph - th - bh - 64) / 2));
      ty = py + ph; by = ty + th + 64;
    } else if (title) { ty += ph; by += ph; }
    else by += ph;
    if (Math.max(ty + th, by + bh) > 1220) return null;
    const soft = /^#[\da-f]{6}$/i.test(ink) ? `rgba(${parseInt(ink.slice(1, 3), 16)},${parseInt(ink.slice(3, 5), 16)},${parseInt(ink.slice(5, 7), 16)},.32)` : ink;
    pre = `<div data-format-block="1" style="position:absolute;left:${px}px;top:${py}px;width:${pw}px;text-align:${beat.alignment};">` +
      (format.step ? stepHeader(format.step, heading) : "") +
      (motifOk ? motifSvg(format.motif!, { ink, soft, accent: heading }, { title: `'${titleFont}', serif`, body: `'${bodyFont}', sans-serif` }) : "") + `</div>`;
  }
  const align = beat.alignment;
  const textBlock = (field: "title" | "body", text: string, x: number, y: number, w: number, size: number, family: string, c: string, lineHeight: number) => text ? `<${field === "title" ? "h1" : "p"} data-slide-text="${field}" data-pptx-editable="${field}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;margin:0;font-family:'${family}';font-size:${size}px;font-weight:400;line-height:${lineHeight};color:${c};white-space:pre-wrap;overflow-wrap:anywhere;text-align:${align};">${escape(text)}</${field === "title" ? "h1" : "p"}>` : "";
  const imports = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(titleFont)}:wght@400&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap">`;
  return { slide_number: beat.slide_number, html: `${imports}<div data-pptx-shape="background" data-carousel-layout="${type}" data-design-version="1" style="width:1080px;height:1350px;position:relative;overflow:hidden;background:${bg};font-family:'${bodyFont}';color:${ink};">${pre}${textBlock("title", title, tx, ty, tw, fs, titleFont, heading, 1.2)}${textBlock("body", body, bx, by, bw, bs, bodyFont, ink, 1.5)}</div>` };
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
