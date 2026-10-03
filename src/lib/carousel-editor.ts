import { photoEditorialMarkup } from "../../supabase/functions/_shared/photo-editorial";
/** The saved HTML is the editable design and the source of every visual export.
 * Structured fields are kept in sync for captions, regeneration and calendar views.
 * All manual operations are local, immutable, and independent from AI services. */
export interface EditorSlide {
  id: string;
  data: Record<string, any>;
  html: string;
  locked?: boolean;
}
export interface CarouselDocument {
  slides: EditorSlide[];
  caption: Record<string, any>;
}
export interface EditorElement {
  id: string;
  kind: "text" | "photo" | "shape";
  /** Nature d'une forme : cadre en verre, voile sur la photo, ou forme/carte. */
  role?: "glass" | "veil" | "shape";
  /** Forme qui contient des textes : on la déplace avec eux, comme un groupe. */
  frame?: boolean;
  text: string;
  field?: string;
  style: Record<string, string>;
}
export const CAROUSEL_MAX_SLIDES = 20;
const newId = () => crypto.randomUUID();
const skip = "script,style,link,meta,svg,svg *,noscript";

function parse(html: string): Document {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script,iframe,object,embed,base,meta[http-equiv]")
    .forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((a) => {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    });
  });
  return doc;
}
function serialize(doc: Document) {
  return doc.head.innerHTML + doc.body.innerHTML;
}
/** Texte visible hors <svg>/<style>… : un picto SVG n'est pas du texte éditable. */
export function ownText(el: Element): string {
  let text = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) text += n.textContent || "";
    else if (n.nodeType === 1 && !(n as Element).matches(skip)) text += ownText(n as Element);
  });
  return text;
}
function textNodes(doc: Document): HTMLElement[] {
  return Array.from(doc.body.querySelectorAll<HTMLElement>("*")).filter(
    (el) => {
      if (
        el.matches(skip) ||
        (!ownText(el).trim() &&
          !el.hasAttribute("data-slide-text") &&
          !el.hasAttribute("data-pptx-editable"))
      )
        return false;
      if (el.parentElement?.closest("[data-slide-text],[data-pptx-editable]")) return false;
      return (
        el.hasAttribute("data-slide-text") ||
        el.hasAttribute("data-pptx-editable") ||
        !Array.from(el.children).some(
          (c) => !c.matches(skip) && ownText(c).trim(),
        )
      );
    },
  );
}
function photoNodes(doc: Document): HTMLElement[] {
  return Array.from(
    doc.body.querySelectorAll<HTMLElement>(
      "img,[data-pptx-photo],[data-editor-photo]",
    ),
  ).filter(
    (el) => !el.parentElement?.closest("[data-pptx-photo],[data-editor-photo]"),
  );
}
/** Formes qui ne sont pas des formes d'export natives mais qu'on doit pouvoir
 * choisir : cadre en verre dépoli et voiles posés sur la photo. */
const EXTRA_SHAPES = "[data-photo-glass],[data-injected-scrim],[data-editor-shape]";
const SLIDE_W = 1080;
const px = (value: string | undefined) => {
  const n = parseFloat(value || "");
  return Number.isFinite(n) ? n : null;
};
/** Photo principale de la slide (jamais la copie floue du verre). */
function mainPhoto(doc: Document): HTMLElement | undefined {
  return photoNodes(doc).find((el) => !el.closest("[data-photo-glass]"));
}
/**
 * Le verre dépoli contient une copie floue de la photo, calée sur la photo de
 * fond par des décalages opposés à ceux du cadre. Après tout déplacement du
 * cadre ou tout recadrage / remplacement de la photo, on recale la copie.
 */
export function syncGlass(doc: Document) {
  const photo = mainPhoto(doc);
  doc.querySelectorAll<HTMLElement>("[data-photo-glass]").forEach((card) => {
    const blur = card.querySelector<HTMLElement>("[data-photo-glass-blur]");
    if (!blur) return;
    const left = px(card.style.left), top = px(card.style.top), bottom = px(card.style.bottom);
    if (left !== null) blur.style.left = `${-left}px`;
    if (top !== null) {
      blur.style.top = `${-top}px`;
      blur.style.removeProperty("bottom");
    } else if (bottom !== null) {
      blur.style.bottom = `${-bottom}px`;
      blur.style.removeProperty("top");
    }
    if (!photo) return;
    const url =
      photo.tagName === "IMG"
        ? photo.getAttribute("src")
        : (photo.style.backgroundImage.match(/url\(\s*(['"]?)(.*?)\1\s*\)/) || [])[2];
    if (url) blur.style.backgroundImage = `url("${url.replace(/["\\\n\r]/g, "")}")`;
    const fit = photo.style.objectFit || photo.style.backgroundSize;
    blur.style.backgroundSize = fit === "contain" ? "contain" : photo.tagName === "IMG" ? "cover" : fit || "cover";
    blur.style.backgroundRepeat = "no-repeat";
    blur.style.backgroundPosition =
      photo.style.objectPosition || photo.style.backgroundPosition || "center";
    const zoom = photo.style.transform && photo.style.transform !== "none" ? photo.style.transform : "";
    blur.style.transform = `${zoom} scale(1.08)`.trim();
  });
}

export function prepareSlideHtml(html: string): string {
  const doc = parse(html);
  // Colonne éditoriale : la bande et son texte étaient deux calques voisins.
  // Le texte passe DANS la bande (mêmes coordonnées, la bande est à 0,0) pour
  // qu'ils se déplacent ensemble.
  doc.querySelectorAll<HTMLElement>('[data-photo-style="colonne"]').forEach((band) => {
    const text = band.nextElementSibling as HTMLElement | null;
    if (!band.children.length && text?.hasAttribute("data-photo-column-text") && px(band.style.left) === 0 && px(band.style.top) === 0)
      band.append(text);
  });
  // Legacy backgrounds can also be selected. Ignore brand textures when a real
  // photo is already annotated by the renderer.
  if (!photoNodes(doc).length) {
    doc.body
      .querySelectorAll<HTMLElement>('[style*="background"]')
      .forEach((el) => {
        if (/url\(/i.test(el.style.backgroundImage || el.style.background))
          el.setAttribute("data-editor-photo", "true");
      });
  }
  // A background photo may share its container with all text. Give it a separate
  // layer so moving, zooming or deleting the photo never transforms the text.
  photoNodes(doc)
    .filter((el) => el.tagName !== "IMG" && el.children.length > 0)
    .forEach((el) => {
      const url = (el.style.backgroundImage || el.style.background).match(
        /url\([\s\S]*?\)/,
      )?.[0];
      if (!url) return;
      const layer = doc.createElement("div");
      layer.style.cssText = "position:absolute;inset:0;pointer-events:auto;";
      layer.style.backgroundImage = url;
      layer.style.backgroundSize = el.style.backgroundSize || "cover";
      layer.style.backgroundPosition = el.style.backgroundPosition || "center";
      layer.dataset.editorPhoto = "true";
      if (el.dataset.pptxPhoto) layer.dataset.pptxPhoto = el.dataset.pptxPhoto;
      el.removeAttribute("data-pptx-photo");
      el.removeAttribute("data-editor-photo");
      el.style.backgroundImage = "none";
      if (!el.style.position) el.style.position = "relative";
      Array.from(el.children).forEach((child) => {
        const sibling = child as HTMLElement;
        if (!sibling.style.position) sibling.style.position = "relative";
        if (!sibling.style.zIndex) sibling.style.zIndex = "1";
      });
      el.prepend(layer);
    });
  // Le cadre en verre devient une forme que le contrôle qualité inspecte aussi.
  doc.querySelectorAll<HTMLElement>("[data-photo-glass]").forEach((el) => el.setAttribute("data-editor-shape", "glass"));
  const elements = new Set<HTMLElement>([
    ...textNodes(doc),
    ...photoNodes(doc).filter((el) => !el.closest("[data-photo-glass]")),
    ...Array.from(doc.body.querySelectorAll<HTMLElement>("[data-pptx-shape]")),
    ...Array.from(doc.body.querySelectorAll<HTMLElement>(EXTRA_SHAPES)),
  ]);
  const used = new Set(
    Array.from(doc.querySelectorAll("[data-editor-id]")).map((e) =>
      e.getAttribute("data-editor-id"),
    ),
  );
  let n = 0;
  elements.forEach((el) => {
    if (!el.dataset.editorId) {
      while (used.has(`element-${n}`)) n++;
      el.dataset.editorId = `element-${n++}`;
      used.add(el.dataset.editorId);
    }
    if (textNodes(doc).includes(el) && !el.hasAttribute("data-pptx-editable"))
      el.setAttribute("data-pptx-editable", "body");
  });
  return serialize(doc);
}
export function getEditorElements(html: string): EditorElement[] {
  const doc = parse(html);
  const photos = new Set(photoNodes(doc));
  const texts = new Set(textNodes(doc));
  return Array.from(
    doc.body.querySelectorAll<HTMLElement>("[data-editor-id]"),
  ).map((el) => ({
    id: el.dataset.editorId!,
    kind: photos.has(el) ? "photo" : texts.has(el) ? "text" : "shape",
    ...(!photos.has(el) && !texts.has(el)
      ? {
          role: el.hasAttribute("data-photo-glass")
            ? ("glass" as const)
            : el.hasAttribute("data-injected-scrim")
              ? ("veil" as const)
              : ("shape" as const),
          frame: !!el.querySelector("[data-editor-id]"),
        }
      : {}),
    text: el.textContent || "",
    field: el.dataset.slideText,
    style: (() => {
      const style = Object.fromEntries(
        Array.from(el.style).map((k) => [k, el.style.getPropertyValue(k)]),
      );
      for (const key of [
        "font-size",
        "font-family",
        "font-weight",
        "font-style",
        "line-height",
        "text-align",
        "color",
      ]) {
        let node = el.parentElement;
        while (!style[key] && node) {
          style[key] = node.style.getPropertyValue(key);
          node = node.parentElement;
        }
      }
      return style;
    })(),
  }));
}
function replaceData(value: any, old: string, next: string): any {
  if (typeof value === "string") return value === old ? next : value;
  if (Array.isArray(value)) return value.map((v) => replaceData(v, old, next));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceData(v, old, next)]),
    );
  return value;
}
export function patchElement(
  slide: EditorSlide,
  id: string,
  patch: { text?: string; styles?: Record<string, string>; remove?: boolean },
): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const el = Array.from(
    doc.querySelectorAll<HTMLElement>("[data-editor-id]"),
  ).find((e) => e.dataset.editorId === id);
  if (!el) return slide;
  // Retirer un cadre qui contient des textes : on enlève le fond, les textes
  // restent (avant, « Retirer » effaçait aussi le texte de la slide).
  if (patch.remove && !photoNodes(doc).includes(el) && el.querySelector("[data-editor-id]")) {
    el.querySelectorAll("[data-photo-glass-blur]").forEach((blur) => blur.remove());
    [el, ...Array.from(el.children as HTMLCollectionOf<HTMLElement>)].forEach((node) => {
      if (node !== el && node.hasAttribute("data-editor-id")) return;
      ["background", "background-color", "background-image", "box-shadow", "border", "backdrop-filter"].forEach((k) => node.style.removeProperty(k));
    });
    ["data-pptx-shape", "data-editor-shape", "data-photo-glass", "data-editor-id"].forEach((a) => el.removeAttribute(a));
    return { ...slide, html: serialize(doc) };
  }
  if (patch.remove && el.hasAttribute("data-injected-scrim")) {
    el.remove();
    return { ...slide, html: serialize(doc) };
  }
  let data = { ...slide.data };
  if (patch.text !== undefined || patch.remove) {
    const old = el.textContent?.trim() || "";
    const next = patch.remove ? "" : patch.text!;
    // Une copie (Dupliquer) n'est pas le texte source : elle ne le réécrit pas.
    const free = !!el.closest("[data-editor-free]");
    if (old && !free) data = replaceData(data, old, next);
    const field = el.dataset.slideText;
    if (field && ["title", "body", "overlay"].includes(field))
      data[field === "overlay" ? "overlay_text" : field] = next;
    if (field === "cta") data.cta_label = next;
    // A numerical callout must follow its source sentence. Only a single changed
    // number and exact standalone duplicates qualify; unrelated values are kept.
    const numberPattern = /\d+(?:[.,]\d+)?\s*(?:%|×|h)?/g;
    const before = old.match(numberPattern) || [],
      after = next.match(numberPattern) || [];
    if (!free && before.length === 1 && after.length === 1 && before[0] !== after[0]) {
      textNodes(doc).forEach((other) => {
        if (other !== el && other.textContent?.trim() === before[0])
          other.textContent = after[0];
      });
      data = replaceData(data, before[0], after[0]);
    }
    // Preserve inline emphasis for unchanged prefix/suffix by changing text nodes
    // when only one node differs. Whole-field rewrites retain the block styles.
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const full = el.textContent || "";
    let prefix = 0;
    while (
      prefix < full.length &&
      prefix < next.length &&
      full[prefix] === next[prefix]
    )
      prefix++;
    let suffix = 0;
    while (
      suffix < full.length - prefix &&
      suffix < next.length - prefix &&
      full[full.length - 1 - suffix] === next[next.length - 1 - suffix]
    )
      suffix++;
    let offset = 0;
    let changed = false;
    for (const node of nodes) {
      const end = offset + (node.textContent?.length || 0);
      if (prefix >= offset && full.length - suffix <= end) {
        const text = node.textContent || "";
        node.textContent =
          text.slice(0, prefix - offset) +
          next.slice(prefix, next.length - suffix) +
          text.slice(full.length - suffix - offset);
        changed = true;
        break;
      }
      offset = end;
    }
    if (el.hasAttribute("data-photo-editorial-text")) {
      el.innerHTML = photoEditorialMarkup(next, el.dataset.photoEditorialText === "finale", el.dataset.photoEmphasis);
    } else if (!changed) el.textContent = next;
    el.style.whiteSpace = "pre-wrap";
    if (patch.remove) {
      if (photoNodes(doc).includes(el)) {
        data.photo_index = null;
        data.slide_type = "text_only";
      }
      el.remove();
    }
  }
  const styles = patch.styles || {};
  // Un bloc ancré par le bas ou par les deux côtés (cadre en verre) passe en
  // coordonnées haut/gauche explicites, sinon il s'étirerait au lieu de bouger.
  if (styles.top !== undefined && styles.bottom === undefined) el.style.removeProperty("bottom");
  if (styles.left !== undefined && styles.right === undefined && el.style.right) {
    const left = px(el.style.left), right = px(el.style.right);
    if (!el.style.width && styles.width === undefined && left !== null && right !== null)
      el.style.width = `${SLIDE_W - left - right}px`;
    el.style.removeProperty("right");
  }
  Object.entries(styles).forEach(([key, value]) =>
    value === "" ? el.style.removeProperty(key) : el.style.setProperty(key, value),
  );
  if (el.hasAttribute("data-photo-editorial-text")) {
    if (patch.styles?.["font-family"]) el.style.setProperty("--photo-title-font", patch.styles["font-family"]);
    if (patch.styles?.color) el.style.setProperty("--photo-heading", patch.styles.color);
  }
  if (Object.keys(styles).length) syncGlass(doc);
  return { ...slide, data, html: serialize(doc) };
}
export function replacePhoto(
  slide: EditorSlide,
  id: string | null,
  source: string,
  photoIndex: number,
): EditorSlide {
  if (
    slide.locked ||
    !/^(data:image\/(png|jpeg|webp|gif);base64,|https:\/\/)/i.test(source)
  )
    return slide;
  const doc = parse(slide.html);
  let el =
    photoNodes(doc).find((e) => e.dataset.editorId === id) ||
    photoNodes(doc)[0];
  if (!el) {
    el = doc.createElement("div");
    el.dataset.editorPhoto = "true";
    el.style.cssText =
      "position:absolute;inset:0;background-size:cover;background-position:center;z-index:0";
    const root = doc.body.firstElementChild as HTMLElement;
    if (!root) return slide;
    root.prepend(el);
    textNodes(doc).forEach((e) => {
      if (!e.style.position) e.style.position = "relative";
      e.style.zIndex = "1";
    });
  }
  if (el.tagName === "IMG") el.setAttribute("src", source);
  else el.style.backgroundImage = `url("${source.replace(/["\\\n\r]/g, "")}")`;
  el.setAttribute("data-pptx-photo", String(photoIndex));
  syncGlass(doc);
  const { studio_image_receipt: _receipt, studio_image_source: _source, photo_library_id: _library, ...photoData } = slide.data;
  return {
    ...slide,
    data: {
      ...photoData,
      photo_index: photoIndex,
      slide_type:
        slide.data.slide_type === "text_only"
          ? "photo_integrated"
          : slide.data.slide_type,
    },
    html: prepareSlideHtml(serialize(doc)),
  };
}
/** Styles réels du carrousel (charte de la personne), extraits du document. */
export interface StyleTokens {
  fontImports: string;
  titleFont: string;
  bodyFont: string;
  titleColor: string;
  bodyColor: string;
  background: string;
  titleSize: string;
  bodySize: string;
  titleWeight: string;
  align: string;
}
export const DEFAULT_TOKENS: StyleTokens = {
  fontImports: "",
  titleFont: "Georgia, serif",
  bodyFont: "Helvetica, Arial, sans-serif",
  titleColor: "#1a1a1a",
  bodyColor: "#1a1a1a",
  background: "#ffffff",
  titleSize: "72px",
  bodySize: "40px",
  titleWeight: "500",
  align: "left",
};
function inherited(el: HTMLElement | null, key: string): string {
  for (let n = el; n; n = n.parentElement) {
    const value = n.style.getPropertyValue(key);
    if (value) return value;
  }
  return "";
}
function pick(doc: Document, role: "title" | "body"): HTMLElement | null {
  return (
    doc.body.querySelector<HTMLElement>(
      `[data-pptx-editable="${role}"],[data-slide-text="${role}"]`,
    ) ||
    doc.body.querySelector<HTMLElement>(role === "title" ? "h1,h2" : "p") ||
    null
  );
}
/**
 * Extrait la charte réellement utilisée par une slide : polices, couleurs,
 * fond et imports de polices. Aucun style générique n'est inventé quand la
 * slide en porte déjà un.
 */
export function extractStyleTokens(html?: string): StyleTokens {
  if (!html) return { ...DEFAULT_TOKENS };
  const doc = parse(html);
  const root = doc.body.firstElementChild as HTMLElement | null;
  const title = pick(doc, "title"),
    body = pick(doc, "body");
  const fontImports = Array.from(doc.head.children)
    .map((el) => el.outerHTML)
    .concat(
      Array.from(
        doc.body.querySelectorAll<HTMLElement>("style,link[rel=stylesheet]"),
      ).map((el) => el.outerHTML),
    )
    .filter((markup) => /@import|@font-face|fonts\.(googleapis|gstatic)/i.test(markup))
    .join("");
  const rootBg =
    root?.style.backgroundColor ||
    (root?.style.background || "").match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/i)?.[0] ||
    "";
  return {
    fontImports,
    titleFont:
      inherited(title, "font-family") ||
      inherited(root, "font-family") ||
      DEFAULT_TOKENS.titleFont,
    bodyFont:
      inherited(body, "font-family") ||
      inherited(root, "font-family") ||
      DEFAULT_TOKENS.bodyFont,
    titleColor:
      inherited(title, "color") ||
      inherited(root, "color") ||
      DEFAULT_TOKENS.titleColor,
    bodyColor:
      inherited(body, "color") ||
      inherited(root, "color") ||
      DEFAULT_TOKENS.bodyColor,
    background: rootBg || DEFAULT_TOKENS.background,
    titleSize: title?.style.fontSize || DEFAULT_TOKENS.titleSize,
    bodySize: body?.style.fontSize || DEFAULT_TOKENS.bodySize,
    titleWeight: title?.style.fontWeight || DEFAULT_TOKENS.titleWeight,
    align:
      inherited(body, "text-align") ||
      inherited(root, "text-align") ||
      DEFAULT_TOKENS.align,
  };
}
/** Charte du carrousel entier : première slide qui porte des styles réels. */
export function documentTokens(slides: { html: string }[]): StyleTokens {
  for (const slide of slides) {
    const tokens = extractStyleTokens(slide.html);
    if (tokens.titleFont !== DEFAULT_TOKENS.titleFont || tokens.fontImports)
      return tokens;
  }
  return extractStyleTokens(slides[0]?.html);
}
const readableFont = (value: string) =>
  value.split(",")[0].replace(/["']/g, "").trim();
/** Polices réellement présentes dans le carrousel, avec un nom lisible. */
export function listDocumentFonts(
  slides: { html: string }[],
): { value: string; label: string }[] {
  const found = new Map<string, string>();
  slides.forEach((slide) => {
    const doc = parse(slide.html);
    doc.body.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
      let value = el.style.getPropertyValue("font-family");
      const variable = value.match(/^var\((--[\w-]+)\)$/)?.[1];
      if (variable) value = inherited(el, variable);
      const label = readableFont(value);
      if (label && !found.has(label)) found.set(label, value);
    });
  });
  return Array.from(found, ([label, value]) => ({ label, value }));
}
export function addTextElement(slide: EditorSlide): EditorSlide {
  if (slide.locked) return slide;
  const tokens = extractStyleTokens(slide.html);
  const doc = parse(slide.html),
    el = doc.createElement("p");
  el.textContent = "Ton texte";
  el.dataset.pptxEditable = "body";
  // Aucun bloc blanc générique : on reprend la charte de la slide.
  const size = Math.max(38, parseFloat(tokens.bodySize) || 40);
  el.style.cssText = `position:absolute;left:100px;top:550px;width:880px;font-size:${size}px;font-family:${tokens.bodyFont};line-height:1.3;color:${tokens.bodyColor};text-align:${tokens.align};padding:0;z-index:5;white-space:pre-wrap`;
  doc.body.firstElementChild?.append(el);
  return { ...slide, html: prepareSlideHtml(serialize(doc)) };
}
export function restyleSlide(
  slide: EditorSlide,
  styles: Record<string, string>,
  target: "root" | "texts" = "root",
): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const elements =
    target === "texts"
      ? textNodes(doc)
      : [doc.body.firstElementChild as HTMLElement].filter(Boolean);
  elements.forEach((el) => {
    Object.entries(styles).forEach(([k, v]) => el.style.setProperty(k, v));
    if (el.hasAttribute("data-photo-editorial-text")) {
      if (styles["font-family"]) el.style.setProperty("--photo-title-font", styles["font-family"]);
      if (styles.color) el.style.setProperty("--photo-heading", styles.color);
    }
  });
  return { ...slide, html: serialize(doc) };
}
export function makeSlide(
  data: Record<string, any> = {},
  type = "text_only",
  photo = "",
  tokens: StyleTokens = DEFAULT_TOKENS,
): EditorSlide {
  const title = String(data.title || data.overlay_text || "Ton titre"),
    body = String(data.body || "");
  const escape = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const bg = type === "photo_full" ? "#111111" : tokens.background,
    titleColor = type === "photo_full" ? "#ffffff" : tokens.titleColor,
    bodyColor = type === "photo_full" ? "#ffffff" : tokens.bodyColor;
  const titleSize = Math.max(38, parseFloat(tokens.titleSize) || 72),
    bodySize = Math.max(38, parseFloat(tokens.bodySize) || 40);
  const html = `${tokens.fontImports}<div style="width:1080px;height:1350px;position:relative;overflow:hidden;background:${bg};color:${bodyColor};font-family:${tokens.bodyFont};text-align:${tokens.align}">${photo && type !== "text_only" ? `<img data-pptx-photo="${data.photo_index || 1}" src="${escape(photo)}" style="position:absolute;left:0;top:0;width:1080px;height:${type === "photo_full" ? 1350 : 650}px;object-fit:cover;object-position:50% 50%">` : ""}<div style="position:absolute;left:80px;top:${type === "photo_integrated" ? 700 : 160}px;width:920px;${type === "photo_full" ? "background:rgba(0,0,0,.65);padding:28px;box-sizing:border-box;" : ""}"${type === "photo_full" ? ' data-pptx-shape="card"' : ""}><h1 data-slide-text="title" data-pptx-editable="title" style="font-size:${titleSize}px;font-family:${tokens.titleFont};color:${titleColor};line-height:1.1;font-weight:${tokens.titleWeight};margin:0 0 40px;white-space:pre-wrap">${escape(title)}</h1><p data-slide-text="body" data-pptx-editable="body" style="font-size:${bodySize}px;font-family:${tokens.bodyFont};color:${bodyColor};line-height:1.4;white-space:pre-wrap">${escape(body)}</p></div><span data-slide-page style="position:absolute;bottom:65px;right:80px;font-size:24px">1 / 1</span></div>`;
  return {
    id: newId(),
    data: { ...data, title, body, slide_type: type },
    html: prepareSlideHtml(html),
  };
}

export function renumberDocument(document: CarouselDocument): CarouselDocument {
  const total = document.slides.length;
  return {
    ...document,
    slides: document.slides.map((slide, index) => {
      const doc = parse(slide.html),
        previous = slide.data.slide_number;
      doc
        .querySelectorAll<HTMLElement>("[data-slide-page]")
        .forEach((el) => (el.textContent = `${index + 1} / ${total}`));
      textNodes(doc).forEach((el) => {
        if (
          new RegExp(`^${previous}\\s*/\\s*\\d+$`).test(
            el.textContent?.trim() || "",
          )
        ) {
          el.textContent = `${index + 1} / ${total}`;
          el.dataset.slidePage = "true";
        }
      });
      return {
        ...slide,
        data: { ...slide.data, slide_number: index + 1 },
        html: serialize(doc),
      };
    }),
  };
}
export function readCarouselDocument(
  raw: any,
  visuals: { slide_number: number; html: string }[],
): CarouselDocument {
  const data = raw?.raw || raw || {};
  const slides = data.slides || data.carousel?.slides || [];
  const document = renumberDocument({
    caption: data.caption || data.carousel?.caption || {},
    slides: visuals.map((v, i) => ({
      id: slides[i]?.editor_id || newId(),
      data: slides.find((s: any) => s.slide_number === v.slide_number) ||
        slides[i] || { slide_number: i + 1 },
      locked: !!slides[i]?.editor_locked,
      html: prepareSlideHtml(v.html),
    })),
  });
  // Older saved output may combine edited source text with an outdated preview.
  // Repair anchored text on import; editor-authored HTML already is authoritative.
  if (!data.carousel_editor_version)
    document.slides = document.slides.map((slide) => {
      let next = slide;
      getEditorElements(slide.html).forEach((el) => {
        const field = el.field === "overlay" ? "overlay_text" : el.field;
        if (
          field &&
          ["title", "body", "overlay_text"].includes(field) &&
          typeof slide.data[field] === "string" &&
          slide.data[field] !== el.text
        )
          next = patchElement(next, el.id, { text: slide.data[field] });
      });
      return next;
    });
  return document;
}
export function documentOutput(document: CarouselDocument, raw: any) {
  const slides = document.slides.map((s) => ({
    ...s.data,
    editor_id: s.id,
    editor_locked: !!s.locked,
  }));
  const visualSlides = document.slides.map((s, i) => ({
    slide_number: i + 1,
    html: s.html,
  }));
  return {
    raw: {
      ...raw,
      edited_text: undefined,
      slides,
      caption: document.caption,
      visual_html: visualSlides,
      carousel_editor_version: 1,
      _carousel_document_id: raw._carousel_document_id || newId(),
    },
    visualSlides,
  };
}
export function captionText(caption: any): string {
  if (caption?.fullText !== undefined) return caption.fullText;
  const tags = Array.isArray(caption?.hashtags)
    ? caption.hashtags
        .map((t: string) => (t.startsWith("#") ? t : `#${t}`))
        .join(" ")
    : caption?.hashtags;
  return [caption?.hook, caption?.body, caption?.cta, tags]
    .filter(Boolean)
    .join("\n\n");
}
export function captionFromText(text: string) {
  const lines = text.split("\n");
  const last = lines[lines.length - 1]?.trim() || "";
  const hashtags = /^(#\S+\s*)+$/.test(last)
    ? lines.pop()!.match(/#\S+/g) || []
    : [];
  return {
    fullText: text,
    hook: lines.shift() || "",
    body: lines.join("\n").trim(),
    cta: "",
    hashtags,
  };
}

/** Move the existing overlay group, preserving its content, panel and typography. */
export function positionPhotoText(slide: EditorSlide, position: "top_left" | "bottom_left" | "center"): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const group = doc.querySelector<HTMLElement>("[data-photo-text-layout]");
  if (!group) return slide;
  group.dataset.photoTextLayout = position;
  group.style.justifyContent = position === "center" ? "center" : position === "top_left" ? "flex-start" : "flex-end";
  group.style.alignItems = position === "center" ? "center" : "flex-start";
  group.style.textAlign = position === "center" ? "center" : "left";
  group.querySelectorAll<HTMLElement>("[data-photo-editorial-text]").forEach(el => {
    el.style.textAlign = group.style.textAlign;
  });
  // Existing gradient must follow the words too. A centered block needs a full veil.
  for (const scrim of doc.querySelectorAll<HTMLElement>("[data-injected-scrim]")) {
    // Keep the brand tint of the veil (black for older slides).
    const tint = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(scrim.getAttribute("style") || "");
    const rgb = tint ? `${tint[1]},${tint[2]},${tint[3]}` : "0,0,0";
    // L'intensité réglée par la personne est conservée (0,85 par défaut).
    const peak = veilAlpha(scrim.getAttribute("style") || "") ?? 0.85;
    scrim.style.top = position === "bottom_left" ? "auto" : "0";
    scrim.style.bottom = position === "bottom_left" ? "0" : "auto";
    scrim.style.height = position === "center" ? "1350px" : "66%";
    scrim.style.removeProperty("background");
    // Written into the attribute: some DOM implementations drop gradients set through CSSOM.
    const veil = position === "center" ? `rgba(${rgb},${peak})` : `linear-gradient(${position === "top_left" ? "180deg" : "0deg"},rgba(${rgb},${peak}) 0%,rgba(${rgb},0) 100%)`;
    scrim.setAttribute("style", `${(scrim.getAttribute("style") || "").replace(/;?\s*$/, ";")}background:${veil};`);
  }
  // Verre dépoli : la carte est positionnée en absolu et sa copie floutée de la
  // photo doit rester calée sur la photo de fond (mêmes décalages, signes opposés).
  const glassY = position === "top_left" ? 110 : position === "center" ? 420 : null;
  for (const card of doc.querySelectorAll<HTMLElement>("[data-photo-glass]")) {
    if (glassY === null) {
      card.style.removeProperty("top"); card.style.bottom = "200px";
    } else {
      card.style.removeProperty("bottom"); card.style.top = `${glassY}px`;
    }
  }
  syncGlass(doc);
  return { ...slide, data: { ...slide.data, overlay_position: position }, html: serialize(doc) };
}

/** Intensité (alpha le plus fort) d'un voile : dégradé ou couleur unie. */
export function veilAlpha(style: string): number | null {
  const alphas = Array.from(style.matchAll(/rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*([\d.]+)\s*\)/gi))
    .map((m) => parseFloat(m[1]))
    .filter((a) => a > 0);
  return alphas.length ? Math.max(...alphas) : null;
}
/**
 * Règle l'intensité d'un voile en réécrivant ses alphas dans le même format
 * (l'export PowerPoint ne relit que ce format, jamais la propriété opacity).
 */
export function setVeilAlpha(slide: EditorSlide, id: string, alpha: number): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
  const style = el?.getAttribute("style") || "";
  const current = veilAlpha(style);
  if (!el || current === null) return slide;
  const a = Math.round(Math.min(1, Math.max(0.05, alpha)) * 100) / 100;
  el.setAttribute(
    "style",
    style.replace(/(rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*)([\d.]+)(\s*\))/gi, (m, head, value, tail) =>
      parseFloat(value) > 0 ? `${head}${Math.round((parseFloat(value) / current) * a * 100) / 100}${tail}` : m,
    ),
  );
  return { ...slide, html: serialize(doc) };
}
/** Couleur et opacité du fond d'une forme ; le verre garde sa seconde couche. */
export function setShapeFill(slide: EditorSlide, id: string, hex: string, alpha: number): EditorSlide {
  if (slide.locked || !/^#[0-9a-f]{6}$/i.test(hex)) return slide;
  const doc = parse(slide.html);
  const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
  if (!el) return slide;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 100) / 100;
  el.style.removeProperty("background");
  el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
  if (el.hasAttribute("data-photo-glass")) {
    const inner = Array.from(el.children as HTMLCollectionOf<HTMLElement>).find((c) => !c.hasAttribute("data-photo-glass-blur"));
    if (inner) inner.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${Math.round(a * 0.72 * 100) / 100})`;
    // Un verre sans opacité n'est plus du verre : la copie floue disparaît avec.
    const blur = el.querySelector<HTMLElement>("[data-photo-glass-blur]");
    if (blur) blur.style.opacity = a === 0 ? "0" : "1";
  }
  return { ...slide, html: serialize(doc) };
}
/** Duplique un texte ou une forme juste après l'original (copie non liée au texte source). */
export function duplicateElement(slide: EditorSlide, id: string): { slide: EditorSlide; id: string | null } {
  if (slide.locked) return { slide, id: null };
  const doc = parse(slide.html);
  const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
  if (!el || photoNodes(doc).includes(el) || el.hasAttribute("data-injected-scrim") || el.hasAttribute("data-photo-glass")) return { slide, id: null };
  const copy = el.cloneNode(true) as HTMLElement;
  [copy, ...Array.from(copy.querySelectorAll<HTMLElement>("*"))].forEach((node) => {
    node.removeAttribute("data-editor-id");
    // La copie n'est pas le texte source : sinon une retouche réécrirait les deux.
    node.removeAttribute("data-slide-text");
    node.removeAttribute("data-slide-page");
  });
  if (copy.style.position === "absolute") {
    copy.style.top = `${(px(copy.style.top) ?? 0) + 40}px`;
    copy.style.left = `${(px(copy.style.left) ?? 0) + 40}px`;
  }
  copy.setAttribute("data-editor-copy", "true");
  copy.setAttribute("data-editor-free", "true");
  el.after(copy);
  const html = prepareSlideHtml(serialize(doc));
  const next = parse(html).querySelector<HTMLElement>("[data-editor-copy]");
  const nextId = next?.dataset.editorId || null;
  return { slide: { ...slide, html: html.replace(/ data-editor-copy="true"/, "") }, id: nextId };
}
/** Ajoute une forme pleine sous les textes (au-dessus de la photo). */
export function addShapeElement(slide: EditorSlide): { slide: EditorSlide; id: string | null } {
  if (slide.locked) return { slide, id: null };
  const tokens = extractStyleTokens(slide.html);
  const doc = parse(slide.html);
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return { slide, id: null };
  const shape = doc.createElement("div");
  shape.setAttribute("data-pptx-shape", "card");
  shape.setAttribute("data-editor-new", "true");
  const color = /^#[0-9a-f]{6}$/i.test(tokens.titleColor) ? tokens.titleColor : "#1a1a1a";
  shape.style.cssText = `position:absolute;left:140px;top:475px;width:800px;height:400px;background-color:${color};border-radius:24px;`;
  // Juste après le calque photo : la forme passe sous les textes déjà posés.
  const photo = mainPhoto(doc);
  const layer = photo && Array.from(root.children).find((c) => c === photo || c.contains(photo));
  if (layer) layer.after(shape);
  else root.prepend(shape);
  const html = prepareSlideHtml(serialize(doc));
  const id = parse(html).querySelector<HTMLElement>("[data-editor-new]")?.dataset.editorId || null;
  return { slide: { ...slide, html: html.replace(/ data-editor-new="true"/, "") }, id };
}
