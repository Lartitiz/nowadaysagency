/**
 * Charte graphique de la cliente dans le montage HyperFrames du reel sans voix
 * (14/11/2026). Fichier PUR, partagé entre l'edge et l'aperçu du site.
 *
 * Ce qui change : couleur du mot clé (accent de la charte), police des titres
 * pour le mot clé, police du texte pour le reste, si elles existent sur Google
 * Fonts. Ce qui ne change pas : texte blanc, dégradé sombre, tailles.
 *
 * Replis :
 *  - charte vide ou illisible → rendu d'avant (or #f6c98b, Montserrat, Playfair italique) ;
 *  - police absente de Google Fonts → sa feuille ne se charge pas (une feuille
 *    par police, pour ne jamais casser celle des polices par défaut) et le
 *    navigateur passe à la police par défaut écrite juste derrière ;
 *  - couleur trop sombre sur le dégradé → éclaircie en code jusqu'au contraste 3:1 (grand texte).
 */
import { hexLuminance } from "../_shared/contrast-guard.ts";

export const DEFAULT_ACCENT = "#f6c98b";
/** Couleur la plus claire du bas du dégradé, là où s'écrit le texte (rgba(10,8,6,.5) sur une vidéo sombre). */
const SHADE_HEX = "3a3530";
// Grand texte gras (≥ 44 px, en pratique 64 px et plus) : seuil WCAG du grand texte, 3:1.
const MIN_CONTRAST = 3;

export interface BrandLook {
  /** Couleur du mot clé, hex #rrggbb déjà contrastée. */
  accent: string;
  /** Police du mot clé (nom Google Fonts) ; null = Playfair Display italique. */
  keyFont: string | null;
  /** Police du texte ; null = Montserrat. */
  textFont: string | null;
}

export const DEFAULT_BRAND: BrandLook = { accent: DEFAULT_ACCENT, keyFont: null, textFont: null };

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Nom de famille plausible pour Google Fonts (lettres, chiffres, espaces). */
const FONT = /^[A-Za-z][A-Za-z0-9 ]{1,39}$/;

function hex6(value: string): string | null {
  const m = HEX.exec(value.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return h.toLowerCase();
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [hexLuminance(a), hexLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Éclaircit une couleur (mélange avec du blanc) jusqu'au contraste voulu sur le dégradé. */
export function readableAccent(raw: string | null | undefined): string {
  const h = raw ? hex6(raw) : null;
  if (!h) return DEFAULT_ACCENT;
  let current = h;
  for (let step = 0; step <= 20 && contrast(current, SHADE_HEX) < MIN_CONTRAST; step++) {
    const t = step / 20;
    current = [0, 2, 4].map((i) => {
      const v = parseInt(h.slice(i, i + 2), 16);
      return Math.round(v + (255 - v) * t).toString(16).padStart(2, "0");
    }).join("");
  }
  return `#${current}`;
}

export function cleanFont(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.split(",")[0].replace(/["']/g, "").trim().replace(/\s+/g, " ");
  return FONT.test(name) ? name : null;
}

/** Charte (champs de `brand_charter`) → réglages bornés du montage. */
export function brandLookFromCharter(charter: { color_accent?: unknown; font_title?: unknown; font_body?: unknown } | null | undefined): BrandLook {
  if (!charter) return DEFAULT_BRAND;
  return {
    accent: typeof charter.color_accent === "string" ? readableAccent(charter.color_accent) : DEFAULT_ACCENT,
    keyFont: cleanFont(charter.font_title),
    textFont: cleanFont(charter.font_body),
  };
}

/** Valide une charte déjà réduite (venue du site par le plan de rendu). */
export function sanitizeBrandLook(raw: unknown): BrandLook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    accent: typeof r.accent === "string" ? readableAccent(r.accent) : DEFAULT_ACCENT,
    keyFont: cleanFont(r.keyFont),
    textFont: cleanFont(r.textFont),
  };
}

/** Une balise <link> par police de la charte (une police inconnue ne casse pas les autres). */
export function brandFontLinks(brand: BrandLook): string {
  const families = [...new Set([brand.keyFont, brand.textFont].filter((f): f is string => !!f))];
  return families.map((f) =>
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700&display=block" />\n` +
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}&display=block" />`,
  ).join("\n");
}
