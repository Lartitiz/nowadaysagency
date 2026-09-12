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
function textNodes(doc: Document): HTMLElement[] {
  return Array.from(doc.body.querySelectorAll<HTMLElement>("*")).filter(
    (el) => {
      if (
        el.matches(skip) ||
        (!el.textContent?.trim() &&
          !el.hasAttribute("data-slide-text") &&
          !el.hasAttribute("data-pptx-editable"))
      )
        return false;
      if (el.parentElement?.closest("[data-slide-text],[data-pptx-editable]")) return false;
      return (
        el.hasAttribute("data-slide-text") ||
        el.hasAttribute("data-pptx-editable") ||
        !Array.from(el.children).some(
          (c) => c.textContent?.trim() && !c.matches(skip),
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
export function prepareSlideHtml(html: string): string {
  const doc = parse(html);
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
  const elements = new Set<HTMLElement>([
    ...textNodes(doc),
    ...photoNodes(doc),
    ...Array.from(doc.body.querySelectorAll<HTMLElement>("[data-pptx-shape]")),
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
  let data = { ...slide.data };
  if (patch.text !== undefined || patch.remove) {
    const old = el.textContent?.trim() || "";
    const next = patch.remove ? "" : patch.text!;
    if (old) data = replaceData(data, old, next);
    const field = el.dataset.slideText;
    if (field && ["title", "body", "overlay"].includes(field))
      data[field === "overlay" ? "overlay_text" : field] = next;
    if (field === "cta") data.cta_label = next;
    // A numerical callout must follow its source sentence. Only a single changed
    // number and exact standalone duplicates qualify; unrelated values are kept.
    const numberPattern = /\d+(?:[.,]\d+)?\s*(?:%|×|h)?/g;
    const before = old.match(numberPattern) || [],
      after = next.match(numberPattern) || [];
    if (before.length === 1 && after.length === 1 && before[0] !== after[0]) {
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
    if (!changed) el.textContent = next;
    el.style.whiteSpace = "pre-wrap";
    if (patch.remove) {
      if (photoNodes(doc).includes(el)) {
        data.photo_index = null;
        data.slide_type = "text_only";
      }
      el.remove();
    }
  }
  Object.entries(patch.styles || {}).forEach(([key, value]) =>
    el.style.setProperty(key, value),
  );
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
  return {
    ...slide,
    data: {
      ...slide.data,
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
      const value = el.style.getPropertyValue("font-family");
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
  elements.forEach((el) =>
    Object.entries(styles).forEach(([k, v]) => el.style.setProperty(k, v)),
  );
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
  const html = `${tokens.fontImports}<div style="width:1080px;height:1350px;position:relative;overflow:hidden;background:${bg};color:${bodyColor};font-family:${tokens.bodyFont};text-align:${tokens.align}">${photo && type !== "text_only" ? `<img data-pptx-photo="${data.photo_index || 1}" src="${escape(photo)}" style="position:absolute;left:0;top:0;width:1080px;height:${type === "photo_full" ? 1350 : 650}px;object-fit:cover;object-position:50% 50%">` : ""}<div style="position:absolute;left:80px;top:${type === "photo_integrated" ? 700 : 160}px;width:920px;${type === "photo_full" ? "background:rgba(0,0,0,.65);padding:28px;box-sizing:border-box;" : ""}"><h1 data-slide-text="title" data-pptx-editable="title" style="font-size:${titleSize}px;font-family:${tokens.titleFont};color:${titleColor};line-height:1.1;font-weight:${tokens.titleWeight};margin:0 0 40px;white-space:pre-wrap">${escape(title)}</h1><p data-slide-text="body" data-pptx-editable="body" style="font-size:${bodySize}px;font-family:${tokens.bodyFont};color:${bodyColor};line-height:1.4;white-space:pre-wrap">${escape(body)}</p></div><span data-slide-page style="position:absolute;bottom:65px;right:80px;font-size:24px">1 / 1</span></div>`;
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
