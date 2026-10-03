// Dessin de la MISE EN FORME (étapes, motif libre), partagé par les carrousels
// photo (photo-overlay-templates.ts) et mixte (mix-slide-layouts.ts). Sans
// dépendance serveur : le site importe aussi ces gabarits.
import { motifBox, type PhotoFormat } from "./photo-format-types.ts";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Hauteur occupée par l'en-tête d'étape (libellé 32 px, plancher de lisibilité des captions, + frise + marge). */
export const STEP_HEADER_H = 94;
/** Marge sous le motif. */
export const MOTIF_GAP = 26;

/** Cadre ajusté au dessin : pas de vide quand le motif n'occupe que le haut. */
export function motifFrame(motif: NonNullable<PhotoFormat["motif"]>): { left: number; top: number; height: number } {
  const boxes = motif.elements.map(motifBox);
  // Aligné sur le bord du texte : le dessin commence à gauche de la colonne
  // (vu en live le 03/10/2026 : motif décalé à droite du texte).
  const left = Math.max(0, Math.min(400, Math.floor(Math.min(...boxes.map(b => b.x0)))));
  const top = Math.max(-40, Math.floor(Math.min(...boxes.map(b => b.y0)) - 6));
  const bottom = Math.min(420, Math.ceil(Math.max(...boxes.map(b => b.y1)) + 6));
  return { left, top, height: Math.max(40, bottom - top) };
}

/** Hauteur en pixels du motif dessiné sur `width` (marge comprise). */
export function motifHeight(motif: NonNullable<PhotoFormat["motif"]>, width: number): number {
  return Math.ceil(width * motifFrame(motif).height / 1000) + MOTIF_GAP;
}

/** « Étape 2 · Le tournage » + frise de progression (rectangles, jamais de ronds). */
export function stepHeader(step: NonNullable<PhotoFormat["step"]>, color: string, shadow = "none"): string {
  const label = step.label.charAt(0).toUpperCase() + step.label.slice(1);
  const bars = Array.from({ length: step.total }, (_, i) =>
    `<div style="flex:1;height:10px;border-radius:5px;background:${color};opacity:${i < step.index ? 1 : .28};"></div>`).join("");
  return `<div data-photo-format="etape" data-photo-step="${step.index}/${step.total}" style="position:relative;z-index:1;margin-bottom:26px;">` +
    `<div data-pptx-editable="caption" data-photo-step-label="1" style="font-size:32px;line-height:1.3;letter-spacing:.06em;text-transform:uppercase;font-weight:500;color:${color};text-shadow:${shadow};">Étape ${step.index} · ${escapeHtml(label)}</div>` +
    `<div style="display:flex;gap:12px;margin-top:16px;">${bars}</div></div>`;
}

/** Motif libre proposé par l'IA, validé (photo-formatting.ts) puis dessiné ici
 * en SVG dans les couleurs de la surface de lecture. */
export function motifSvg(motif: NonNullable<PhotoFormat["motif"]>, colors: { ink: string; soft: string; accent: string }, fonts: { title: string; body: string }): string {
  const c = (t: string) => t === "accent" ? colors.accent : t === "soft" ? colors.soft : colors.ink;
  const els = motif.elements.map(e => {
    if (e.k === "rect") return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.radius ?? 8}" fill="${c(e.tone)}"${e.opacity ? ` fill-opacity="${e.opacity}"` : ""}/>`;
    if (e.k === "line") return `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${c(e.tone)}" stroke-width="${e.width ?? 4}" stroke-linecap="round"/>`;
    // Un texte « atténué » reste lisible : encre à 72 % (le ton soft à 32 %
    // ne convient qu'aux formes ; vu en live, illisible sur un aplat moyen).
    const fill = e.tone === "soft" ? `${colors.ink}" fill-opacity=".72` : c(e.tone);
    return `<text x="${e.x}" y="${e.y}" fill="${fill}" font-size="${e.size ?? 44}" text-anchor="${e.anchor ?? "start"}" font-family="${escapeHtml(e.font === "title" ? fonts.title : fonts.body)}">${escapeHtml(e.text)}</text>`;
  }).join("");
  const { left, top, height } = motifFrame(motif);
  return `<svg data-photo-format="motif" role="img" aria-label="${escapeHtml(motif.reason || "Schéma")}" viewBox="${left} ${top} 1000 ${height}" width="100%" style="position:relative;display:block;margin-bottom:26px;overflow:visible;">${els}</svg>`;
}
