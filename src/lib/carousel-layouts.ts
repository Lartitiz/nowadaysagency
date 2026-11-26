// Galerie de mises en page des slides (20/11/2026, validée sur maquette par
// Laetitia). Sorti de carousel-editor.ts : chaque mise en page garde la charte
// de la slide (polices, couleurs, mot mis en valeur) et ajuste la taille du
// texte pour qu'il ne sorte jamais de la slide.
import { DEFAULT_TOKENS, documentColors, prepareSlideHtml, sanitizeRichText, type EditorSlide, type StyleTokens } from "./carousel-editor";

const PLEIN_CONTOUR = "text-shadow:0 2px 14px rgba(0,0,0,0.45);";
export type LayoutVariant = "texte" | "texte-centre" | "citation" | "carte" | "photo-plein" | "photo-haut" | "photo-arche" | "photo-cadre" | "photo-gauche";
export const LAYOUTS: { variant: LayoutVariant; label: string; photo: boolean }[] = [
  { variant: "texte", label: "Éditorial", photo: false },
  { variant: "texte-centre", label: "Grand titre", photo: false },
  { variant: "citation", label: "Citation", photo: false },
  { variant: "carte", label: "Carte", photo: false },
  { variant: "photo-plein", label: "Photo plein écran", photo: true },
  { variant: "photo-haut", label: "Magazine", photo: true },
  { variant: "photo-arche", label: "Arche", photo: true },
  { variant: "photo-cadre", label: "Photo et carte", photo: true },
];

/* ─── Couleurs ─────────────────────────────────────────────────────────── */

function rgbOf(color: string): [number, number, number] | null {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = color.match(/^rgba?\(([^)]+)\)$/i)?.[1].split(/[\s,/]+/).map(Number);
  return m && m.length >= 3 && m.slice(0, 3).every(Number.isFinite) && (m[3] === undefined || m[3] >= 0.5) ? [m[0], m[1], m[2]] : null;
}
const toHex = (c: [number, number, number]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
function luminance(color: string): number {
  const c = rgbOf(color);
  if (!c) return 0.5;
  const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const mix = (a: string, b: string, amount: number) => {
  const x = rgbOf(a) || [26, 26, 26], y = rgbOf(b) || [255, 255, 255];
  return toHex(x.map((v, i) => v + (y[i] - v) * amount) as [number, number, number]);
};
/** Une couleur « de marque » : assez vive pour servir d'accent. */
function vivid(color: string): boolean {
  const c = rgbOf(color);
  if (!c) return false;
  const max = Math.max(...c), min = Math.min(...c);
  return max > 70 && (max - min) / max > 0.3;
}
/** La couleur demandée si elle se lit sur ce fond, sinon blanc ou encre. */
const on = (bg: string, color: string, min = 4.5) => (contrast(color, bg) >= min ? color : luminance(bg) < 0.3 ? "#ffffff" : "#1a1a1a");

/* ─── Charte d'origine de la slide ─────────────────────────────────────── */

const CHARTE = "data-layout-charte";
/** Photo de la slide, gardée de côté quand la mise en page choisie n'en montre pas. */
export const KEPT_PHOTO = "data-layout-photo";
const CHARTE_KEYS = ["titleColor", "bodyColor", "background", "accent"] as const;
const text = (el: Element | null) => (el?.textContent || "").replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => {
  const x = rgbOf(a), y = rgbOf(b);
  return !!x && !!y && x.every((v, i) => Math.abs(v - y[i]) < 2);
};
/** Couleurs vives du carrousel ouvert : une slide sans couleur prend l'accent des autres. */
let documentAccents: string[] = [];
export function rememberDocumentAccents(slides: { html: string }[]) {
  documentAccents = documentColors(slides, 12).filter(vivid);
}
/**
 * Complète la charte lue sur une slide : couleur d'accent, mise en forme des
 * mots du titre et du texte. Une slide déjà recomposée retrouve la charte de
 * la slide d'origine (un « Grand titre » ne teinte pas la mise en page
 * suivante), sauf si un thème ou une couleur de fond a été choisi depuis.
 */
export function withCharte(tokens: StyleTokens, doc: Document): StyleTokens {
  const root = doc.body.firstElementChild as HTMLElement | null;
  const title = doc.body.querySelector<HTMLElement>('[data-slide-text="title"]'),
    body = doc.body.querySelector<HTMLElement>('[data-slide-text="body"]');
  const out: StyleTokens = { ...tokens };
  const rich = (el: HTMLElement | null) => (el && el.children.length ? sanitizeRichText(el.innerHTML) : "");
  out.titleHtml = rich(title);
  out.bodyHtml = rich(body);
  let saved: Record<string, string> | null = null;
  try {
    saved = JSON.parse(root?.getAttribute(CHARTE) || "null");
  } catch {
    saved = null;
  }
  const untouched = saved && title && same(saved.outBackground, tokens.background) && same(saved.outTitle, title.style.color);
  if (saved && untouched) {
    for (const key of CHARTE_KEYS) if (saved[key]) out[key] = saved[key];
    return out;
  }
  // Accent : la couleur vive qui ressort le mieux sur le fond, parmi le mot mis en
  // couleur, les décors et pastilles, le titre, et les couleurs du carrousel.
  const colors = [
    ...Array.from(doc.body.querySelectorAll<HTMLElement>("[data-slide-text] [style*='color'],[data-pptx-editable] [style*='color']")).map((el) => el.style.color),
    ...Array.from(doc.body.querySelectorAll<HTMLElement>("[data-editor-shape],[data-pptx-shape],[data-pptx-editable]")).filter((el) => el !== root).map((el) => el.style.backgroundColor),
    tokens.titleColor,
    ...documentAccents,
  ].filter((c) => c && vivid(c) && contrast(c, tokens.background) >= 1.6);
  out.accent = colors.sort((a, b) => contrast(b, tokens.background) - contrast(a, tokens.background))[0] || "";
  return out;
}

/* ─── Taille du texte : estimation sans navigateur ─────────────────────── */

const charWidth = (font: string) => (/mono|courier/i.test(font) ? 0.62 : 0.54);
function countLines(value: string, perLine: number): number {
  let n = 0;
  for (const para of value.split("\n")) {
    let cur = 0;
    n++;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (cur && cur + 1 + word.length > perLine) {
        n++;
        cur = 0;
      }
      cur += (cur ? 1 : 0) + word.length;
      if (cur > perLine) {
        n += Math.ceil(cur / perLine) - 1;
        cur %= perLine;
      }
    }
  }
  return n;
}
interface Fit { title: number; body: number; extra: number; stat: number; height: number }
/** Chiffre clé (« 87 % », « 1,5 % », « x3 ») : affiché en grand, pas comme une mention. */
const isStat = (t: string) => /\d/.test(t) && /^[\d\s.,+%€$x×k/-]{1,9}$/i.test(t);
const TITLE_LH = 1.1, BODY_LH = 1.45, GAP = 44, BODY_FLOOR = 38;
/**
 * Tailles du titre et du texte pour tenir dans la zone : le titre réduit
 * d'abord, puis le texte, jamais sous les planchers de lisibilité.
 */
export function fitText(o: { title: string; body: string; extras: string[]; width: number; height: number; titleFont: string; bodyFont: string; titleMax: number; titleMin?: number; bodyMax?: number }): Fit {
  const titleMin = o.titleMin ?? 48;
  const per = (size: number, font: string) => Math.max(3, Math.floor(o.width / (size * charWidth(font))));
  const longest = Math.max(1, ...o.title.split(/\s+/).map((w) => w.length));
  let title = Math.max(titleMin, Math.min(o.titleMax, Math.floor(o.width / (longest * charWidth(o.titleFont)))));
  let body = o.bodyMax ?? 44;
  // Jamais sous 38 px : en dessous, le contrôle qualité de l'éditeur le signale.
  const extra = () => Math.max(BODY_FLOOR, Math.round(body * 0.9));
  const stat = () => Math.round(body * 2.2);
  const height = () =>
    countLines(o.title, per(title, o.titleFont)) * title * TITLE_LH +
    (o.body ? GAP + countLines(o.body, per(body, o.bodyFont)) * body * BODY_LH : 0) +
    o.extras.reduce((sum, t) => sum + (isStat(t) ? 36 + stat() * 1.1 : 24 + countLines(t, per(extra(), o.bodyFont)) * extra() * 1.4), 0);
  while (height() > o.height && (title > titleMin || body > BODY_FLOOR)) {
    if (title > titleMin && (title > o.titleMax * 0.62 || body <= BODY_FLOOR)) title = Math.max(titleMin, title - 4);
    else body = Math.max(BODY_FLOOR, body - 2);
  }
  return { title, body, extra: extra(), stat: stat(), height: Math.ceil(height()) };
}

/* ─── Composition ──────────────────────────────────────────────────────── */

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Valeur CSS posée dans un attribut style="…" : jamais de guillemet double
 * (le navigateur rend `"IBM Plex Mono", monospace`, qui coupait le style). */
const css = (value: string) => value.replace(/"/g, "'").replace(/[;<>]/g, "");
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const W = 1080, H = 1350, M = 90;

/**
 * Recompose une slide dans une autre mise en page en gardant son titre, son
 * texte, sa photo et la charte (polices, couleurs) de la slide.
 */
export function composeLayout(
  data: Record<string, any>,
  requested: LayoutVariant,
  photo = "",
  tokens: StyleTokens = DEFAULT_TOKENS,
  /** Autres textes de la slide (chiffre clé, liste, mention…), repris tels quels. */
  extras: string[] = [],
): EditorSlide {
  const known = LAYOUTS.find((l) => l.variant === requested);
  const variant: LayoutVariant = !photo && known?.photo !== false ? "texte" : known ? requested : "photo-haut";
  const more = extras.map((t) => t.trim()).filter(Boolean);
  // Slide sans titre (photo légendée, étape…) : son premier texte sert de titre,
  // jamais le texte d'exemple « Ton titre » (vu en ligne le 20/11/2026).
  const named = String(data.title || data.overlay_text || "");
  const lead = named ? -1 : more.findIndex((t) => !isStat(t));
  const title = named || (lead >= 0 ? more.splice(lead, 1)[0] : String(data.body || "Ton titre")),
    body = String(named ? data.body || "" : "");
  const titleFont = css(tokens.titleFont), bodyFont = css(tokens.bodyFont);
  const paper = rgbOf(tokens.background) ? tokens.background : DEFAULT_TOKENS.background;
  const darkPaper = luminance(paper) < 0.3;
  const accent = tokens.accent && vivid(tokens.accent) ? tokens.accent : on(paper, tokens.titleColor, 3);

  // Fond et couleurs de texte de chaque mise en page.
  const card = darkPaper ? mix(paper, "#ffffff", 0.1) : "#ffffff";
  const surface: Record<string, { bg: string; text: string }> = {
    "texte-centre": { bg: accent, text: accent },
    carte: { bg: mix(accent, paper, darkPaper ? 0.7 : 0.78), text: card },
    "photo-plein": { bg: "#111111", text: "#111111" },
  };
  const bg = surface[variant]?.bg || paper;
  const textBg = surface[variant]?.text || paper;
  const plain = variant === "texte-centre" || variant === "photo-plein";
  const light = [paper, "#ffffff"].find((c) => contrast(c, accent) >= 4.5);
  const ink = variant === "photo-plein" ? "#ffffff" : variant === "texte-centre" ? light || on(accent, "#ffffff") : on(textBg, tokens.bodyColor),
    heading = plain ? ink : on(textBg, tokens.titleColor, 3);

  // Zone de texte (largeur, hauteur disponible) et taille idéale du titre.
  const zone: Record<string, [number, number, number]> = {
    texte: [W - 2 * M, 1130 - 120, 100],
    "texte-centre": [W - 2 * M, 1130, 132],
    citation: [W - 2 * M, 860, 76],
    carte: [796, 1050, 80],
    "photo-plein": [W - 2 * M, 760, 100],
    "photo-haut": [W - 2 * M, 666, 80],
    "photo-arche": [W - 2 * M, 614, 76],
    "photo-cadre": [832, 620, 76],
  };
  const [width, height, titleMax] = zone[variant];
  const fit = fitText({ title, body, extras: more, width, height, titleFont, bodyFont, titleMax });

  // Mise en forme des mots (couleur, italique) : gardée quand le texte est posé sur un fond de la charte.
  const rich = (html: string | undefined, value: string) => {
    if (plain || !html) return esc(value);
    const probe = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild as HTMLElement;
    if (text(probe) !== value.replace(/\s+/g, " ").trim()) return esc(value);
    probe.querySelectorAll<HTMLElement>("[style*='color']").forEach((el) => {
      if (el.style.color && contrast(el.style.color, textBg) < 3) el.style.color = accent && contrast(accent, textBg) >= 3 ? accent : heading;
    });
    return probe.innerHTML;
  };
  const sourceLike = variant === "citation" && body.length <= 80;
  const h = (extra = "") =>
    `<h1 data-slide-text="title" data-pptx-editable="title" style="font-size:${fit.title}px;font-family:${titleFont};color:${heading};line-height:${TITLE_LH};font-weight:${css(tokens.titleWeight)};margin:0;white-space:pre-wrap;overflow-wrap:break-word;${extra}">${rich(tokens.titleHtml, title)}</h1>`;
  const b = (extra = "") =>
    (body
      ? `<p data-slide-text="body" data-pptx-editable="body" style="font-size:${fit.body}px;font-family:${sourceLike ? titleFont : bodyFont};color:${sourceLike ? on(textBg, accent) : ink};line-height:${BODY_LH};margin:${GAP}px 0 0;white-space:pre-wrap;overflow-wrap:break-word;${extra}">${rich(tokens.bodyHtml, body)}</p>`
      : "") +
    more
      .map((t) =>
        isStat(t)
          ? `<p data-pptx-editable="body" data-editor-free="true" style="font-size:${fit.stat}px;font-family:${titleFont};color:${plain ? ink : on(textBg, accent, 3)};line-height:1.1;margin:36px 0 0;white-space:pre-wrap;${extra}">${esc(t)}</p>`
          : `<p data-pptx-editable="body" data-editor-free="true" style="font-size:${fit.extra}px;font-family:${bodyFont};color:${ink};line-height:1.4;margin:24px 0 0;white-space:pre-wrap;overflow-wrap:break-word;${extra}">${esc(t)}</p>`,
      )
      .join("");
  const img = (style: string) =>
    photo ? `<div data-pptx-photo="${data.photo_index || 1}" style="position:absolute;${style}background-image:url(&quot;${esc(photo)}&quot;);background-size:cover;background-position:50% 50%;"></div>` : "";
  const block = (style: string, inner: string, attrs = "") => `<div${attrs} style="position:absolute;${style}">${inner}</div>`;
  const column = `left:${M}px;width:${W - 2 * M}px;`;

  let inner = "";
  let align = "left";
  switch (variant) {
    case "texte": {
      const rule = `<div style="width:120px;height:8px;background-color:${accent};margin:0 0 4px;"></div>`;
      inner = block(`${column}top:110px;height:1130px;display:flex;flex-direction:column;justify-content:space-between;`, `${h()}<div>${body || more.length ? rule : ""}${b()}</div>`);
      break;
    }
    case "texte-centre":
      inner = block(`${column}top:110px;height:1130px;display:flex;flex-direction:column;justify-content:center;`, h("line-height:1.05;") + b("max-width:780px;"));
      break;
    case "citation":
      inner =
        `<p data-editor-free="true" data-pptx-editable="body" style="position:absolute;left:${M - 10}px;top:70px;width:300px;margin:0;font-size:320px;line-height:1;font-family:Georgia,serif;color:${accent}">«</p>` +
        block(`${column}top:${clamp(380 + (860 - fit.height) / 4, 380, 470)}px;`, h("font-style:italic;line-height:1.3;") + b());
      break;
    case "carte":
      inner = block(
        "left:70px;top:70px;width:940px;height:1210px;display:flex;align-items:center;",
        `<div data-pptx-shape="card" style="width:940px;box-sizing:border-box;background-color:${card};border-radius:48px;padding:80px 72px;">${h()}${b()}</div>`,
      );
      break;
    case "photo-plein": {
      // Ombre allégée (26/11/2026, « l'ombre est trop forte, on ne voit pas la photo ») : 0,82 au plus au lieu
      // de 0,93, moins haute, et un fin contour sous le texte pour qu'il reste lisible. Elle se règle ensuite
      // dans l'onglet Photo et sur la slide (carousel-shade.ts).
      const veil = (rgbOf(mix(accent, "#000000", 0.72)) || [20, 20, 20]).join(",");
      inner =
        img(`left:0;top:0;width:${W}px;height:${H}px;`) +
        `<div data-injected-scrim="1" style="position:absolute;left:0;bottom:0;width:${W}px;height:${clamp(fit.height + 380, 580, H)}px;background:linear-gradient(0deg,rgba(${veil},0.82) 0%,rgba(${veil},0.6) 45%,rgba(${veil},0) 100%);"></div>` +
        block(`${column}bottom:110px;`, h(PLEIN_CONTOUR) + b(PLEIN_CONTOUR));
      break;
    }
    case "photo-haut": {
      const top = clamp(H - fit.height - 64 - 100, 500, 760);
      inner = img(`left:0;top:0;width:${W}px;height:${top}px;`) + block(`${column}top:${top + 64}px;`, h() + b());
      break;
    }
    case "photo-arche": {
      const tall = clamp(H - 100 - 56 - fit.height - 100, 480, 720);
      align = "center";
      inner = img(`left:230px;top:100px;width:620px;height:${tall}px;border-radius:310px 310px 0 0;`) + block(`${column}top:${100 + tall + 56}px;text-align:center;`, h() + b());
      break;
    }
    case "photo-cadre":
      inner =
        img(`left:0;top:0;width:${W}px;height:${H}px;`) +
        block("left:60px;bottom:60px;width:960px;box-sizing:border-box;border-radius:48px;padding:68px 64px;background-color:" + paper + ";", h() + b(), ' data-pptx-shape="card"');
      break;
  }
  // Charte d'origine, relue au prochain changement de mise en page (cf. withCharte).
  const charte = esc(JSON.stringify({ titleColor: tokens.titleColor, bodyColor: tokens.bodyColor, background: paper, accent: tokens.accent || "", outBackground: bg, outTitle: heading }));
  const usesPhoto = !!LAYOUTS.find((l) => l.variant === variant)?.photo;
  // Photo collée (data:) comprise : la slide la portait déjà, son poids ne change pas.
  const kept = photo && !usesPhoto ? ` ${KEPT_PHOTO}="${esc(photo)}"` : "";
  const html = `${tokens.fontImports}<div ${CHARTE}="${charte}"${kept} style="width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${bg};color:${ink};font-family:${bodyFont};text-align:${align}">${inner}</div>`;
  const slideType = !photo || !usesPhoto ? "text_only" : variant === "photo-plein" ? "photo_full" : "photo_integrated";
  return { id: crypto.randomUUID(), data: { ...data, title, body, slide_type: slideType, layout_variant: variant }, html: prepareSlideHtml(html) };
}
