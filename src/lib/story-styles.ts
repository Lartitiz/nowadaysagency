// Styles de stories « façon native Instagram » : les assemblages typographiques
// que la charte propose, et la géométrie des pastilles mesurée sur de vraies
// stories (recherche du 07/09/2026).
//
// Polices : équivalents LIBRES (Google Fonts, licence OFL) des 3 styles natifs
// gardés (Classic ≈ Inter, Strong ≈ Oswald, Typewriter = Courier Prime) —
// les polices récentes d'Instagram sont des créations sur mesure (Colophon),
// jamais vendues, et les licences web/app des polices du commerce interdisent
// explicitement « un éditeur d'images avec fonction texte ». Décision Laetitia
// 07/09 : que du gratuit, chaque police reste remplaçable ici en une ligne.

// A (Éditorial), D (Doux), E (Moderne), F (Manuscrit) ont été retirés le 07/09 :
// leurs polices (serif, italique, capitales espacées, manuscrite) se voyaient
// « pas Instagram ». Les chartes qui les avaient choisis retombent sur B.
export type StoryAssemblageKey = "B" | "C";
export type StoryPillColor = "primary" | "secondary" | "ink";
export type StoryCorners = "courts" | "droits";
export type StoryAlign = "auto" | "centre" | "gauche";

/** Réglages tels que persistés dans brand_charter (colonnes story_*). */
export interface StoryStyleSettings {
  story_assemblage?: string | null;
  story_pill_color?: string | null;
  story_corners?: string | null;
  story_align?: string | null;
}

export interface StoryStyleResolved {
  assemblage: StoryAssemblageKey;
  pillColor: StoryPillColor;
  corners: StoryCorners;
  align: StoryAlign;
}

/**
 * Habillage d'un bloc de texte, = les 3 modes du bouton « fond » d'Instagram :
 * - col  : texte blanc (ou encre si couleur claire) sur pastille couleur
 * - wh   : encre sur pastille blanche
 * - tint : couleur sur pastille blanche translucide
 * (« nu » = blanc sans pastille avec ombre existe encore dans le type pour le
 * renderer, mais AUCUN assemblage ne l'utilise : décision Laetitia 07/09,
 * « jamais de texte en fond avec une ombre, ça ne rend pas bien ».)
 */
export type StoryTextMode = "col" | "wh" | "tint" | "nu";

export interface StoryTextStyle {
  font: string;
  /** Graisse CSS. */
  weight: number;
  /** Taille en px pour une frame de 1080 de large. */
  size: number;
  mode: StoryTextMode;
  italic?: boolean;
  upper?: boolean;
  letterSpacing?: string;
  /** Rayon des coins en em (défaut STORY_PILL.radiusEm). */
  radiusEm?: number;
  /** Largeur moyenne d'un caractère en em, pour estimer le nombre de lignes. */
  charWidth: number;
}

export interface StoryAssemblage {
  key: StoryAssemblageKey;
  name: string;
  description: string;
  /** Titre / accroche. */
  title: StoryTextStyle;
  /** Texte courant. */
  body: StoryTextStyle;
  /** Aparté, attribution, petite ligne. */
  aside: StoryTextStyle;
  /** Verbatim du gabarit citation ; par défaut dérivé du titre (sans capitales). */
  quote?: StoryTextStyle;
}

export const FONT_CLASSIC = "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif";
export const FONT_STRONG = "'Oswald', 'Arial Narrow', sans-serif";
export const FONT_TYPEWRITER = "'Courier Prime', 'Courier New', monospace";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/** Une seule feuille Google Fonts pour tout ce que les stories peuvent afficher. */
export const STORY_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@600;700&family=Oswald:wght@500;600&family=Courier+Prime:wght@700&family=IBM+Plex+Mono:wght@500&display=swap";

/**
 * Géométrie de la pastille, relevée sur de vraies stories natives : une boîte
 * par ligne ajustée au texte, boîtes qui se touchent (interligne serré), coins
 * courts, marges horizontales généreuses.
 */
export const STORY_PILL = {
  lineHeight: 1.24,
  paddingEm: "0.09em 0.42em",
  radiusEm: 0.26,
  radiusDroitsEm: 0.05,
} as const;

const INTER = (size: number, mode: StoryTextMode, extra: Partial<StoryTextStyle> = {}): StoryTextStyle => ({
  font: FONT_CLASSIC, weight: 700, size, mode, charWidth: 0.53, ...extra,
});
const STRONG = (size: number, mode: StoryTextMode): StoryTextStyle => ({
  font: FONT_STRONG, weight: 600, size, mode, upper: true, letterSpacing: "0.02em", charWidth: 0.5,
});

export const STORY_ASSEMBLAGES: readonly StoryAssemblage[] = [
  {
    key: "B",
    name: "Direct",
    description: "Titre en capitales condensées, texte gras sur blanc. Le style de story le plus courant.",
    title: STRONG(66, "col"),
    body: INTER(52, "wh"),
    aside: INTER(40, "tint", { weight: 600 }),
  },
  {
    key: "C",
    name: "Journal",
    description: "Capitales condensées et machine à écrire. Coulisses, carnet de bord, captures commentées.",
    title: STRONG(66, "col"),
    body: { font: FONT_TYPEWRITER, weight: 700, size: 46, mode: "wh", radiusEm: 0.12, charWidth: 0.6 },
    aside: { font: FONT_TYPEWRITER, weight: 700, size: 38, mode: "tint", radiusEm: 0.12, charWidth: 0.6 },
  },
];

export const DEFAULT_STORY_ASSEMBLAGE: StoryAssemblageKey = "B";

export function getStoryAssemblage(key: string | null | undefined): StoryAssemblage {
  const k = (key || "").trim().toUpperCase();
  return STORY_ASSEMBLAGES.find((a) => a.key === k) || STORY_ASSEMBLAGES.find((a) => a.key === DEFAULT_STORY_ASSEMBLAGE)!;
}

/** Normalise les colonnes story_* (valeurs inconnues → défauts). */
export function resolveStoryStyle(s: StoryStyleSettings | null | undefined): StoryStyleResolved {
  const pill = (s?.story_pill_color || "").trim().toLowerCase();
  const corners = (s?.story_corners || "").trim().toLowerCase();
  const align = (s?.story_align || "").trim().toLowerCase();
  return {
    assemblage: getStoryAssemblage(s?.story_assemblage).key,
    pillColor: pill === "secondary" || pill === "ink" ? pill : "primary",
    corners: corners === "droits" ? "droits" : "courts",
    // Défaut « centre » (décision 07/09) ; « auto » reste possible.
    align: align === "auto" || align === "gauche" ? align : "centre",
  };
}

/**
 * Estime le nombre de lignes qu'un texte occupera dans la zone de sécurité
 * (912 px utiles sur 1080). Sert à l'alignement automatique : centré jusqu'à
 * 2 lignes, à gauche au-delà (plus lisible, c'est ce que font les bonnes
 * stories).
 */
export function estimateLines(text: string, style: StoryTextStyle, usableWidthPx = 912): number {
  const t = (text || "").trim();
  if (!t) return 0;
  const charPx = style.size * style.charWidth * (style.upper ? 1.08 : 1);
  const perLine = Math.max(8, Math.floor(usableWidthPx / charPx));
  return Math.max(1, Math.ceil(t.length / perLine));
}
