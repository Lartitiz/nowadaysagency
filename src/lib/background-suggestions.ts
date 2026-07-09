/**
 * Suggestions de décor pour le remplacement de fond photo (Photoroom).
 *
 * Construites en déterministe depuis la charte visuelle (couleurs, mots-clés
 * d'ambiance, style photo) pour proposer des fonds cohérents avec le branding
 * de la personne. Repli sur des suggestions génériques quand la charte est vide.
 */

export interface CharterForSuggestions {
  color_primary?: string | null;
  color_secondary?: string | null;
  color_accent?: string | null;
  color_background?: string | null;
  mood_keywords?: unknown;
  photo_keywords?: unknown;
  photo_style?: string | null;
}

export const GENERIC_BACKGROUND_SUGGESTIONS = [
  "Studio photo lumière douce, fond beige uni",
  "Atelier d'artiste, lumière naturelle, plantes en arrière-plan",
  "Plage tropicale au coucher du soleil, palmiers flous",
  "Café cosy parisien, ambiance chaleureuse, bokeh",
  "Bureau minimaliste scandinave, bois clair et blanc",
];

const MAX_SUGGESTIONS = 5;

/**
 * Nomme approximativement une couleur hex en français, pour l'insérer dans un
 * prompt lisible (« fond uni terracotta »). Retourne null si le hex est invalide.
 */
export function hexToFrenchColorName(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }

  if (l >= 0.95) return "blanc";
  if (l <= 0.08) return "noir";
  if (s <= 0.12) {
    if (l >= 0.75) return "gris clair";
    if (l <= 0.3) return "gris anthracite";
    return "gris";
  }
  // Teintes chaudes claires et peu saturées : la famille beige/crème
  if (h >= 20 && h < 55 && s <= 0.45) {
    if (l >= 0.85) return "crème";
    if (l >= 0.6) return "beige";
  }

  // Les terracotta démarrent vers 10° : la famille rouge s'arrête juste avant
  if (h < 10 || h >= 345) {
    if (l <= 0.3) return "bordeaux";
    if (l >= 0.75) return "rose pâle";
    return "rouge";
  }
  if (h < 45) {
    if (l <= 0.35) return "marron";
    if (l >= 0.8) return "pêche";
    if (l <= 0.6) return "terracotta";
    return "orange";
  }
  if (h < 70) {
    if (l <= 0.45) return "ocre";
    if (l >= 0.8) return "jaune pâle";
    return "jaune";
  }
  if (h < 160) {
    if (l <= 0.25) return "vert foncé";
    if (s <= 0.35) return "vert sauge";
    if (l >= 0.75) return "vert d'eau";
    return "vert";
  }
  if (h < 190) {
    if (l <= 0.35) return "bleu canard";
    return "turquoise";
  }
  if (h < 250) {
    if (l <= 0.3) return "bleu nuit";
    if (l >= 0.7) return "bleu ciel";
    return "bleu";
  }
  if (h < 290) {
    if (l >= 0.7) return "lavande";
    return "violet";
  }
  if (l <= 0.35) return "prune";
  if (l >= 0.7) return "rose poudré";
  return "rose";
}

function asStrings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, max);
}

/**
 * Construit les suggestions de fond depuis la charte. Toujours MAX_SUGGESTIONS
 * entrées : les suggestions branding d'abord, complétées par les génériques.
 */
export function buildBackgroundSuggestions(
  charter: CharterForSuggestions | null | undefined,
): string[] {
  const out: string[] = [];

  if (charter) {
    const colorNames = [
      charter.color_background,
      charter.color_primary,
      charter.color_secondary,
      charter.color_accent,
    ]
      .map(hexToFrenchColorName)
      .filter((n): n is string => !!n);
    const colors = [...new Set(colorNames)];
    const moods = asStrings(charter.mood_keywords, 2).map((m) => m.toLowerCase());
    const photoKw = asStrings(charter.photo_keywords, 3).map((k) => k.toLowerCase());
    const style = (charter.photo_style ?? "").trim();

    if (colors[0]) {
      out.push(`Studio lumière douce, fond uni ${colors[0]}`);
    }
    if (colors.length >= 2) {
      out.push(`Dégradé doux ${colors[1]} et ${colors[colors.length >= 3 ? 2 : 0]}, texture mate`);
    }
    if (moods.length) {
      out.push(`Ambiance ${moods.join(" et ")}, lumière naturelle, arrière-plan flou`);
    }
    if (style && style.length <= 80) {
      const lowered = style.charAt(0).toLowerCase() + style.slice(1);
      out.push(`Décor ${lowered}, arrière-plan épuré`);
    }
    if (photoKw.length) {
      out.push(`Arrière-plan avec ${photoKw.join(", ")}, flou léger`);
    }
  }

  // Complète avec les génériques (sans doublon) pour toujours proposer 5 idées.
  for (const g of GENERIC_BACKGROUND_SUGGESTIONS) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (!out.includes(g)) out.push(g);
  }
  return out.slice(0, MAX_SUGGESTIONS);
}
