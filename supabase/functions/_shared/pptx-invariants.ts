/**
 * PPTX Invariants — contrat partagé entre génération HTML et export PPTX.
 *
 * L'étude "Le design via Claude" (avril 2026) impose un workflow en 2 phases :
 *  1. Phase HTML : exploration créative libre (Google Fonts, gradients, ombres).
 *  2. Phase PPTX : exécution avec invariants explicites (palette hex, polices PPTX-safe,
 *     tailles en points, motif visuel récurrent, layouts ≤ 4).
 *
 * Ce module produit l'objet `pptx_invariants` qui sert de pivot entre les deux phases.
 * Source hybride : la charte graphique (`brand_charter`) en priorité, complétée par
 * l'identité éditoriale (`brand_profile`) pour le motif visuel et le ton.
 */

export interface PptxInvariants {
  palette: {
    primary_hex: string;
    secondary_hex: string;
    accent_hex: string;
    bg_hex: string;
    text_hex: string;
    dominant: "primary" | "secondary" | "bg";
  };
  typography: {
    title_google: string;
    body_google: string;
    title_pptx_safe: string;
    body_pptx_safe: string;
    title_pt: number;
    body_pt: number;
    caption_pt: number;
  };
  layouts_allowed: string[]; // max 4
  motif: string;
  pptx_dont: string[];
}

/** Mapper Google Font → police PPTX-safe (mêmes règles que src/lib/pptx-font-mapping.ts). */
function mapFontToPptxSafe(font: string): string {
  const f = (font || "").toLowerCase().split(",")[0].trim().replace(/['"]/g, "");
  const SERIF = ["playfair", "lora", "merriweather", "baskerville", "cormorant", "garamond", "crimson", "ptserif", "pt serif", "source serif"];
  const MONO = ["plex mono", "consolas", "fira mono", "fira code", "jetbrains", "code pro", "roboto mono", "courier", "menlo"];
  const VERDANA = ["montserrat", "raleway", "oswald", "bebas"];
  const TREBUCHET = ["poppins", "nunito", "quicksand", "comfortaa"];
  if (SERIF.some((s) => f.includes(s))) return "Georgia";
  if (MONO.some((s) => f.includes(s))) return "Consolas";
  if (VERDANA.some((s) => f.includes(s))) return "Verdana";
  if (TREBUCHET.some((s) => f.includes(s))) return "Trebuchet MS";
  return "Calibri";
}

/** Déduit le motif visuel à partir du ton et du moodboard. Toujours UN seul motif. */
function deriveMotif(toneRegister?: string | null, moodKeywords?: string | null): string {
  const reg = (toneRegister || "").toLowerCase();
  const mood = (moodKeywords || "").toLowerCase();
  if (reg.includes("premium") || mood.includes("élégant") || mood.includes("luxe")) {
    return "carte_blanche_ombre_douce";
  }
  if (reg.includes("punchy") || mood.includes("audacieux") || mood.includes("pop")) {
    return "bloc_couleur_dominante_accent_ponctuel";
  }
  if (mood.includes("doux") || mood.includes("chaleureux") || mood.includes("intime")) {
    return "fond_pastel_typo_chaude";
  }
  return "carte_blanche_ombre_douce";
}

/** Déduit quelle couleur domine visuellement (60-70% du poids visuel). */
function deriveDominant(toneRegister?: string | null): "primary" | "secondary" | "bg" {
  const reg = (toneRegister || "").toLowerCase();
  if (reg.includes("punchy") || reg.includes("audacieux")) return "primary";
  if (reg.includes("premium") || reg.includes("minimal")) return "bg";
  return "bg";
}

/** Tailles de référence en points. Tunées pour le format Instagram 7.5×9.375 in. */
function deriveSizes(toneRegister?: string | null): { title_pt: number; body_pt: number; caption_pt: number } {
  const reg = (toneRegister || "").toLowerCase();
  if (reg.includes("premium") || reg.includes("éditorial")) {
    return { title_pt: 36, body_pt: 14, caption_pt: 10 };
  }
  if (reg.includes("punchy")) {
    return { title_pt: 44, body_pt: 18, caption_pt: 12 };
  }
  return { title_pt: 40, body_pt: 16, caption_pt: 11 };
}

export interface BuildInvariantsInput {
  charter?: {
    color_primary?: string | null;
    color_secondary?: string | null;
    color_accent?: string | null;
    color_background?: string | null;
    color_text?: string | null;
    font_title?: string | null;
    font_body?: string | null;
    mood_keywords?: string | string[] | null;
  } | null;
  brandProfile?: {
    tone_register?: string | null;
  } | null;
}

export function buildPptxInvariants(input: BuildInvariantsInput): PptxInvariants {
  const ch = input.charter || {};
  const bp = input.brandProfile || {};
  const moodStr = Array.isArray(ch.mood_keywords) ? ch.mood_keywords.join(", ") : (ch.mood_keywords || "");

  const titleGoogle = ch.font_title || "Libre Baskerville";
  const bodyGoogle = ch.font_body || "IBM Plex Mono";
  const sizes = deriveSizes(bp.tone_register);

  return {
    palette: {
      primary_hex: ch.color_primary || "#FB3D80",
      secondary_hex: ch.color_secondary || "#91014b",
      accent_hex: ch.color_accent || "#FFE561",
      bg_hex: ch.color_background || "#FFF4F8",
      text_hex: ch.color_text || "#1A1A2E",
      dominant: deriveDominant(bp.tone_register),
    },
    typography: {
      title_google: titleGoogle,
      body_google: bodyGoogle,
      title_pptx_safe: mapFontToPptxSafe(titleGoogle),
      body_pptx_safe: mapFontToPptxSafe(bodyGoogle),
      title_pt: sizes.title_pt,
      body_pt: sizes.body_pt,
      caption_pt: sizes.caption_pt,
    },
    layouts_allowed: ["hook_card", "two_column_60_40", "stack_centered", "photo_overlay"],
    motif: deriveMotif(bp.tone_register, moodStr),
    pptx_dont: [
      "lignes décoratives sous les titres (signature IA)",
      "fonds beige / crème par défaut (#F5F5DC, #FAF0E6)",
      "border-radius < 8px (rendu mauvais en PPTX)",
      "gradients à plus de 2 couleurs",
      "polices Google Fonts non-mappées (la machine du client ne les a pas)",
      "même layout répété sur toutes les slides (max 3-4 layouts différents)",
    ],
  };
}

/**
 * Sérialise les invariants pour les injecter dans un system prompt.
 * Format compact, lisible par Claude, qui rappelle la discipline HTML/PPTX.
 */
export function formatInvariantsForPrompt(inv: PptxInvariants): string {
  return `═══ CONTRAT PPTX (invariants à respecter) ═══

Ce HTML sera converti en PPTX. Tu dois respecter ces invariants stricts pour que le rendu PowerPoint soit fidèle.

PALETTE (codes hex, exactement) :
- Principale : ${inv.palette.primary_hex}
- Secondaire : ${inv.palette.secondary_hex}
- Accent : ${inv.palette.accent_hex}
- Fond : ${inv.palette.bg_hex}
- Texte : ${inv.palette.text_hex}
- Dominante visuelle (60-70%) : ${inv.palette.dominant}
Règle 60/30/10 : une couleur domine, une supporte, une accentue. Pas d'égalité visuelle.

TYPOGRAPHIE (pivot HTML → PPTX) :
- Titres : "${inv.typography.title_google}" en HTML → "${inv.typography.title_pptx_safe}" en PPTX, ${inv.typography.title_pt}pt
- Corps : "${inv.typography.body_google}" en HTML → "${inv.typography.body_pptx_safe}" en PPTX, ${inv.typography.body_pt}pt
- Caption : ${inv.typography.caption_pt}pt
Choisis dès maintenant des tailles HTML qui produiront ces tailles PPTX (1080px ≈ 7.5 pouces, donc 1pt ≈ 2px).

LAYOUTS AUTORISÉS (max 4 sur tout le carrousel, pas un par slide) :
${inv.layouts_allowed.map((l) => `- ${l}`).join("\n")}

MOTIF VISUEL RÉCURRENT (à répéter sur chaque slide, c'est ta signature) :
${inv.motif}

INTERDITS PPTX :
${inv.pptx_dont.map((d) => `- ${d}`).join("\n")}

Préfère un APLAT de couleur dominante + un accent ponctuel à un gradient complexe.
Prévois des contenants 15% plus grands que nécessaire (le texte gagne ~1 ligne en PPTX).`;
}
