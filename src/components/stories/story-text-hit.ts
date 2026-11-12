// Stories comme le carrousel (12/11/2026) : retrouver le texte touché sur
// l'aperçu. Le HTML de la story (story-visual.ts) marque chaque texte par
// data-story-pptx="title|body|…" ; l'aperçu est une iframe de 1080×1920 mise
// à l'échelle, dont on lit les boîtes (même origine, srcdoc).

export type StoryTextRole = "title" | "body" | "aside" | "quote" | "attribution" | "item";

export interface StoryTextBox {
  role: StoryTextRole;
  /** Rang parmi les textes du même rôle (éléments d'une liste). */
  index: number;
  /** Boîte dans l'espace 1080×1920 de la story. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const ROLES = new Set<StoryTextRole>(["title", "body", "aside", "quote", "attribution", "item"]);

/** Boîtes des textes de la story, lues dans le document de l'iframe d'aperçu. */
export function storyTextBoxes(doc: Document | null | undefined): StoryTextBox[] {
  if (!doc) return [];
  const seen = new Map<StoryTextRole, number>();
  const boxes: StoryTextBox[] = [];
  doc.querySelectorAll<HTMLElement>("[data-story-pptx]").forEach((el) => {
    const role = el.getAttribute("data-story-pptx") as StoryTextRole;
    if (!ROLES.has(role)) return;
    const index = seen.get(role) ?? 0;
    seen.set(role, index + 1);
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    boxes.push({ role, index, x: r.left, y: r.top, w: r.width, h: r.height });
  });
  return boxes;
}

/**
 * Le texte sous le point (x, y), en px de la story. Une marge (pad) rend les
 * textes courts faciles à toucher ; le plus petit texte gagne quand deux
 * boîtes se recouvrent.
 */
export function hitStoryText(boxes: StoryTextBox[], x: number, y: number, pad = 24): StoryTextBox | null {
  const hits = boxes.filter((b) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad);
  if (hits.length === 0) return null;
  return hits.reduce((best, b) => (b.w * b.h < best.w * best.h ? b : best));
}

/** Toutes les boîtes d'un même rôle réunies (un texte coupé autour d'une citation). */
export function unionBox(boxes: StoryTextBox[], role: StoryTextRole, index?: number): StoryTextBox | null {
  const same = boxes.filter((b) => b.role === role && (index === undefined || b.index === index));
  if (same.length === 0) return null;
  const x = Math.min(...same.map((b) => b.x));
  const y = Math.min(...same.map((b) => b.y));
  const right = Math.max(...same.map((b) => b.x + b.w));
  const bottom = Math.max(...same.map((b) => b.y + b.h));
  return { role, index: same[0].index, x, y, w: right - x, h: bottom - y };
}
