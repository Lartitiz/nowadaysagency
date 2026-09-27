// Garde DÉTERMINISTE de contraste texte/fond pour les slides HTML générées.
//
// Bug observé en prod (audit live 04/07/2026) : le modèle écrit du texte
// `color:#1C1C20` sur une carte `background:#1C1C20` — items d'une colonne
// comparison et punchline d'une timeline invisibles (noir sur noir). Le prompt
// l'interdit désormais, mais la vraie parade est déterministe : on parcourt le
// HTML inline-styles en maintenant une pile de fonds, et tout `color:` trop
// proche de son fond direct est réécrit en couleur lisible (claire sur fond
// sombre, sombre sur fond clair).
//
// Conservateur par design :
// - seuls les hex/rgb pleinement opaques sont évalués (les couleurs alpha,
//   gradients et fonds inconnus sont ignorés → zéro faux positif dessus) ;
// - les éléments décoratifs à faible opacité (chiffres géants opacity 0.15)
//   sont laissés tels quels ;
// - seuil volontairement bas (ratio < 1.6) : on ne corrige que l'illisible,
//   jamais les contrastes doux voulus (taupe sur papier ≈ 1.63 passe).
//
// Fonds en DÉGRADÉ (ajout 27/09/2026) : longtemps ignorés (« fond inconnu »),
// ils laissaient passer une légende rose très clair (#FFECF0) posée sur le haut
// clair d'une bande terracotta dégradée (gabarit « split ») → 2,2-2,5:1 à
// l'écran ET dans le PPTX. Un dégradé dont on sait lire TOUS les arrêts de
// couleur est désormais jugé contre son arrêt le PLUS DÉFAVORABLE (on ne sait
// pas où le texte tombe dans le dégradé), avec un plancher propre de 3:1
// (texte large WCAG). Le seuil 1.6 des fonds unis ne bouge pas.

const VOID_TAGS = new Set([
  "br", "img", "hr", "input", "meta", "link", "area", "base",
  "col", "embed", "source", "track", "wbr",
]);

type Rgb = { r: number; g: number; b: number; a: number };

function parseColor(raw: string): Rgb | null {
  const c = raw.trim().toLowerCase();
  if (c === "white") return { r: 255, g: 255, b: 255, a: 1 };
  if (c === "black") return { r: 0, g: 0, b: 0, a: 1 };
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = c.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] !== undefined ? +rgb[4] : 1 };
  }
  return null;
}

function luminance(c: Rgb): number {
  const ch = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * Luminance relative WCAG d'une couleur hex 6 SANS « # » (ex. "FB3D80").
 * Seule implémentation partagée de la correction gamma sRGB + coefficients
 * 0.2126/0.7152/0.0722 — carousel-visual (isDarkBackground, garde
 * titre/corps) s'appuie dessus au lieu de dupliquer le calcul.
 */
export function hexLuminance(h6: string): number {
  return luminance({
    r: parseInt(h6.slice(0, 2), 16),
    g: parseInt(h6.slice(2, 4), 16),
    b: parseInt(h6.slice(4, 6), 16),
    a: 1,
  });
}

function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Fond déclaré par un style inline, en liste de luminances :
 * - couleur unie opaque → [L] ;
 * - dégradé dont tous les arrêts sont lisibles → une luminance par arrêt
 *   (arrêts translucides composés sur le fond parent `parent`, s'il est uni) ;
 * - undefined : pas de fond déclaré (hérite) ; null : fond inconnu (on ne juge pas).
 */
function backgroundLuminances(style: string, parent: number[] | null): number[] | null | undefined {
  // dernière déclaration background gagne
  const decls = [...style.matchAll(/background(?:-color|-image)?\s*:\s*([^;"']+)/gi)];
  if (decls.length === 0) return undefined; // pas de fond déclaré → hérite
  const value = decls[decls.length - 1][1].trim();
  if (/url\(/i.test(value)) return null; // image → fond inconnu
  if (/gradient\s*\(/i.test(value)) return gradientLuminances(value, parent);
  const rgb = parseColor(value);
  if (!rgb || rgb.a < 0.9) return null;
  return [luminance(rgb)];
}

const COLOR_TOKEN_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black|transparent)\b/gi;
// Tout ce qui n'est ni couleur lisible ni géométrie de dégradé (nom de couleur
// « tomato », hsl(), var(), currentColor…) rend le dégradé inconnu.
const GRADIENT_GEOMETRY_RE =
  /\b(?:repeating-)?(?:linear|radial|conic)-gradient\b|\b(?:to|top|bottom|left|right|center|at|from|circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner|in|srgb|oklab)\b|-?[\d.]+(?:deg|turn|rad|grad|%|px|em|rem|vw|vh)?|[(),\s]/gi;

function gradientLuminances(value: string, parent: number[] | null): number[] | null {
  const tokens = value.match(COLOR_TOKEN_RE) || [];
  const rest = value.replace(COLOR_TOKEN_RE, " ").replace(GRADIENT_GEOMETRY_RE, "");
  if (tokens.length < 2 || rest.trim()) return null;
  // Arrêt translucide : composé sur le fond parent — seulement si ce dernier est
  // UNI (une seule luminance connue) ; sinon on ne juge pas.
  const base = parent && parent.length === 1 ? parent[0] : null;
  const out: number[] = [];
  for (const t of tokens) {
    const c = t.toLowerCase() === "transparent" ? { r: 0, g: 0, b: 0, a: 0 } : parseColor(t);
    if (!c) return null;
    if (c.a >= 0.9) { out.push(luminance(c)); continue; }
    if (base === null) return null;
    // Composition approchée en luminance (suffisante pour un plancher 3:1).
    out.push(c.a * luminance(c) + (1 - c.a) * base);
  }
  return out;
}

/** Pire contraste d'une couleur de texte contre tous les arrêts d'un fond. */
function worstRatio(text: number, bg: number[]): number {
  return Math.min(...bg.map((b) => contrastRatio(text, b)));
}

const RATIO_MIN = 1.6;
/** Plancher sur fond dégradé : texte large WCAG (on juge l'arrêt le plus défavorable). */
const RATIO_MIN_GRADIENT = 3;

/**
 * Réécrit dans `html` toute couleur de texte quasi identique à son fond direct.
 * `light`/`dark` = couleurs de remplacement (défauts sûrs : blanc / charbon).
 */
export function enforceTextContrast(
  html: string,
  opts: { light?: string; dark?: string } = {},
): { html: string; fixes: number } {
  const light = opts.light || "#FFFFFF";
  const dark = opts.dark || "#1C1C20";
  if (!html) return { html, fixes: 0 };

  // Pile des fonds : chaque tag ouvrant pousse son fond (ou hérite du courant).
  // null = fond inconnu (image…) → les checks sont suspendus dessous.
  // Un fond = liste de luminances (1 pour un uni, 1 par arrêt pour un dégradé).
  const bgStack: Array<number[] | null> = [null];
  let fixes = 0;
  let out = "";
  let last = 0;
  const lightLum = luminance(parseColor(light) || { r: 255, g: 255, b: 255, a: 1 });
  const darkLum = luminance(parseColor(dark) || { r: 28, g: 28, b: 32, a: 1 });

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    out += html.slice(last, m.index);
    let tag = m[0];
    const name = m[1].toLowerCase();
    const isClosing = tag.startsWith("</");
    const selfClosing = /\/>$/.test(tag) || VOID_TAGS.has(name);

    if (isClosing) {
      if (bgStack.length > 1) bgStack.pop();
      out += tag;
      last = tagRe.lastIndex;
      continue;
    }

    const styleMatch = tag.match(/style\s*=\s*"([^"]*)"/i);
    const style = styleMatch ? styleMatch[1] : "";
    const inherited = bgStack[bgStack.length - 1];
    const ownBg = style ? backgroundLuminances(style, inherited) : undefined;
    let effectiveBg = ownBg === undefined ? inherited : ownBg;

    if (style && effectiveBg) {
      const colorMatch = style.match(/(?<![a-zA-Z-])color\s*:\s*([^;"']+)/);
      const opacityMatch = style.match(/(?<![a-zA-Z-])opacity\s*:\s*([\d.]+)/);
      const decorative = opacityMatch ? parseFloat(opacityMatch[1]) < 0.5 : false;
      if (colorMatch && !decorative) {
        const rgb = parseColor(colorMatch[1]);
        if (rgb && rgb.a >= 0.9) {
          const textLum = luminance(rgb);
          let replacement: string | null = null;
          let backing: string | null = null;
          if (effectiveBg.length === 1) {
            // Fond uni : comportement historique inchangé (seuil 1.6).
            if (contrastRatio(textLum, effectiveBg[0]) < RATIO_MIN) {
              replacement = effectiveBg[0] < 0.4 ? light : dark;
            }
          } else if (worstRatio(textLum, effectiveBg) < RATIO_MIN_GRADIENT) {
            // Dégradé : on garde la couleur (claire ou foncée) qui tient le
            // mieux sur TOUT le dégradé, et seulement si elle fait mieux.
            const current = worstRatio(textLum, effectiveBg);
            const withLight = worstRatio(lightLum, effectiveBg);
            const withDark = worstRatio(darkLum, effectiveBg);
            const useDark = withDark >= withLight;
            if (Math.max(withLight, withDark) > current) replacement = useDark ? dark : light;
            // Dégradé trop étendu (clair ET sombre) : aucune couleur ne tient 3:1
            // partout. Si le dégradé est HÉRITÉ (texte posé dessus, pas un bouton
            // qui porte lui-même le dégradé), on pose un cartouche uni opposé
            // derrière le texte → contraste garanti, à l'écran comme au PPTX
            // (le fond uni d'un bloc éditable reste dans le raster).
            if (ownBg === undefined && Math.max(withLight, withDark) < RATIO_MIN_GRADIENT) {
              replacement = useDark ? dark : light;
              backing = useDark ? light : dark;
            }
          }
          if (replacement) {
            let fixedStyle = style.replace(
              /(?<![a-zA-Z-])color\s*:\s*[^;"']+/,
              `color:${replacement}`,
            );
            if (backing) {
              fixedStyle = `${fixedStyle.replace(/;?\s*$/, "")};background-color:${backing};padding:0.1em 0.35em;border-radius:0.2em`;
              effectiveBg = [backing === light ? lightLum : darkLum];
            }
            tag = tag.replace(styleMatch![0], `style="${fixedStyle}"`);
            fixes++;
          }
        }
      }
    }

    if (!selfClosing) bgStack.push(effectiveBg);
    out += tag;
    last = tagRe.lastIndex;
  }
  out += html.slice(last);
  return { html: out, fixes };
}
