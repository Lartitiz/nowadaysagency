/**
 * PPTX Invariants — version front. Même shape que supabase/functions/_shared/pptx-invariants.ts.
 *
 * Sert de source de vérité côté exporters PPTX : on lit les invariants retournés par
 * l'edge function (`slides_invariants`) au lieu de re-deviner palette/polices/tailles
 * via getComputedStyle.
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
  layouts_allowed: string[];
  motif: string;
  pptx_dont: string[];
}

/** Garde-fou : valide qu'un objet retourné par l'edge function ressemble à des invariants. */
export function isPptxInvariants(v: unknown): v is PptxInvariants {
  if (!v || typeof v !== "object") return false;
  const o = v as any;
  return !!(o.palette && o.typography && Array.isArray(o.layouts_allowed));
}

/** Fallback minimal si l'edge function n'a rien retourné (vieille version, erreur de parse, etc.). */
export function defaultInvariants(): PptxInvariants {
  return {
    palette: {
      primary_hex: "#FB3D80",
      secondary_hex: "#91014b",
      accent_hex: "#FFE561",
      bg_hex: "#FFF4F8",
      text_hex: "#1A1A2E",
      dominant: "bg",
    },
    typography: {
      title_google: "Libre Baskerville",
      body_google: "IBM Plex Mono",
      title_pptx_safe: "Georgia",
      body_pptx_safe: "Consolas",
      title_pt: 40,
      body_pt: 16,
      caption_pt: 11,
    },
    layouts_allowed: ["hook_card", "two_column_60_40", "stack_centered", "photo_overlay"],
    motif: "carte_blanche_ombre_douce",
    pptx_dont: [
      "lignes décoratives sous les titres",
      "fonds beige / crème par défaut",
      "border-radius < 8px",
    ],
  };
}
