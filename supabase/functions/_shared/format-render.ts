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

/** Texte sans son préfixe d'ordre quand il porte le numéro `n` (« 2. Le tour »,
 * « 2) Le tour », « 02 · Le tour », « Étape 2 : Le tour » → « Le tour ») ;
 * null sinon. Seul le repère d'ordre part, jamais un mot du texte : « 2,5 kg »,
 * « 20 ans », « 2 000 », « 2 – 3 jours » ou « Étape 20 » ne sont pas des
 * préfixes de 2 (jamais de chiffre juste après le repère). */
export function stripStepOrderPrefix(text: string, n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return null;
  const m = new RegExp(`^(\\s*)(?:[ée]tape\\s+0?${n}(?!\\d)\\s*(?:[.)·:\u2013\u2014-]\\s*)?|0?${n}\\s*[.)·:\u2013\u2014-]\\s+)(?=[^\\s\\d])`, "i").exec(text || "");
  if (!m) return null;
  return m[1] + text.slice(m[0].length);
}

/** Numéro d'étape lu deux fois (audit du 04/10/2026) : l'étage de mise en forme
 * dessine « Étape 2 · Le tour » et la rédaction a pu titrer « 2. Le tour ».
 * Au RENDU seulement, le premier texte qui suit l'en-tête d'étape perd son
 * préfixe d'ordre quand celui-ci porte LE MÊME numéro que l'étape dessinée.
 * Le texte de la slide (données) n'est jamais modifié ; un numéro différent,
 * ou tout autre chiffre, reste tel quel. */
export function stripDuplicateStepPrefixHtml(html: string): { html: string; removed: boolean } {
  const same = { html, removed: false };
  const head = /<div\b[^>]*\bdata-photo-step="(\d+)\/\d+"[^>]*>/i.exec(html || "");
  if (!head) return same;
  const n = Number(head[1]);
  // Fin du bloc d'étape (libellé + frise) : profondeur des <div>.
  const divs = /<(\/?)div\b[^>]*>/gi;
  divs.lastIndex = head.index + head[0].length;
  let depth = 1, pos = divs.lastIndex;
  while (depth > 0) {
    const t = divs.exec(html);
    if (!t) return same;
    depth += t[1] ? -1 : 1;
    pos = t.index + t[0].length;
  }
  // Premier texte lisible après le bloc (le motif SVG éventuel est sauté).
  while (pos < html.length) {
    const lt = html.indexOf("<", pos);
    const end = lt < 0 ? html.length : lt;
    const text = html.slice(pos, end);
    if (text.trim()) {
      const stripped = stripStepOrderPrefix(text, n);
      return stripped === null ? same : { html: html.slice(0, pos) + stripped + html.slice(end), removed: true };
    }
    if (lt < 0) break;
    const skip = /^<(svg|style|script)\b/i.exec(html.slice(lt, lt + 8));
    if (skip) {
      const close = html.toLowerCase().indexOf(`</${skip[1].toLowerCase()}>`, lt);
      if (close < 0) return same;
      pos = close + skip[1].length + 3;
      continue;
    }
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    pos = gt + 1;
  }
  return same;
}

/** « Étape 2 · Le tournage » + frise de progression (rectangles, jamais de ronds). */
export function stepHeader(step: NonNullable<PhotoFormat["step"]>, color: string, shadow = "none"): string {
  // Un libellé « 2. Tour » sous « Étape 2 » afficherait le numéro deux fois.
  const raw = step.label ? (stripStepOrderPrefix(step.label, step.index) ?? step.label).trim() : "";
  const label = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  const bars = Array.from({ length: step.total }, (_, i) =>
    `<div style="flex:1;height:10px;border-radius:5px;background:${color};opacity:${i < step.index ? 1 : .28};"></div>`).join("");
  return `<div data-photo-format="etape" data-photo-step="${step.index}/${step.total}" style="position:relative;z-index:1;margin-bottom:26px;">` +
    `<div data-pptx-editable="caption" data-photo-step-label="1" style="font-size:32px;line-height:1.3;letter-spacing:.06em;text-transform:uppercase;font-weight:500;color:${color};text-shadow:${shadow};">Étape ${step.index}${label ? ` · ${escapeHtml(label)}` : ""}</div>` +
    `<div style="display:flex;gap:12px;margin-top:16px;">${bars}</div></div>`;
}

/** Motif libre proposé par l'IA, validé (photo-formatting.ts) puis dessiné ici
 * en SVG dans les couleurs de la surface de lecture. */
export function motifSvg(motif: NonNullable<PhotoFormat["motif"]>, colors: { ink: string; soft: string; accent: string }, fonts: { title: string; body: string }): string {
  const c = (t: string) => t === "accent" ? colors.accent : t === "soft" ? colors.soft : colors.ink;
  const els = motif.elements.map(e => {
    if (e.k === "rect") return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.radius ?? 8}" fill="${c(e.tone)}"${e.opacity ? ` fill-opacity="${e.opacity}"` : ""}/>`;
    if (e.k === "line") return `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${c(e.tone)}" stroke-width="${e.width ?? 4}" stroke-linecap="round"/>`;
    // Jamais d'opacité sur du texte (méthode design de Laetitia, 2.5) : un
    // texte « atténué » prend l'encre pleine ; le ton soft reste aux formes.
    const fill = e.tone === "soft" ? colors.ink : c(e.tone);
    return `<text x="${e.x}" y="${e.y}" fill="${fill}" font-size="${e.size ?? 44}" text-anchor="${e.anchor ?? "start"}" font-family="${escapeHtml(e.font === "title" ? fonts.title : fonts.body)}">${escapeHtml(e.text)}</text>`;
  }).join("");
  const { left, top, height } = motifFrame(motif);
  return `<svg data-photo-format="motif" role="img" aria-label="${escapeHtml(motif.reason || "Schéma")}" viewBox="${left} ${top} 1000 ${height}" width="100%" style="position:relative;display:block;margin-bottom:26px;overflow:visible;">${els}</svg>`;
}
