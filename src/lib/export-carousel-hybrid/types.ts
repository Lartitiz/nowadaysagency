// Export hybride (fiche 15, lot 1) : types et dimensions partagés par tous les
// modules du dossier, déplacés à l'identique depuis export-carousel-hybrid-pptx.ts.
import type { TextRun, EditableBlock, ShapeBlock } from "../pptx-font-mapping";

export interface VisualSlide {
  slide_number: number;
  html: string;
}

/**
 * Photo native fournie à l'export hybride pour insertion couche bottom (non-rasterisée).
 * `base64` DOIT être une data URL complète (préfixée `data:image/<mime>;base64,...`).
 * pptxgenjs `addImage({ data })` attend ce format.
 */
export interface OriginalPhoto {
  base64: string;
  mimeType?: string;
}

export interface PhotoZone {
  el: HTMLElement;
  photoIndex: number; // 1-indexé
  rect: { x: number; y: number; w: number; h: number };
  type: "img" | "background";
}

export interface SlideData {
  slide_number: number;
  overlay_text?: string | null;
  overlay_position?: string | null;
  overlay_style?: string | null;
  title?: string | null;
  body?: string | null;
}

export interface HybridCharter {
  color_text?: string | null;
  color_primary?: string | null;
  color_background?: string | null;
  font_title?: string | null;
  font_body?: string | null;
}

export const SLIDE_W_PX = 1080;

export const SLIDE_H_PX = 1350;

export const PPTX_W_IN = 7.5;

export const PPTX_H_IN = 9.375;

export const PX_PER_IN = SLIDE_W_PX / PPTX_W_IN; // 144

export interface BlockRender {
  el?: Element;
  text: string;
  /** Runs typographiques inline. Si présent + length >= 2 → exporté en multi-runs. */
  runs?: TextRun[];
  rect: { x: number; y: number; w: number; h: number };
  style: EditableBlock["style"];
  kind: EditableBlock["kind"];
}

/**
 * Contexte géométrique du bloc au moment du placement (audit fidélité 10/07) :
 * ses voisins texte et les cartes natives de la slide. Permet (1) de borner le
 * slack de largeur au bord intérieur de la carte parente et (2) de rendre le
 * plancher MIN_FONT_PT conditionnel à la place réellement disponible.
 */
export interface BlockLayoutContext {
  siblings: BlockRender[];
  cards: ShapeBlock[];
}
