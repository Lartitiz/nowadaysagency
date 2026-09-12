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
type Slide = Record<string, any>;
type Charter = Record<string, any>;

export function buildCarouselDesignPlan(slides: Slide[]): CarouselDesignPlan {
  const wordCount = (s: Slide) => String(s.body || s.overlay_text || "").trim().split(/\s+/).filter(Boolean).length;
  const candidates = slides.map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && i < slides.length - 1 && !s.visual_schema && !/^photo/.test(s.slide_type || "") && wordCount(s) <= 45);
  const rupture = slides.length >= 5
    ? (candidates.find(({ s }) => /manifest|synth|conclu|punch|separator|constat/.test(s.role || "")) || candidates.sort((a, b) => Math.abs(a.i - slides.length / 2) - Math.abs(b.i - slides.length / 2))[0])?.i
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
    return { slide_number: Number(s.slide_number) || i + 1, layout, alignment: layout === "statement" && words < 20 ? "center" : "left", density: words > 65 ? "high" : words > 30 ? "medium" : "low", inverted: i === rupture };
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
export function composeEditorialSlide(slide: Slide, beat: DesignBeat, ch: Charter): { slide_number: number; html: string } | null {
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
  let tx = 80, ty = type === "opening" ? 185 : type === "closing" ? 280 : 170;
  let tw = 920, bx = 80, bw = 840, by = 0;
  let fs = type === "opening" ? 108 : type === "statement" ? 100 : 80;
  const bs = body.trim().split(/\s+/).length <= 45 ? 50 : 40;
  if (type === "offset") { tx = 80; tw = 830; bx = 245; bw = 755; ty = 160; }
  if (type === "split" && title.length < 85 && body.length < 260) { tw = 420; bx = 560; bw = 440; fs = 76; by = 390; ty = 190; }
  if (type === "split" && tw !== 420) { tw = 880; bx = 160; bw = 840; }
  while (fs > 64 && lines(title, tw, fs) > 4) fs -= 4;
  const th = title ? Math.ceil(lines(title, tw, fs) * fs * 1.2) : 0;
  const bh = body ? Math.ceil(lines(body, bw, bs) * bs * 1.5) : 0;
  if (!by) by = ty + th + (title && body ? 64 : 0);
  if (type === "opening") by = Math.max(by, 735);
  if (type === "statement") {
    ty = Math.max(150, Math.round((1230 - th - bh - 64) / 2));
    by = ty + th + 64;
    bw = tw;
  }
  if (Math.max(ty + th, by + bh) > 1220 || lines(title, tw, fs) > 6) return null;
  const align = beat.alignment;
  const textBlock = (field: "title" | "body", text: string, x: number, y: number, w: number, size: number, family: string, c: string, lineHeight: number) => text ? `<${field === "title" ? "h1" : "p"} data-slide-text="${field}" data-pptx-editable="${field}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;margin:0;font-family:'${family}';font-size:${size}px;font-weight:400;line-height:${lineHeight};color:${c};white-space:pre-wrap;overflow-wrap:anywhere;text-align:${align};">${escape(text)}</${field === "title" ? "h1" : "p"}>` : "";
  const imports = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(titleFont)}:wght@400&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap">`;
  return { slide_number: beat.slide_number, html: `${imports}<div data-pptx-shape="background" data-carousel-layout="${type}" data-design-version="1" style="width:1080px;height:1350px;position:relative;overflow:hidden;background:${bg};font-family:'${bodyFont}';color:${ink};">${textBlock("title", title, tx, ty, tw, fs, titleFont, heading, 1.2)}${textBlock("body", body, bx, by, bw, bs, bodyFont, ink, 1.5)}</div>` };
}
