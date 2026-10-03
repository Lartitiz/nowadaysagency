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
