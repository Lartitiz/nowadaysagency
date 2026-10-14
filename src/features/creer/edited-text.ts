// Une seule version du texte modifié (lot 7 « robustesse création de contenu »,
// 14/10/2026 ; voir docs/creation-contenu/CARTE.md, section 2).
//
// L'étape « Modifier » travaille sur un texte à plat. Pour un carrousel ou des
// stories, ce texte était gardé À CÔTÉ de la structure (`edited_text`) :
//   - l'écran de résultat ne le montrait pas (il lit les slides / stories) ;
//   - une retouche suivante des slides ou des stories était écrasée par lui
//     dans le calendrier (il primait toujours) ;
//   - un carrousel partait avec tout le texte des slides en légende.
// Désormais, pour ces formats, le texte est remis À SA PLACE dans la structure,
// repère par repère (« --- SLIDE n --- », « --- CAPTION --- », « --- STORY n --- »).
// La structure est la seule source de vérité ; `edited_text` ne sert plus qu'aux
// formats à texte unique (post, LinkedIn, newsletter, Pinterest) et au reel.
//
// Logique pure, sans React ni DOM : testée dans src/test/edited-text.test.ts.

const SLIDE_HEADER_RE = /^[ \t]*---[ \t]*SLIDE[ \t]+(\d+)\b.*---[ \t]*$/;
const CAPTION_HEADER_RE = /^[ \t]*---[ \t]*CAPTION[ \t]*---[ \t]*$/;
const STORY_HEADER_RE = /^[ \t]*---[ \t]*STORY[ \t]+(\d+)\b.*---[ \t]*$/;
const STICKER_LINE_RE = /^\s*🏷️\s*Sticker\s*:/;

export const MARKERS_LOST_MESSAGE =
  "Je n'ai pas retrouvé tous les repères « --- SLIDE … --- » ou « --- STORY … --- ». Remets-les tels quels (un par slide ou par story) pour que chaque texte retrouve sa place, puis enregistre.";

type AnyRaw = Record<string, any>;

export interface SlideTextChange {
  index: number;
  field: "title" | "body";
  oldText: string;
  newText: string;
}

export type ApplyEditedTextResult =
  | { ok: true; raw: AnyRaw; structured: boolean; slideChanges: SlideTextChange[] }
  | { ok: false; error: string };

const trimBlock = (s: string) => s.replace(/^\s*\n/, "").replace(/\n\s*$/, "").trim();

// ── Carrousel ──────────────────────────────────────────────────────────────

function slideSegment(s: AnyRaw): string {
  return [s.title, s.body].filter(Boolean).join("\n");
}

function captionParagraphs(caption: AnyRaw | null | undefined): string[] {
  if (!caption || typeof caption !== "object") return [];
  return [caption.hook, caption.body, caption.cta].filter(Boolean);
}

function hashtagLine(caption: AnyRaw | null | undefined): string {
  const tags = caption && typeof caption === "object" && Array.isArray(caption.hashtags) ? caption.hashtags : [];
  return tags.length ? (tags as string[]).map((h) => `#${String(h).replace(/^#/, "")}`).join(" ") : "";
}

/** Texte à plat d'un carrousel pour l'étape « Modifier » (format d'origine conservé). */
export function carouselEditText(raw: AnyRaw): string {
  const slidesText = ((raw.slides || []) as AnyRaw[])
    .map((s) => `--- SLIDE ${s.slide_number} (${s.role || ""}) ---\n${slideSegment(s)}`)
    .join("\n\n");
  const parts = captionParagraphs(raw.caption);
  const captionText = parts.length > 0 ? `\n\n--- CAPTION ---\n${parts.join("\n\n")}` : "";
  const tags = hashtagLine(raw.caption);
  return slidesText + captionText + (tags ? `\n\n${tags}` : "");
}

function splitSections(text: string, headerRe: RegExp): { headers: string[]; bodies: string[]; preamble: string } {
  const headers: string[] = [];
  const bodies: string[] = [];
  let preamble = "";
  let current: string[] | null = null;
  for (const line of text.split("\n")) {
    if (headerRe.test(line)) {
      if (current) bodies.push(current.join("\n"));
      headers.push(line.trim());
      current = [];
    } else if (current) current.push(line);
    else preamble += line + "\n";
  }
  if (current) bodies.push(current.join("\n"));
  return { headers, bodies, preamble };
}

function parseCaption(segment: string, original: AnyRaw | string | null | undefined): AnyRaw | string {
  let text = trimBlock(segment);
  const paragraphs = text ? text.split(/\n{2,}/) : [];
  let hashtags: string[] | undefined;
  const last = paragraphs[paragraphs.length - 1];
  if (last && last.trim().split(/\s+/).every((t) => /^#\S+/.test(t))) {
    paragraphs.pop();
    const keepHash = original && typeof original === "object" && Array.isArray(original.hashtags)
      && original.hashtags.some((h: string) => String(h).startsWith("#"));
    hashtags = last.trim().split(/\s+/).map((t) => (keepHash ? t : t.replace(/^#/, "")));
    text = paragraphs.join("\n\n");
  }
  if (typeof original === "string" || original == null) return text;

  const next: AnyRaw = { ...original };
  if (hashtags) next.hashtags = hashtags;
  else if (Array.isArray(original.hashtags) && original.hashtags.length) next.hashtags = [];
  const fields = (["hook", "body", "cta"] as const).filter((f) => original[f]);
  if (!paragraphs.length) {
    for (const f of ["hook", "body", "cta"] as const) if (f in next) next[f] = "";
    return next;
  }
  if (fields.length === paragraphs.length) {
    fields.forEach((f, i) => { next[f] = paragraphs[i]; });
    return next;
  }
  if (fields.length <= 1) {
    next[fields[0] || "body"] = paragraphs.join("\n\n");
    return next;
  }
  // Paragraphes en plus ou en moins : accroche = le premier, appel à l'action =
  // le dernier (s'il existait), tout le reste dans le corps.
  next.hook = paragraphs[0];
  if (original.cta && paragraphs.length > 1) {
    next.cta = paragraphs[paragraphs.length - 1];
    next.body = paragraphs.slice(1, -1).join("\n\n");
  } else {
    next.body = paragraphs.slice(1).join("\n\n");
    if ("cta" in next) next.cta = "";
  }
  return next;
}

function applyCarouselText(raw: AnyRaw, text: string): ApplyEditedTextResult {
  const slides: AnyRaw[] = raw.slides || [];
  const captionAt = text.split("\n").findIndex((l) => CAPTION_HEADER_RE.test(l));
  const lines = text.split("\n");
  const slidesPart = captionAt >= 0 ? lines.slice(0, captionAt).join("\n") : text;
  let captionPart = captionAt >= 0 ? lines.slice(captionAt + 1).join("\n") : null;

  const { headers, bodies, preamble } = splitSections(slidesPart, SLIDE_HEADER_RE);
  if (headers.length !== slides.length || preamble.trim()) return { ok: false, error: MARKERS_LOST_MESSAGE };

  // Sans repère de légende, des hashtags laissés à la fin du dernier bloc restent une légende.
  if (captionPart === null && bodies.length) {
    const lastBody = bodies[bodies.length - 1];
    const paras = trimBlock(lastBody).split(/\n{2,}/);
    const tail = paras[paras.length - 1];
    if (paras.length > 1 && tail && tail.trim().split(/\s+/).every((t) => /^#\S+/.test(t))) {
      bodies[bodies.length - 1] = paras.slice(0, -1).join("\n\n");
      captionPart = tail;
    }
  }

  const slideChanges: SlideTextChange[] = [];
  const nextSlides = slides.map((s, i) => {
    const segment = trimBlock(bodies[i]);
    if (segment === slideSegment(s)) return s;
    const segLines = segment ? segment.split("\n") : [];
    let title = s.title || "";
    let body = s.body || "";
    if (!s.title && !s.body) {
      // Slide sans titre ni texte (photo seule) : on ne sait pas où ranger un texte ajouté.
      if (segment) return null;
      return s;
    }
    if (s.title) {
      title = segLines[0] || "";
      body = segLines.slice(1).join("\n").trim();
    } else {
      body = segment;
    }
    if (title !== (s.title || "")) slideChanges.push({ index: i, field: "title", oldText: s.title || "", newText: title });
    if (body !== (s.body || "")) slideChanges.push({ index: i, field: "body", oldText: s.body || "", newText: body });
    return { ...s, title, body };
  });
  if (nextSlides.some((s) => s === null)) {
    return { ok: false, error: "Une slide photo n'a pas de texte à modifier ici : retouche son texte directement sur la slide." };
  }

  const next: AnyRaw = { ...raw, slides: nextSlides };
  delete next.edited_text;
  if (captionPart !== null) {
    const originalText = [captionParagraphs(raw.caption).join("\n\n"), hashtagLine(raw.caption)].filter(Boolean).join("\n\n");
    if (trimBlock(captionPart) !== originalText) next.caption = parseCaption(captionPart, raw.caption);
  }
  return { ok: true, raw: next, structured: true, slideChanges };
}

// ── Stories ────────────────────────────────────────────────────────────────

export function storySequenceKey(raw: AnyRaw): "stories" | "sequences" | "slides" | null {
  if (Array.isArray(raw?.stories)) return "stories";
  if (Array.isArray(raw?.sequences)) return "sequences";
  if (Array.isArray(raw?.slides)) return "slides";
  return null;
}

const STORY_TEXT_FIELDS = ["text", "texte", "content", "instruction"] as const;

function storyTextField(s: AnyRaw): (typeof STORY_TEXT_FIELDS)[number] {
  return STORY_TEXT_FIELDS.find((f) => s[f]) || "text";
}

function stickerLabel(sticker: unknown): string {
  if (!sticker) return "";
  if (typeof sticker === "string") return sticker;
  const s = sticker as AnyRaw;
  return String(s.label || s.text || s.type || "");
}

function storySegment(s: AnyRaw): string {
  return String(s[storyTextField(s)] || "");
}

/** Texte à plat des stories pour l'étape « Modifier ». */
export function storiesEditText(raw: AnyRaw): string {
  const key = storySequenceKey(raw);
  const stories: AnyRaw[] = key ? raw[key] : [];
  return stories
    .map((s, i) => {
      const header = `--- STORY ${s.number || i + 1} (${s.type || s.format || ""}) ---`;
      const sticker = stickerLabel(s.sticker);
      return `${header}\n${storySegment(s)}${sticker ? `\n🏷️ Sticker : ${sticker}` : ""}`;
    })
    .join("\n\n");
}

function applyStoriesText(raw: AnyRaw, text: string): ApplyEditedTextResult {
  const key = storySequenceKey(raw)!;
  const stories: AnyRaw[] = raw[key];
  const { headers, bodies, preamble } = splitSections(text, STORY_HEADER_RE);
  if (headers.length !== stories.length || preamble.trim()) return { ok: false, error: MARKERS_LOST_MESSAGE };
  const nextStories = stories.map((s, i) => {
    // La ligne du sticker est affichée pour info : on ne la réécrit pas.
    const segment = trimBlock(bodies[i].split("\n").filter((l) => !STICKER_LINE_RE.test(l)).join("\n"));
    if (segment === storySegment(s)) return s;
    return { ...s, [storyTextField(s)]: segment };
  });
  const next: AnyRaw = { ...raw, [key]: nextStories };
  delete next.edited_text;
  return { ok: true, raw: next, structured: true, slideChanges: [] };
}

// ── Point d'entrée ─────────────────────────────────────────────────────────

/** Le format a-t-il une structure dans laquelle remettre le texte de « Modifier » ? */
export function hasEditableStructure(format: string | null | undefined, raw: AnyRaw | null | undefined): boolean {
  if (!raw) return false;
  if (format === "carousel") return Array.isArray(raw.slides) && raw.slides.length > 0;
  if (format === "story") return !!storySequenceKey(raw) && raw[storySequenceKey(raw)!].length > 0;
  return false;
}

/** Texte à plat d'un format structuré pour l'étape « Modifier » (null : pas de structure). */
export function structuredEditText(format: string | null | undefined, raw: AnyRaw | null | undefined): string | null {
  if (!raw || !hasEditableStructure(format, raw)) return null;
  return format === "carousel" ? carouselEditText(raw) : storiesEditText(raw);
}

/**
 * Applique le texte de l'étape « Modifier » au résultat.
 * Carrousel et stories : remis dans la structure (refus clair si un repère manque).
 * Autres formats : gardé dans `edited_text`, comme avant.
 */
export function applyEditedText(format: string | null | undefined, raw: AnyRaw | null | undefined, text: string): ApplyEditedTextResult {
  const base = raw || {};
  if (hasEditableStructure(format, base)) {
    return format === "carousel" ? applyCarouselText(base, text) : applyStoriesText(base, text);
  }
  return { ok: true, raw: { ...base, edited_text: text }, structured: false, slideChanges: [] };
}

/**
 * Une retouche faite directement sur la structure (slides, stories, script du
 * reel) est plus récente que le texte à plat : celui-ci ne doit plus primer.
 */
export function withoutEditedText<T extends AnyRaw>(raw: T): T {
  if (!raw || typeof raw.edited_text !== "string") return raw;
  const { edited_text: _stale, ...rest } = raw;
  return rest as T;
}
