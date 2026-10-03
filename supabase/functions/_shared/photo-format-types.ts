// Types de la mise en forme des carrousels photo, sans dépendance serveur :
// importés par le dessin (photo-overlay-templates.ts), lui-même utilisé par le site.

export type MotifTone = "ink" | "soft" | "accent";
export type MotifElement =
  | { k: "rect"; x: number; y: number; w: number; h: number; tone: MotifTone; opacity?: number; radius?: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; tone: MotifTone; width?: number }
  | { k: "text"; x: number; y: number; text: string; tone: MotifTone; size?: number; font?: "title" | "body"; anchor?: "start" | "middle" | "end" };

export interface PhotoFormat {
  step?: { index: number; total: number; label: string };
  motif?: { elements: MotifElement[]; reason: string };
}

/** Emprise approximative d'un élément de motif (texte : largeur estimée). */
export function motifBox(e: MotifElement): { x0: number; y0: number; x1: number; y1: number } {
  if (e.k === "rect") return { x0: e.x, y0: e.y, x1: e.x + e.w, y1: e.y + e.h };
  if (e.k === "line") { const p = (e.width ?? 4) / 2; return { x0: Math.min(e.x1, e.x2) - p, y0: Math.min(e.y1, e.y2) - p, x1: Math.max(e.x1, e.x2) + p, y1: Math.max(e.y1, e.y2) + p }; }
  const size = e.size ?? 44, w = e.text.length * size * .55;
  const x0 = e.anchor === "end" ? e.x - w : e.anchor === "middle" ? e.x - w / 2 : e.x;
  return { x0, y0: e.y - size * .8, x1: x0 + w, y1: e.y + size * .25 };
}
