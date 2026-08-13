/**
 * site-photos — extraction des photos exploitables d'une page web.
 *
 * Utilisé par l'edge site-photos-scan pour proposer les images du site de
 * l'utilisatrice à l'import dans sa bibliothèque (/photos). Tout est du
 * parsing pur (HTML string → liste d'URLs absolues), testable sans réseau.
 *
 * Pièges couverts :
 *  - lazy-loading : l'image réelle vit dans data-src / data-lazy-src /
 *    data-original, le src ne contient qu'un placeholder ;
 *  - srcset : on prend la variante la plus large (descripteur `NNNw`) ;
 *  - CDN sans extension finale (Wix : /media/xxx.jpg/v1/fill/…) : l'extension
 *    est cherchée dans tout le chemin, pas seulement à la fin ;
 *  - bruit : logos, icônes, sprites, favicons, pixels de tracking écartés.
 */

export interface SiteImageCandidate {
  url: string;
  alt: string | null;
}

/** Extensions qu'on refuse toujours (vectoriel, icônes, animations). */
const REJECTED_EXT = /\.(svg|ico|gif|bmp|tiff?)([?#]|$)/i;

/**
 * Formats acceptés, cherchés N'IMPORTE OÙ dans le chemin (Wix place
 * l'extension au milieu : /media/photo.jpg/v1/fill/w_800/photo.jpg).
 */
const ACCEPTED_EXT = /\.(jpe?g|png|webp|avif)([?#/]|$)/i;

/** Bruit évident : jamais des photos de la marque. */
const NOISE_PATTERN =
  /(favicon|sprite|\blogos?\b|[-_./]logos?[-_.]|avatar|emoji|spacer|placeholder|\bicons?\b|[-_]icons?[-_.]|icons?\/|tracking|pixel\.|1x1\.|blank\.)/i;

/** Taille minimale (attribut HTML ou descripteur srcset) pour être une photo. */
const MIN_DECLARED_WIDTH = 200;

/** Nombre max de candidates renvoyées (le tri fin se fait côté client). */
const MAX_CANDIDATES = 60;

/**
 * Prend la variante la plus large d'un srcset ("a.jpg 400w, b.jpg 1200w" → b.jpg).
 * Renvoie aussi la largeur déclarée (null si descripteurs x ou absents).
 */
export function pickLargestFromSrcset(
  srcset: string,
): { url: string; width: number | null } | null {
  let best: { url: string; width: number | null } | null = null;
  for (const part of srcset.split(",")) {
    const tokens = part.trim().split(/\s+/);
    const url = tokens[0];
    if (!url) continue;
    const wMatch = tokens[1]?.match(/^(\d+)w$/i);
    const width = wMatch ? parseInt(wMatch[1], 10) : null;
    if (!best) {
      best = { url, width };
    } else if ((width ?? 0) > (best.width ?? 0)) {
      best = { url, width };
    }
  }
  return best;
}

function attr(tag: string, name: string): string | null {
  // Valeurs quotées uniquement : les attributs non quotés sont rarissimes sur
  // les builders visés, et les gérer ouvrirait des faux positifs. Les deux
  // types de quotes sont gérés séparément (alt="L'atelier" contient un ').
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, "i"));
  const value = m ? (m[1] ?? m[2]) : null;
  return value ? value.trim() : null;
}

function resolveUrl(raw: string, baseUrl: string): string | null {
  const cleaned = raw.replace(/&amp;/g, "&").trim();
  if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("blob:")) return null;
  try {
    const abs = new URL(cleaned, baseUrl);
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return null;
    return abs.toString();
  } catch {
    return null;
  }
}

function isAcceptableImageUrl(absUrl: string): boolean {
  if (REJECTED_EXT.test(absUrl)) return false;
  if (NOISE_PATTERN.test(absUrl)) return false;
  // Pas d'extension reconnaissable du tout → on garde quand même : un src
  // d'<img> est de facto une image (CDN à URLs opaques type Squarespace).
  return true;
}

/**
 * Extrait les images candidates d'une page HTML, en URLs absolues, dédupliquées
 * (par origine+chemin : les variantes ?format=... d'une même image comptent
 * pour une seule), plafonnées à MAX_CANDIDATES. Ordre : og:image d'abord
 * (c'est l'image que le site met lui-même en avant), puis ordre du document.
 */
export function extractImageCandidates(html: string, baseUrl: string): SiteImageCandidate[] {
  const out: SiteImageCandidate[] = [];
  const seen = new Set<string>();

  const push = (rawUrl: string, alt: string | null) => {
    if (out.length >= MAX_CANDIDATES) return;
    const abs = resolveUrl(rawUrl, baseUrl);
    if (!abs || !isAcceptableImageUrl(abs)) return;
    let key: string;
    try {
      const u = new URL(abs);
      key = u.origin + u.pathname;
    } catch {
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: abs, alt: alt || null });
  };

  // 1. og:image — l'aperçu officiel de la page.
  const og =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (og) push(og[1], null);

  // 2. <img> et <source> (les <picture> mettent la vraie image dans <source>).
  const tagRegex = /<(?:img|source)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(html)) !== null) {
    const tag = m[0];

    // Écarte les tags explicitement petits (icônes, pixels) quand la taille
    // est déclarée. Absence d'attribut ≠ rejet : les héros n'en ont souvent pas.
    const widthAttr = attr(tag, "width");
    const heightAttr = attr(tag, "height");
    const w = widthAttr ? parseInt(widthAttr, 10) : NaN;
    const h = heightAttr ? parseInt(heightAttr, 10) : NaN;
    if ((!isNaN(w) && w < MIN_DECLARED_WIDTH) || (!isNaN(h) && h < MIN_DECLARED_WIDTH)) {
      continue;
    }
    if (NOISE_PATTERN.test(tag)) continue; // class="logo", alt="icône"…

    const alt = attr(tag, "alt");

    // Lazy-loading d'abord : le src est alors un placeholder à ignorer.
    const lazySrc =
      attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "data-original");

    const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
    if (srcset) {
      const best = pickLargestFromSrcset(srcset);
      if (best && (best.width === null || best.width >= MIN_DECLARED_WIDTH)) {
        push(best.url, alt);
        continue;
      }
      if (best) continue; // srcset entier < 200px : icône responsive, on jette
    }

    const src = lazySrc || attr(tag, "src");
    if (src) push(src, alt);
  }

  return out;
}
