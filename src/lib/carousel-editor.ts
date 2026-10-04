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
  role?: "glass" | "veil" | "shape" | "background";
  /** Forme qui contient des textes : on la déplace avec eux, comme un groupe. */
  frame?: boolean;
  /** Nature d'un décor rendu choisissable (frise d'étape, schéma, bloc de texte). */
  name?: string;
  /** Texte éditorial posé sur un voile en dégradé (style « bord ») réglable. */
  editorialVeil?: boolean;
  /** Texte éditorial : phrase mise en valeur, sa couleur, les phrases possibles. */
  emphasis?: { sentence: string; color: string; choices: string[] };
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
/**
 * Fond de la slide (racine 1080×1350, `data-pptx-shape="background"`) ou
 * surlignage d'un mot : jamais un cadre qu'on emporte en glissant un texte.
 */
export function isPassiveShape(el: Element): boolean {
  return (
    el.parentElement === el.ownerDocument.body ||
    el.matches('[data-pptx-shape="background"],[data-pptx-shape="highlight"],[data-editor-shape="texture"]')
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
    // Les retouches de la photo (luminosité, noir et blanc…) valent aussi pour sa copie floue.
    const tone = photo.style.filter && photo.style.filter !== "none" ? photo.style.filter : "";
    blur.style.filter = `blur(28px) ${tone}`.trim();
    if (tone) blur.setAttribute("data-photo-filter", tone);
    else blur.removeAttribute("data-photo-filter");
  });
}

/** Un style en ligne peint-il quelque chose (fond, dégradé, bordure) ? */
function paints(el: Element): boolean {
  const st = (el as HTMLElement).style;
  if (!st) return false;
  const raw = el.getAttribute("style") || "";
  // jsdom perd les dégradés en CSSOM : on relit aussi l'attribut.
  if (/gradient\(/i.test(raw) || /gradient\(/i.test(st.backgroundImage || "")) return true;
  const color = (st.backgroundColor || "").trim();
  if (color && !/^(transparent|initial|inherit|none)$/i.test(color) && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color)) return true;
  return /border(?:-(?:top|right|bottom|left))?\s*:\s*[^;]*\d+px\s+(?:solid|dashed|dotted|double)/i.test(raw);
}
function coversSlide(el: HTMLElement): boolean {
  const st = el.style;
  const full = (v: string, n: number) => v === "100%" || v === `${n}px`;
  return (
    /(^|;)\s*inset\s*:\s*0/.test(el.getAttribute("style") || "") ||
    ((px(st.top) ?? 0) === 0 && (px(st.left) ?? 0) === 0 && st.position === "absolute" &&
      (full(st.width, 1080) || st.right === "0px" || st.right === "0") &&
      (full(st.height, 1350) || st.bottom === "0px" || st.bottom === "0"))
  );
}
/**
 * Décors des slides dessinées par l'IA (ligne de frise, séparateurs, boîtes,
 * barres, dessins SVG) : ils n'avaient pas d'ancre et un clic choisissait la
 * slide entière. Ils deviennent des calques ; ils restent dans l'image
 * exportée (pas de data-pptx-shape) et hors du contrôle qualité (décor).
 */
function tagDecors(doc: Document) {
  const root = doc.body.firstElementChild;
  if (!root) return;
  const texts = new Set(textNodes(doc));
  const photos = new Set(photoNodes(doc));
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (
      el.hasAttribute("data-editor-shape") || el.hasAttribute("data-pptx-shape") || el.hasAttribute("data-editor-id") ||
      texts.has(el) || photos.has(el) || el.matches("[data-injected-scrim],[data-photo-glass-blur],[data-photo-glass-blur] *,svg *,style,script") ||
      el.closest("[data-slide-text],[data-pptx-editable],[data-photo-glass-blur]") ||
      // Les morceaux d'un ensemble déjà choisissable (barres d'une frise,
      // seconde couche du verre…) suivent leur ensemble.
      el.parentElement?.closest('[data-photo-glass],[data-editor-shape="etape"],[data-editor-shape="motif"],[data-editor-shape="dessin"],[data-editor-shape="texture"]')
    )
      return;
    const svg = el.tagName.toLowerCase() === "svg";
    if (!svg && !paints(el)) return;
    if (svg && el.closest("[data-editor-shape]") && el.closest("[data-editor-shape]") !== el) return;
    el.setAttribute("data-editor-shape", coversSlide(el) ? "texture" : svg ? "dessin" : "decor");
    el.setAttribute("data-decorative", "true");
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
  if (!photoNodes(doc).some((el) => !el.hasAttribute("data-editor-photo-empty"))) {
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
  // Décors sans ancre : frise d'étape, schéma dessiné, colonne de texte des
  // slides mixtes. Ils restent dans l'image exportée (pas de data-pptx-shape).
  doc.querySelectorAll<HTMLElement>('[data-photo-format="etape"]').forEach((el) => el.setAttribute("data-editor-shape", "etape"));
  doc.querySelectorAll<Element>('svg[data-photo-format="motif"]').forEach((el) => el.setAttribute("data-editor-shape", "motif"));
  doc.querySelectorAll<HTMLElement>("[data-mix-text]").forEach((el) => {
    if (!el.hasAttribute("data-pptx-shape")) el.setAttribute("data-editor-shape", "group");
  });
  tagDecors(doc);
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
          role: el.parentElement === doc.body || el.matches('[data-pptx-shape="background"]')
            ? ("background" as const)
            : el.hasAttribute("data-photo-glass")
            ? ("glass" as const)
            : el.hasAttribute("data-injected-scrim")
              ? ("veil" as const)
              : ("shape" as const),
          frame: !!el.querySelector("[data-editor-id]") && !isPassiveShape(el),
          ...(el.getAttribute("data-editor-shape") ? { name: el.getAttribute("data-editor-shape")! } : {}),
        }
      : {}),
    ...(texts.has(el) && doc.querySelector("style[data-photo-editorial-veil]") &&
    (el.hasAttribute("data-photo-editorial-text") || el.closest("[data-photo-editorial-text]"))
      ? { editorialVeil: true }
      : {}),
    ...(el.hasAttribute("data-photo-editorial-text")
      ? {
          emphasis: {
            sentence: el.querySelector('[data-photo-text-part="emphasis"]')?.textContent?.trim() || "",
            color: el.style.getPropertyValue("--photo-heading").trim(),
            choices: emphasisChoices(el.textContent || ""),
          },
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
    el.setAttribute("data-editor-unwrapped", id);
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
    // La phrase mise en valeur suit la couleur du texte, sauf si sa couleur a
    // été choisie à part (elle perdait alors son contraste).
    if (patch.styles?.color && !el.hasAttribute("data-emphasis-color"))
      el.style.setProperty("--photo-heading", patch.styles.color);
  }
  if (Object.keys(styles).length) syncGlass(doc);
  const patched = { ...slide, data, html: serialize(doc) };
  // Une police Google appliquée (style enregistré, report sur toutes les
  // slides…) doit être chargée par la slide, sinon aperçu et export la remplacent.
  return styles["font-family"] ? withGoogleFonts(patched, styles["font-family"]) : patched;
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
  // Nouvelle photo : le recadrage de l'ancienne (zoom, point de vue) ne lui va pas.
  if (el.style.getPropertyValue("--editor-zoom")) {
    if (el.tagName === "IMG") {
      const base = el.style.getPropertyValue("--editor-base-transform");
      if (base) el.style.transform = base;
      else el.style.removeProperty("transform");
      el.style.removeProperty("--editor-base-transform");
    } else el.style.backgroundSize = "cover";
    el.style.removeProperty("--editor-zoom");
  }
  if (el.tagName === "IMG") {
    if (el.style.objectPosition) el.style.objectPosition = "50% 50%";
  } else if (el.style.backgroundPosition) el.style.backgroundPosition = "50% 50%";
  el.setAttribute("data-pptx-photo", String(photoIndex));
  if (el.hasAttribute("data-editor-photo-empty")) {
    el.removeAttribute("data-editor-photo-empty");
    el.style.removeProperty("background-color");
  }
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
      if (styles.color && !el.hasAttribute("data-emphasis-color")) el.style.setProperty("--photo-heading", styles.color);
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
    node.removeAttribute("data-editor-locked");
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

/* ─── Calques ─────────────────────────────────────────────────────────── */

export interface LayerItem {
  id: string;
  kind: EditorElement["kind"];
  role?: EditorElement["role"];
  frame?: boolean;
  label: string;
  depth: number;
  hidden: boolean;
  /** Seuls les calques de premier niveau changent d'ordre (z-index). */
  topLevel: boolean;
  /** Fond de la slide : ni déplacé, ni masqué, ni retiré depuis les calques. */
  fixed?: boolean;
  /** Élément verrouillé : sélectionnable, mais plus déplacé ni retouché. */
  locked?: boolean;
}
export interface RemovedLayer {
  html: string;
  /** Chemin d'index depuis la racine de la slide jusqu'au parent. */
  path: number[];
  index: number;
  label: string;
  field?: string;
  text?: string;
  /** Identifiant du cadre dont on a seulement retiré le fond. */
  unwrapOf?: string;
}
const MAX_REMOVED = 20;
const MAX_REMOVED_HTML = 150_000;

export function layerLabel(e: Pick<EditorElement, "kind" | "role" | "frame" | "text" | "name">): string {
  if (e.kind === "photo") return "Photo";
  if (e.role === "background") return "Fond de la slide";
  if (e.role === "glass") return "Cadre en verre";
  if (e.role === "veil") return "Voile sur la photo";
  if (e.name === "etape") return "Frise d'étape";
  if (e.name === "motif") return "Schéma dessiné";
  if (e.name === "group") return "Bloc de texte";
  if (e.name === "groupe") return "Groupe";
  if (e.name === "texture") return "Texture de fond";
  if (e.name === "dessin") return "Dessin";
  if (e.name === "decor") return e.frame ? "Encadré" : "Décor";
  if (e.kind === "shape") return e.frame ? "Cadre du texte" : "Forme";
  return e.text.trim().slice(0, 40) || "Texte vide";
}
function zOf(el: HTMLElement): number {
  const z = parseInt(el.style.zIndex, 10);
  return Number.isFinite(z) ? z : 0;
}
/** Cadre parent dans les calques ; le fond de la slide n'en est pas un. */
function editorParent(el: HTMLElement): HTMLElement | null {
  const p = el.parentElement?.closest<HTMLElement>("[data-editor-id]") || null;
  return p && isPassiveShape(p) && p.matches('[data-pptx-shape="background"]') ? null : p;
}
/** Calques de premier niveau, du fond vers le dessus (ordre de peinture approché). */
function topLayers(doc: Document): HTMLElement[] {
  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("[data-editor-id]"));
  return all
    .map((el, i) => ({ el, i }))
    .filter(({ el }) => !editorParent(el))
    .sort((a, b) =>
      Number(!a.el.matches('[data-pptx-shape="background"]')) - Number(!b.el.matches('[data-pptx-shape="background"]')) ||
      zOf(a.el) - zOf(b.el) || a.i - b.i)
    .map(({ el }) => el);
}
/** Liste des calques, le plus haut en premier, les textes d'un cadre sous lui. */
export function listLayers(html: string): LayerItem[] {
  const doc = parse(html);
  const info = new Map(getEditorElements(html).map((e) => [e.id, e]));
  const out: LayerItem[] = [];
  const visit = (el: HTMLElement, depth: number) => {
    const e = info.get(el.dataset.editorId!);
    if (!e) return;
    out.push({
      id: e.id,
      kind: e.kind,
      role: e.role,
      frame: e.frame,
      label: layerLabel(e),
      depth,
      hidden: el.hasAttribute("data-editor-hidden"),
      locked: el.hasAttribute("data-editor-locked"),
      topLevel: depth === 0 && e.role !== "background",
      ...(e.role === "background" ? { fixed: true } : {}),
    });
    Array.from(el.querySelectorAll<HTMLElement>("[data-editor-id]"))
      .filter((child) => editorParent(child) === el)
      .reverse()
      .forEach((child) => visit(child, depth + 1));
  };
  topLayers(doc).reverse().forEach((el) => visit(el, 0));
  return out;
}
/** Masque ou réaffiche un calque (un calque masqué n'est ni exporté ni publié). */
export function setLayerHidden(slide: EditorSlide, id: string, hidden: boolean): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
  if (!el || el.hasAttribute("data-editor-hidden") === hidden) return slide;
  if (hidden) {
    if (el.style.display) el.setAttribute("data-editor-display", el.style.display);
    el.style.display = "none";
    el.setAttribute("data-editor-hidden", "true");
  } else {
    const previous = el.getAttribute("data-editor-display");
    if (previous) el.style.display = previous;
    else el.style.removeProperty("display");
    el.removeAttribute("data-editor-display");
    el.removeAttribute("data-editor-hidden");
  }
  return { ...slide, html: serialize(doc) };
}
/** Monte (vers le dessus) ou descend un calque de premier niveau d'un cran. */
export function moveLayer(slide: EditorSlide, id: string, direction: "up" | "down"): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const order = topLayers(doc).filter((el) => !el.matches('[data-pptx-shape="background"]'));
  const from = order.findIndex((el) => el.dataset.editorId === id);
  const to = from + (direction === "up" ? 1 : -1);
  if (from < 0 || to < 0 || to >= order.length) return slide;
  [order[from], order[to]] = [order[to], order[from]];
  // L'ordre affiché devient la vérité : chaque calque reçoit son rang.
  order.forEach((el, i) => {
    el.style.zIndex = String(i + 1);
    if (!el.style.position || el.style.position === "static") el.style.position = "relative";
  });
  return { ...slide, html: serialize(doc) };
}
function pathTo(root: Element, node: Element): number[] {
  const path: number[] = [];
  for (let n: Element | null = node; n && n !== root; n = n.parentElement) {
    if (!n.parentElement) return [];
    path.unshift(Array.from(n.parentElement.children).indexOf(n));
  }
  return path;
}
/** Retire un élément en le gardant dans « Éléments retirés » pour pouvoir le remettre. */
export function removeLayer(slide: EditorSlide, id: string): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const root = doc.body.firstElementChild;
  const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
  if (!el || !root) return slide;
  const e = getEditorElements(slide.html).find((x) => x.id === id);
  const parent = el.parentElement!;
  const record: RemovedLayer = {
    html: el.outerHTML,
    path: pathTo(root, parent),
    index: Array.from(parent.children).indexOf(el),
    label: e ? layerLabel(e) : "Élément",
    ...(e?.field ? { field: e.field, text: e.text } : {}),
    ...(e?.frame && e.kind === "shape" ? { unwrapOf: id } : {}),
  };
  const next = patchElement(slide, id, { remove: true });
  if (next === slide || record.html.length > MAX_REMOVED_HTML) return next;
  const removed = [record, ...((next.data.editor_removed as RemovedLayer[]) || [])].slice(0, MAX_REMOVED);
  return { ...next, data: { ...next.data, editor_removed: removed } };
}
/** Remet un élément retiré à sa place ; les retouches faites depuis sur ses textes sont gardées. */
export function restoreLayer(slide: EditorSlide, index: number): EditorSlide {
  if (slide.locked) return slide;
  const list: RemovedLayer[] = (slide.data.editor_removed as RemovedLayer[]) || [];
  const record = list[index];
  if (!record) return slide;
  const doc = parse(slide.html);
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return slide;
  const holder = doc.createElement("div");
  holder.innerHTML = record.html;
  const node = holder.firstElementChild as HTMLElement | null;
  if (!node) return slide;
  // Les éléments encore présents (textes d'un cadre) gardent leur version actuelle.
  node.querySelectorAll<HTMLElement>("[data-editor-id]").forEach((inner) => {
    const live = doc.querySelector<HTMLElement>(`[data-editor-id="${inner.dataset.editorId}"]`);
    if (live && live !== inner) inner.replaceWith(live);
  });
  const unwrapped = record.unwrapOf
    ? doc.querySelector<HTMLElement>(`[data-editor-unwrapped="${record.unwrapOf}"]`)
    : null;
  if (unwrapped) unwrapped.replaceWith(node);
  else {
    if (doc.querySelector(`[data-editor-id="${node.dataset.editorId}"]`)) node.removeAttribute("data-editor-id");
    let parent: Element = root;
    for (const i of record.path) {
      const child = parent.children[i];
      if (!child) break;
      parent = child;
    }
    parent.insertBefore(node, parent.children[record.index] || null);
  }
  let data = { ...slide.data, editor_removed: list.filter((_, i) => i !== index) };
  if (record.field && record.text !== undefined && !unwrapped) {
    const key = record.field === "overlay" ? "overlay_text" : record.field === "cta" ? "cta_label" : record.field;
    if (["title", "body", "overlay_text", "cta_label"].includes(key) && !data[key]) data = { ...data, [key]: record.text };
  }
  syncGlass(doc);
  return { ...slide, data, html: prepareSlideHtml(serialize(doc)) };
}

/** Intensité du voile en dégradé posé derrière un texte éditorial (style « bord »). */
export function editorialVeilAlpha(html: string): number | null {
  const doc = parse(html);
  return veilAlpha(doc.querySelector("style[data-photo-editorial-veil]")?.textContent || "");
}
/** Règle ce voile en réécrivant ses alphas (balise de style + variable du texte). */
export function setEditorialVeilAlpha(slide: EditorSlide, alpha: number): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const style = doc.querySelector("style[data-photo-editorial-veil]");
  const current = veilAlpha(style?.textContent || "");
  if (!style || current === null) return slide;
  const a = Math.min(1, Math.max(0.05, alpha));
  const scale = (text: string) =>
    text.replace(/(rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*)([\d.]+)(\s*\))/gi, (m, head, value, tail) =>
      parseFloat(value) > 0 ? `${head}${Math.round((parseFloat(value) / current) * a * 100) / 100}${tail}` : m,
    );
  style.textContent = scale(style.textContent || "");
  doc.querySelectorAll<HTMLElement>("[data-photo-editorial-text]").forEach((el) => {
    const veil = el.style.getPropertyValue("--photo-veil");
    if (veil) el.style.setProperty("--photo-veil", scale(veil));
  });
  return { ...slide, html: serialize(doc) };
}

/** Phrases qu'on peut mettre en valeur (assez longues pour être lues en grand). */
function emphasisChoices(text: string): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+[»”"']*(?:\s+|$)|$)/g) || [text];
  return sentences
    .map((s) => s.trim())
    .filter((s, i, all) => s.length >= 12 && s.length <= 160 && all.indexOf(s) === i && text.indexOf(s) === text.lastIndexOf(s));
}
/** Choisit la phrase mise en valeur d'un texte éditorial et/ou sa couleur. */
export function setEmphasis(slide: EditorSlide, id: string, change: { sentence?: string; color?: string }): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"][data-photo-editorial-text]`);
  if (!el) return slide;
  let data = slide.data;
  if (change.color && /^#[0-9a-f]{6}$/i.test(change.color)) {
    el.style.setProperty("--photo-heading", change.color);
    el.setAttribute("data-emphasis-color", "custom");
  }
  if (change.sentence !== undefined) {
    const text = el.textContent || "";
    if (!emphasisChoices(text).includes(change.sentence)) return slide;
    el.dataset.photoEmphasis = change.sentence;
    el.innerHTML = photoEditorialMarkup(text, el.dataset.photoEditorialText === "finale", change.sentence);
    if (data.art_direction && typeof data.art_direction === "object")
      data = { ...data, art_direction: { ...data.art_direction, emphasis: change.sentence } };
  }
  return { ...slide, data, html: serialize(doc) };
}

/* ─── Mise en forme d'un mot (barre d'outils) ─────────────────────────── */

const RICH_TAGS = new Set(["SPAN", "STRONG", "B", "EM", "I", "U", "BR"]);
const RICH_PROPS = ["color", "font-weight", "font-style", "text-decoration", "text-decoration-line", "background-color"];
/** Ne garde que la mise en forme d'un mot : couleur, gras, italique, souligné. */
export function sanitizeRichText(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;
  const clean = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      const el = child as HTMLElement;
      clean(el);
      if (!RICH_TAGS.has(el.tagName)) {
        // Retour à la ligne tapé (div/p) : une ligne, pas un bloc.
        if (/^(DIV|P)$/.test(el.tagName) && el.previousSibling) el.before(doc.createElement("br"));
        el.replaceWith(...Array.from(el.childNodes));
        return;
      }
      const kept = RICH_PROPS.map((k) => [k, el.style.getPropertyValue(k)] as const).filter(([, v]) => v);
      Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
      kept.forEach(([k, v]) => el.style.setProperty(k, v));
      if (el.tagName === "SPAN" && !kept.length) el.replaceWith(...Array.from(el.childNodes));
    });
  };
  clean(root);
  return root.innerHTML;
}
/**
 * Enregistre un texte avec sa mise en forme partielle. Le texte source (titre,
 * corps…) suit comme pour une saisie ; la mise en forme reste dans le HTML.
 */
export function setElementHtml(slide: EditorSlide, id: string, html: string): EditorSlide {
  if (slide.locked) return slide;
  const safe = sanitizeRichText(html);
  const holder = new DOMParser().parseFromString(`<div>${safe}</div>`, "text/html").body.firstElementChild as HTMLElement;
  holder.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  const text = holder.textContent || "";
  if (!text.trim()) return slide;
  const withText = patchElement(slide, id, { text });
  const doc = parse(withText.html);
  const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
  if (!el || el.hasAttribute("data-photo-editorial-text")) return withText;
  el.innerHTML = safe;
  return { ...withText, html: serialize(doc) };
}
/** Couleurs réellement utilisées dans le carrousel (pour la barre d'outils). */
export function documentColors(slides: { html: string }[], limit = 8): string[] {
  const seen = new Map<string, number>();
  const hex = (v: string) => {
    const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (m) return m[4] !== undefined && Number(m[4]) < 1 ? "" : `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "";
  };
  slides.forEach((s) =>
    parse(s.html).body.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
      for (const v of [el.style.color, el.style.backgroundColor]) {
        const h = v ? hex(v) : "";
        if (h) seen.set(h, (seen.get(h) || 0) + 1);
      }
    }),
  );
  const ranked = Array.from(seen).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  // Deux teintes presque identiques (#1a1a1a / #161616) ne font qu'une pastille.
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const out: string[] = [];
  for (const c of [...ranked, "#1a1a1a", "#ffffff"]) {
    const [r, g, b] = rgb(c);
    if (out.some((o) => { const [x, y, z] = rgb(o); return Math.abs(r - x) + Math.abs(g - y) + Math.abs(b - z) < 40; })) continue;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/* ─── Copier-coller, appliquer à toutes les slides ────────────────────── */

export interface ClipboardElement {
  html: string;
  /** Boîte affichée au moment de la copie (repère 1080×1350). */
  rect: { left: number; top: number; width: number; height: number };
}
/**
 * Colle un élément copié (même slide ou autre slide) à la même place, décalé
 * de 40 px s'il recouvrirait l'original. La copie n'est liée à aucun texte source.
 */
export function pasteElement(slide: EditorSlide, clip: ClipboardElement, offset = true): { slide: EditorSlide; id: string | null } {
  if (slide.locked) return { slide, id: null };
  const doc = parse(slide.html);
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return { slide, id: null };
  const holder = doc.createElement("div");
  holder.innerHTML = clip.html;
  const el = holder.firstElementChild as HTMLElement | null;
  if (!el) return { slide, id: null };
  [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))].forEach((node) => {
    node.removeAttribute("data-editor-id");
    node.removeAttribute("data-slide-text");
    node.removeAttribute("data-slide-page");
    node.removeAttribute("data-editor-hidden");
    node.removeAttribute("data-editor-locked");
  });
  const shift = offset ? 40 : 0;
  el.style.position = "absolute";
  el.style.left = `${Math.round(clip.rect.left + shift)}px`;
  el.style.top = `${Math.round(clip.rect.top + shift)}px`;
  el.style.width = `${Math.round(clip.rect.width)}px`;
  ["right", "bottom", "margin", "margin-top", "margin-bottom", "transform", "z-index"].forEach((k) => el.style.removeProperty(k));
  el.style.zIndex = "20";
  el.setAttribute("data-editor-free", "true");
  el.setAttribute("data-editor-new", "true");
  root.append(el);
  syncGlass(doc);
  // Élément collé depuis une autre slide : sa police Google suit.
  const families = Array.from(el.querySelectorAll<HTMLElement>("*"))
    .concat(el)
    .map((n) => n.style.fontFamily)
    .filter(Boolean)
    .join(",");
  const html = prepareSlideHtml(serialize(doc));
  const id = parse(html).querySelector<HTMLElement>("[data-editor-new]")?.dataset.editorId || null;
  return { slide: withGoogleFonts({ ...slide, html: html.replace(/ data-editor-new="true"/, "") }, families), id };
}

const STYLE_KEYS = {
  text: ["font-family", "font-size", "font-weight", "font-style", "color", "line-height", "text-align", "letter-spacing", "text-transform", "text-decoration"],
  shape: ["background-color", "border-radius", "border", "box-shadow", "opacity"],
};
const POSITION_KEYS = ["position", "left", "top", "width", "right", "bottom"];
/** Élément « équivalent » sur une autre slide : même champ, même rôle ou même nature. */
function counterpart(target: EditorSlide, source: EditorElement): EditorElement | undefined {
  const els = getEditorElements(target.html);
  if (source.field) return els.find((e) => e.field === source.field);
  if (source.role === "glass" || source.role === "veil") return els.find((e) => e.role === source.role);
  if (source.emphasis) return els.find((e) => !!e.emphasis);
  if (source.name) return els.find((e) => e.name === source.name);
  if (source.kind === "photo") return els.find((e) => e.kind === "photo");
  return undefined;
}
/**
 * Reporte le style et/ou la position d'un élément sur son équivalent dans
 * toutes les autres slides (non verrouillées). Renvoie le nombre de slides changées.
 */
export function applyToAllSlides(
  document: CarouselDocument,
  slideId: string,
  id: string,
  what: { style?: boolean; position?: boolean },
): { document: CarouselDocument; changed: number } {
  const from = document.slides.find((s) => s.id === slideId);
  const source = from && getEditorElements(from.html).find((e) => e.id === id);
  if (!from || !source) return { document, changed: 0 };
  const keys = [
    ...(what.style ? (source.kind === "text" ? STYLE_KEYS.text : source.kind === "photo" ? ["border-radius", "opacity"] : STYLE_KEYS.shape) : []),
    ...(what.position ? POSITION_KEYS : []),
  ];
  let changed = 0;
  const slides = document.slides.map((s) => {
    if (s.id === slideId || s.locked) return s;
    const match = counterpart(s, source);
    if (!match) return s;
    const styles: Record<string, string> = {};
    keys.forEach((k) => {
      const v = source.style[k];
      // Une propriété absente de la source est retirée de la cible (position).
      if (v) styles[k] = v;
      else if (what.position && POSITION_KEYS.includes(k)) styles[k] = "";
    });
    if (source.emphasis?.color && what.style) styles["--photo-heading"] = source.emphasis.color;
    const next = patchElement(s, match.id, { styles });
    if (next.html !== s.html) changed++;
    return next;
  });
  return { document: { ...document, slides }, changed };
}

/* ─── Grouper, verrouiller un élément, éléments tout faits ────────────── */

export interface ElementRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** Verrouille un élément : il ne se déplace, ne se retouche ni ne se retire plus par erreur. */
export function setLayerLocked(slide: EditorSlide, id: string, locked: boolean): EditorSlide {
  if (slide.locked) return slide;
  const doc = parse(slide.html);
  const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
  if (!el) return slide;
  if (locked) el.setAttribute("data-editor-locked", "true");
  else el.removeAttribute("data-editor-locked");
  return { ...slide, html: serialize(doc) };
}
/**
 * Regroupe des éléments : ils passent dans un cadre transparent et se déplacent
 * ensemble. Les boîtes mesurées dans l'aperçu (repère de la slide) gardent
 * chaque élément exactement à sa place.
 */
export function groupElements(slide: EditorSlide, items: { id: string; rect: ElementRect }[]): { slide: EditorSlide; id: string | null } {
  if (slide.locked || items.length < 2) return { slide, id: null };
  const doc = parse(slide.html);
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return { slide, id: null };
  const els = items
    .map((i) => ({ ...i, el: doc.querySelector<HTMLElement>(`[data-editor-id="${i.id}"]`) }))
    .filter((i): i is typeof i & { el: HTMLElement } => !!i.el);
  if (els.length < 2) return { slide, id: null };
  const left = Math.min(...els.map((i) => i.rect.left)), top = Math.min(...els.map((i) => i.rect.top));
  const right = Math.max(...els.map((i) => i.rect.left + i.rect.width)), bottom = Math.max(...els.map((i) => i.rect.top + i.rect.height));
  const group = doc.createElement("div");
  group.setAttribute("data-editor-shape", "groupe");
  group.setAttribute("data-editor-new", "true");
  group.style.cssText = `position:absolute;left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(right - left)}px;height:${Math.round(bottom - top)}px;z-index:${Math.max(0, ...els.map((i) => parseInt(i.el.style.zIndex, 10) || 0)) || 1};`;
  // Le groupe prend la place du premier élément dans l'ordre d'affichage.
  els[0].el.before(group);
  els.forEach(({ el, rect }) => {
    el.style.position = "absolute";
    el.style.left = `${Math.round(rect.left - left)}px`;
    el.style.top = `${Math.round(rect.top - top)}px`;
    el.style.width = `${Math.round(rect.width)}px`;
    ["right", "bottom", "margin", "margin-top", "margin-bottom", "margin-left", "margin-right", "z-index"].forEach((k) => el.style.removeProperty(k));
    group.append(el);
  });
  const html = prepareSlideHtml(serialize(doc));
  const id = parse(html).querySelector<HTMLElement>("[data-editor-new]")?.dataset.editorId || null;
  return { slide: { ...slide, html: html.replace(/ data-editor-new="true"/, "") }, id };
}
/** Dégroupe : chaque élément revient sur la slide, à la place où on le voit. */
export function ungroupElement(slide: EditorSlide, groupId: string, rects: Record<string, ElementRect>): { slide: EditorSlide; ids: string[] } {
  if (slide.locked) return { slide, ids: [] };
  const doc = parse(slide.html);
  const group = doc.querySelector<HTMLElement>(`[data-editor-id="${groupId}"][data-editor-shape="groupe"]`);
  if (!group) return { slide, ids: [] };
  const ids: string[] = [];
  Array.from(group.children as HTMLCollectionOf<HTMLElement>).forEach((el) => {
    const rect = el.dataset.editorId ? rects[el.dataset.editorId] : undefined;
    if (rect) {
      el.style.position = "absolute";
      el.style.left = `${Math.round(rect.left)}px`;
      el.style.top = `${Math.round(rect.top)}px`;
      el.style.width = `${Math.round(rect.width)}px`;
    }
    if (group.style.zIndex) el.style.zIndex = group.style.zIndex;
    if (el.dataset.editorId) ids.push(el.dataset.editorId);
    group.before(el);
  });
  group.remove();
  return { slide: { ...slide, html: serialize(doc) }, ids };
}

export type PresetKind = "fleche" | "fleche-bas" | "numero" | "pastille" | "coche" | "etoile" | "guillemets" | "ligne" | "cadre" | "swipe";
export const PRESETS: { kind: PresetKind; label: string }[] = [
  { kind: "fleche", label: "Flèche →" },
  { kind: "fleche-bas", label: "Flèche ↓" },
  { kind: "swipe", label: "« Glisse → »" },
  { kind: "numero", label: "Numéro" },
  { kind: "pastille", label: "Pastille" },
  { kind: "coche", label: "Coche ✓" },
  { kind: "etoile", label: "Étoile ★" },
  { kind: "guillemets", label: "Guillemets" },
  { kind: "ligne", label: "Ligne" },
  { kind: "cadre", label: "Cadre" },
];
/**
 * Formes d'un cadre photo, toutes en border-radius (rendu identique dans
 * l'aperçu et à l'export html2canvas, contrairement à clip-path). Les grands
 * rayons sont réduits par le navigateur : 9999px donne un demi-cercle exact.
 */
export const PHOTO_SHAPES = [
  { key: "carre", label: "Carré", radius: "0px" },
  { key: "arrondi", label: "Arrondi", radius: "24px" },
  { key: "rond", label: "Rond", radius: "50%" },
  { key: "arche", label: "Arche", radius: "9999px 9999px 0px 0px" },
  { key: "feuille", label: "Feuille", radius: "9999px 0px" },
] as const;
export type PhotoShapeKey = (typeof PHOTO_SHAPES)[number]["key"];
/** Forme reconnue d'après le border-radius d'un cadre (null : arrondi sur mesure). */
export function photoShapeOf(radius: string | undefined): PhotoShapeKey | null {
  const r = (radius || "").trim().replace(/\b0(?!\.|px|%)\b/g, "0px");
  if (!r || r === "0px") return "carre";
  return PHOTO_SHAPES.find((s) => s.radius === r)?.key || null;
}
/**
 * Cadre photo vide, au centre de la slide : on le place et le dimensionne,
 * puis on y glisse une photo (ou « Ajouter une photo »). Teinte légère tant
 * qu'il est vide ; l'invitation « Glisse une photo ici » n'existe que dans
 * l'éditeur, jamais dans le HTML exporté.
 */
export function addPhotoFrame(slide: EditorSlide, tint = "#ececec"): { slide: EditorSlide; id: string | null } {
  if (slide.locked) return { slide, id: null };
  const doc = parse(slide.html);
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return { slide, id: null };
  const el = doc.createElement("div");
  el.setAttribute("data-editor-photo", "true");
  el.setAttribute("data-editor-photo-empty", "true");
  el.setAttribute("data-editor-new", "true");
  el.style.cssText = `position:absolute;left:290px;top:362px;width:500px;height:625px;background-color:${tint};background-size:cover;background-position:50% 50%;background-repeat:no-repeat;border-radius:24px;z-index:20`;
  root.append(el);
  const html = prepareSlideHtml(serialize(doc));
  const id = parse(html).querySelector<HTMLElement>("[data-editor-new]")?.dataset.editorId || null;
  return { slide: { ...slide, html: html.replace(/ data-editor-new="true"/, "") }, id };
}
/** Ajoute un élément tout fait aux couleurs du carrousel, au centre de la slide. */
export function addPreset(slide: EditorSlide, kind: PresetKind, color = "#91014b", ink = "#ffffff"): { slide: EditorSlide; id: string | null } {
  if (slide.locked) return { slide, id: null };
  const tokens = extractStyleTokens(slide.html);
  const doc = parse(slide.html);
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return { slide, id: null };
  const el = doc.createElement(["ligne", "cadre"].includes(kind) ? "div" : "p");
  const text = (t: string, css: string) => {
    el.textContent = t;
    el.setAttribute("data-pptx-editable", "body");
    el.setAttribute("data-editor-free", "true");
    el.style.cssText = `position:absolute;margin:0;line-height:1;white-space:pre-wrap;font-family:${tokens.titleFont};${css}`;
  };
  const z = "z-index:20;";
  switch (kind) {
    case "fleche": text("→", `left:440px;top:600px;width:200px;text-align:center;font-size:150px;color:${color};${z}`); break;
    case "fleche-bas": text("↓", `left:440px;top:560px;width:200px;text-align:center;font-size:150px;color:${color};${z}`); break;
    case "swipe": text("Glisse →", `left:640px;top:1180px;width:360px;text-align:right;font-size:40px;font-family:${tokens.bodyFont};color:${color};${z}`); break;
    case "numero": text("1", `left:480px;top:600px;width:120px;height:120px;display:flex;align-items:center;justify-content:center;border-radius:50%;background-color:${color};color:${ink};font-size:64px;${z}`); break;
    case "pastille": text("Nouveau", `left:390px;top:620px;width:300px;padding:16px 28px;text-align:center;border-radius:999px;background-color:${color};color:${ink};font-size:38px;font-family:${tokens.bodyFont};${z}`); break;
    case "coche": text("✓", `left:480px;top:600px;width:120px;text-align:center;font-size:110px;color:${color};${z}`); break;
    case "etoile": text("★", `left:480px;top:600px;width:120px;text-align:center;font-size:110px;color:${color};${z}`); break;
    case "guillemets": text("«", `left:90px;top:120px;width:200px;font-size:240px;color:${color};${z}`); break;
    case "ligne":
      el.setAttribute("data-pptx-shape", "card");
      el.style.cssText = `position:absolute;left:140px;top:673px;width:800px;height:6px;border-radius:3px;background-color:${color};${z}`;
      break;
    case "cadre":
      el.setAttribute("data-editor-shape", "decor");
      el.style.cssText = `position:absolute;left:120px;top:300px;width:840px;height:750px;border:8px solid ${color};border-radius:24px;${z}`;
      break;
  }
  el.setAttribute("data-editor-new", "true");
  root.append(el);
  const html = prepareSlideHtml(serialize(doc));
  const id = parse(html).querySelector<HTMLElement>("[data-editor-new]")?.dataset.editorId || null;
  return { slide: { ...slide, html: html.replace(/ data-editor-new="true"/, "") }, id };
}

/* ─── Galerie de mises en page, thèmes, polices Google ────────────────── */

export type LayoutVariant = "texte" | "texte-centre" | "citation" | "photo-plein" | "photo-haut" | "photo-gauche" | "photo-cadre";
export const LAYOUTS: { variant: LayoutVariant; label: string; photo: boolean }[] = [
  { variant: "texte", label: "Texte", photo: false },
  { variant: "texte-centre", label: "Titre centré", photo: false },
  { variant: "citation", label: "Citation", photo: false },
  { variant: "photo-plein", label: "Photo plein écran", photo: true },
  { variant: "photo-haut", label: "Photo en haut", photo: true },
  { variant: "photo-gauche", label: "Photo à gauche", photo: true },
  { variant: "photo-cadre", label: "Photo encadrée", photo: true },
];
/**
 * Recompose une slide dans une autre mise en page en gardant son titre, son
 * texte, sa photo et la charte (polices, couleurs) de la slide.
 */
export function composeLayout(
  data: Record<string, any>,
  variant: LayoutVariant,
  photo = "",
  tokens: StyleTokens = DEFAULT_TOKENS,
  /** Autres textes de la slide (chiffre clé, liste, mention…), repris tels quels. */
  extras: string[] = [],
): EditorSlide {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const title = String(data.title || data.overlay_text || "Ton titre"),
    body = String(data.title || data.overlay_text ? data.body || "" : "");
  const titleSize = Math.max(38, parseFloat(tokens.titleSize) || 72),
    bodySize = Math.max(38, parseFloat(tokens.bodySize) || 40);
  // Lisibilité : un texte sombre sur un fond sombre (ou clair sur clair) bascule.
  const lum = (color: string) => {
    const m = color.match(/^#([0-9a-f]{6})$/i) ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) : (color.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    return m.length === 3 ? (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 : 0.5;
  };
  const darkBg = lum(tokens.background) < 0.4;
  const readable = (c: string) => (darkBg ? (lum(c) < 0.55 ? "#ffffff" : c) : lum(c) > 0.75 ? "#1a1a1a" : c);
  const dark = variant === "photo-plein";
  const ink = dark ? "#ffffff" : readable(tokens.bodyColor),
    heading = dark ? "#ffffff" : readable(tokens.titleColor);
  const h = (css: string, size = titleSize) =>
    `<h1 data-slide-text="title" data-pptx-editable="title" style="font-size:${size}px;font-family:${tokens.titleFont};color:${heading};line-height:1.1;font-weight:${tokens.titleWeight};margin:0 0 36px;white-space:pre-wrap;${css}">${esc(title)}</h1>`;
  const more = extras
    .filter((t) => t.trim())
    .map((t) => `<p data-pptx-editable="body" data-editor-free="true" style="font-size:${Math.max(32, Math.round(bodySize * 0.85))}px;font-family:${tokens.bodyFont};color:${ink};line-height:1.4;margin:24px 0 0;white-space:pre-wrap">${esc(t.trim())}</p>`)
    .join("");
  const b = (css = "") =>
    (body ? `<p data-slide-text="body" data-pptx-editable="body" style="font-size:${bodySize}px;font-family:${tokens.bodyFont};color:${ink};line-height:1.4;margin:0;white-space:pre-wrap;${css}">${esc(body)}</p>` : "") + more;
  const img = (css: string) =>
    photo ? `<div data-pptx-photo="${data.photo_index || 1}" style="position:absolute;${css}background-image:url(&quot;${esc(photo)}&quot;);background-size:cover;background-position:50% 50%;"></div>` : "";
  const block = (css: string, inner: string) => `<div style="position:absolute;${css}">${inner}</div>`;
  let inner = "";
  let bg = tokens.background;
  switch (variant) {
    case "texte":
      inner = block("left:90px;top:200px;width:900px;", h("") + b(""));
      break;
    case "texte-centre":
      inner = block("left:90px;top:0;width:900px;height:1350px;display:flex;flex-direction:column;justify-content:center;text-align:center;", h("", Math.round(titleSize * 1.25)) + b(""));
      break;
    case "citation":
      inner =
        `<p data-editor-free="true" data-pptx-editable="body" style="position:absolute;left:80px;top:150px;width:240px;margin:0;font-size:260px;line-height:1;font-family:${tokens.titleFont};color:${heading};opacity:.35">«</p>` +
        block("left:120px;top:420px;width:840px;", h("font-style:italic;") + b(""));
      break;
    case "photo-plein":
      bg = "#111111";
      inner = img("left:0;top:0;width:1080px;height:1350px;") +
        `<div data-injected-scrim="1" style="position:absolute;left:0;bottom:0;width:1080px;height:60%;background:linear-gradient(0deg,rgba(0,0,0,0.75) 0%,rgba(0,0,0,0) 100%);"></div>` +
        block("left:90px;bottom:140px;width:900px;", h("") + b(""));
      break;
    case "photo-haut":
      inner = img("left:0;top:0;width:1080px;height:660px;") + block("left:90px;top:730px;width:900px;", h("") + b(""));
      break;
    case "photo-gauche":
      inner = img("left:0;top:0;width:500px;height:1350px;") + block("left:560px;top:0;width:440px;height:1350px;display:flex;flex-direction:column;justify-content:center;", h("", Math.round(titleSize * 0.8)) + b(""));
      break;
    case "photo-cadre":
      inner = img("left:110px;top:110px;width:860px;height:700px;border-radius:24px;") + block("left:110px;top:870px;width:860px;", h("", Math.round(titleSize * 0.85)) + b(""));
      break;
  }
  const html = `${tokens.fontImports}<div style="width:1080px;height:1350px;position:relative;overflow:hidden;background:${bg};color:${ink};font-family:${tokens.bodyFont};text-align:${tokens.align}">${inner}<span data-slide-page style="position:absolute;bottom:60px;right:80px;font-size:24px;color:${ink}">1 / 1</span></div>`;
  const slideType = !photo || !LAYOUTS.find((l) => l.variant === variant)?.photo ? "text_only" : variant === "photo-plein" ? "photo_full" : "photo_integrated";
  return { id: newId(), data: { ...data, title, body, slide_type: slideType, layout_variant: variant }, html: prepareSlideHtml(html) };
}
/** Photo actuelle d'une slide (pour la garder en changeant de mise en page). */
export function slidePhotoSource(html: string): string {
  const doc = parse(html);
  const photo = mainPhoto(doc);
  if (!photo) return "";
  if (photo.tagName === "IMG") return photo.getAttribute("src") || "";
  return (photo.style.backgroundImage.match(/url\(\s*(['"]?)(.*?)\1\s*\)/) || [])[2] || "";
}

export interface CarouselTheme {
  id: string;
  label: string;
  background: string;
  text: string;
  heading: string;
  card: string;
}
const mix = (hex: string, target: string, amount: number) => {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
    b = [1, 3, 5].map((i) => parseInt(target.slice(i, i + 2), 16));
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, "0")).join("")}`;
};
/** Thèmes proposés pour tout le carrousel, à partir de la couleur de marque. */
export function carouselThemes(brand: string, brandBackground?: string, brandText?: string): CarouselTheme[] {
  const c = /^#[0-9a-f]{6}$/i.test(brand || "") ? brand.toLowerCase() : "#91014b";
  return [
    { id: "charte", label: "Ma charte", background: /^#[0-9a-f]{6}$/i.test(brandBackground || "") ? brandBackground! : mix(c, "#ffffff", 0.94), text: /^#[0-9a-f]{6}$/i.test(brandText || "") ? brandText! : "#1a1a1a", heading: c, card: "#ffffff" },
    { id: "contraste", label: "Contrasté", background: "#ffffff", text: "#111111", heading: c, card: mix(c, "#ffffff", 0.9) },
    { id: "sombre", label: "Sombre", background: "#161616", text: "#f5f5f5", heading: mix(c, "#ffffff", 0.45), card: "#262626" },
    { id: "doux", label: "Doux", background: mix(c, "#ffffff", 0.88), text: mix(c, "#000000", 0.55), heading: mix(c, "#000000", 0.25), card: mix(c, "#ffffff", 0.96) },
  ];
}
/**
 * Applique un thème à tout le carrousel : fond des slides, titres, textes et
 * cartes. Les slides photo et les slides verrouillées gardent leurs couleurs
 * (un texte posé sur une photo doit rester lisible sur cette photo).
 */
export function applyTheme(document: CarouselDocument, theme: CarouselTheme): { document: CarouselDocument; changed: number; skipped: number } {
  let changed = 0, skipped = 0;
  const slides = document.slides.map((slide) => {
    const doc = parse(slide.html);
    if (slide.locked || mainPhoto(doc)) {
      skipped++;
      return slide;
    }
    const root = doc.body.firstElementChild as HTMLElement | null;
    if (!root) return slide;
    root.style.removeProperty("background");
    root.style.backgroundColor = theme.background;
    root.style.color = theme.text;
    root.querySelectorAll<HTMLElement>('[data-editor-shape="texture"]').forEach((t) => (t.style.opacity = "0.5"));
    // Cartes qui portent du texte : couleur de carte du thème. Décors sans texte
    // (barres, filets, pastilles) : teintes d'accent du thème, une par couleur
    // d'origine, pour garder les nuances (vu le 03/10/2026 : des barres
    // passées en couleur de carte disparaissaient sur le fond sombre).
    const accents = [theme.heading, mix(theme.heading, theme.background, 0.35), mix(theme.heading, theme.background, 0.6)];
    const accentOf = new Map<string, string>();
    root.querySelectorAll<HTMLElement>('[data-pptx-shape="card"],[data-editor-shape="decor"]').forEach((shape) => {
      const original = shape.style.backgroundColor || "";
      if (!original && !shape.style.background) return;
      const holdsText = !!shape.querySelector("[data-editor-id]") || !!ownText(shape).trim();
      let color = theme.card;
      if (!holdsText) {
        if (!accentOf.has(original)) accentOf.set(original, accents[accentOf.size % accents.length]);
        color = accentOf.get(original)!;
      }
      shape.style.removeProperty("background");
      shape.style.backgroundColor = color;
    });
    textNodes(doc).forEach((el) => {
      const size = parseFloat(el.style.fontSize || "") || 0;
      const isHeading = /^H[1-3]$/.test(el.tagName) || el.dataset.slideText === "title" || el.dataset.pptxEditable === "title" || size >= 56;
      el.style.color = isHeading ? theme.heading : theme.text;
      // Mot mis en couleur dans le texte : une teinte du thème qui se distingue
      // du texte qui l'entoure et reste lisible sur le nouveau fond.
      el.querySelectorAll<HTMLElement>("[style*='color']").forEach((word) => {
        if (word.style.color) word.style.color = isHeading ? theme.text : theme.heading;
      });
      // Pastille ou CTA à fond coloré : le texte s'accorde au fond du thème.
      if (el.style.backgroundColor && !/rgba\([^)]*,\s*0\)/.test(el.style.backgroundColor)) {
        el.style.backgroundColor = theme.heading;
        el.style.color = theme.background;
      }
    });
    changed++;
    return { ...slide, html: serialize(doc) };
  });
  return { document: { ...document, slides }, changed, skipped };
}

/** Polices Google proposées dans l'éditeur (aperçu dans la liste). */
export const GOOGLE_FONTS: { family: string; kind: "serif" | "sans" | "display" | "script" }[] = [
  { family: "Playfair Display", kind: "serif" }, { family: "Libre Baskerville", kind: "serif" }, { family: "Lora", kind: "serif" },
  { family: "Cormorant Garamond", kind: "serif" }, { family: "DM Serif Display", kind: "serif" }, { family: "Fraunces", kind: "serif" },
  { family: "Inter", kind: "sans" }, { family: "IBM Plex Sans", kind: "sans" }, { family: "Montserrat", kind: "sans" },
  { family: "Poppins", kind: "sans" }, { family: "DM Sans", kind: "sans" }, { family: "Work Sans", kind: "sans" },
  { family: "Nunito", kind: "sans" }, { family: "Raleway", kind: "sans" }, { family: "Outfit", kind: "sans" },
  { family: "Bebas Neue", kind: "display" }, { family: "Anton", kind: "display" }, { family: "Archivo Black", kind: "display" },
  { family: "Abril Fatface", kind: "display" }, { family: "Syne", kind: "display" },
  { family: "Caveat", kind: "script" }, { family: "Dancing Script", kind: "script" }, { family: "Pacifico", kind: "script" }, { family: "Homemade Apple", kind: "script" },
];
export const googleFontUrl = (families: string[]) =>
  `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700`).join("&")}&display=swap`;
/** Ajoute la police à la slide (lien Google Fonts) : l'aperçu et l'export la chargent. */
export function ensureFontLink(slide: EditorSlide, family: string): EditorSlide {
  if (!GOOGLE_FONTS.some((f) => f.family === family)) return slide;
  const href = googleFontUrl([family]);
  if (slide.html.includes(href.replace(/&/g, "&amp;")) || slide.html.includes(href)) return slide;
  const doc = parse(slide.html);
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  doc.head.append(link);
  return { ...slide, html: serialize(doc) };
}

/**
 * Textes d'une slide qui ne sont ni son titre ni son texte principal (chiffre
 * clé, liste, mention, citation…) : à reprendre quand on change de mise en page.
 */
export function slideExtraTexts(slide: EditorSlide): string[] {
  const doc = parse(slide.html);
  const main = [slide.data.title, slide.data.body, slide.data.overlay_text].filter(Boolean).map((t: string) => String(t).trim());
  return textNodes(doc)
    .filter((el) => !el.closest("[data-slide-page],[data-editor-hidden]") && !/^(title|body|overlay)$/.test(el.dataset.slideText || ""))
    .filter((el) => !el.closest('[data-slide-text="title"],[data-slide-text="body"],[data-slide-text="overlay"]'))
    .map((el) => (el.textContent || "").trim())
    .filter((t) => t && !/^\d+\s*\/\s*\d+$/.test(t) && !main.some((m) => m === t || m.includes(t)) && t !== "«");
}

/** Ajoute à la slide les liens des polices Google citées dans `fontFamily`. */
export function withGoogleFonts(slide: EditorSlide, fontFamily: string): EditorSlide {
  return GOOGLE_FONTS.filter((f) => fontFamily.includes(f.family)).reduce((acc, f) => ensureFontLink(acc, f.family), slide);
}

/**
 * Place la barre d'outils flottante sans cacher l'élément choisi : au-dessus
 * s'il y a la place, sinon en dessous, sinon collée au bord le plus éloigné
 * de l'élément. Toutes les valeurs sont en pixels de l'aperçu.
 */
export function placeToolbar(
  box: { left: number; top: number; width: number; height: number },
  bar: { width: number; height: number },
  canvas: { width: number; height: number },
  gap = 8,
  margin = 4,
): { left: number; top: number } {
  const bottom = box.top + box.height;
  const above = box.top - gap - bar.height;
  const below = bottom + gap;
  const top =
    above >= margin
      ? above
      : below + bar.height <= canvas.height - margin
        ? below
        : box.top >= canvas.height - bottom
          ? margin
          : canvas.height - bar.height - margin;
  return {
    left: Math.max(margin, Math.min(box.left, canvas.width - bar.width - margin)),
    top: Math.max(margin, top),
  };
}
