// Garde DÉTERMINISTE de taille de police pour les slides HTML générées.
//
// Audit lisibilité 12/07/2026 : le modèle gravite vers les tailles des exemples
// few-shot (corps 26px sur une slide de 1080px → ~9px à l'écran sur un feed
// Instagram, illisible). Le prompt prescrit désormais 34-40px, mais la vraie
// parade est déterministe : tout élément TEXTE éditable (data-pptx-editable)
// dont le font-size inline est sous le plancher de son rôle est remonté au
// plancher.
//
// Conservateur par design :
// - on ne GROSSIT que, jamais de réduction (une grande taille voulue reste) ;
// - seuls les éléments porteurs de data-pptx-editable sont touchés — les
//   décors (guillemets géants, numéros, emojis, badges sans rôle) sont ignorés ;
// - un élément sans font-size inline hérite → on ne juge pas ;
// - les planchers restent SOUS les fourchettes du prompt (corps 34-40 → plancher
//   30) : le garde rattrape l'illisible, il n'écrase pas les choix du modèle.
//   Le remplissage cible (75-92 % de la hauteur) laisse la marge d'absorber le
//   bump sans débordement.

/** Plancher (px CSS sur slide 1080×1350) par rôle data-pptx-editable. */
export const FONT_FLOORS_PX: Record<string, number> = {
  body: 30,
  subtitle: 30,
  title: 34,
  caption: 24,
  overlay: 32,
};

/**
 * Remonte au plancher de son rôle tout font-size inline trop petit dans `html`.
 * Retourne le HTML corrigé et le nombre de bumps effectués.
 */
export function enforceMinFontSize(
  html: string,
  floors: Record<string, number> = FONT_FLOORS_PX,
): { html: string; fixes: number } {
  if (!html) return { html, fixes: 0 };
  let fixes = 0;
  const tagRe = /<[a-zA-Z][a-zA-Z0-9]*((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const out = html.replace(tagRe, (tag) => {
    const roleMatch = tag.match(/data-pptx-editable\s*=\s*"([^"]*)"/i);
    if (!roleMatch) return tag;
    const floor = floors[roleMatch[1].toLowerCase()];
    if (!floor) return tag;
    const styleMatch = tag.match(/style\s*=\s*"([^"]*)"/i);
    if (!styleMatch) return tag;
    let bumped = false;
    const fixedStyle = styleMatch[1].replace(
      /(?<![a-zA-Z-])font-size\s*:\s*([\d.]+)px/gi,
      (decl, px) => {
        if (parseFloat(px) >= floor) return decl;
        bumped = true;
        return `font-size:${floor}px`;
      },
    );
    if (!bumped) return tag;
    fixes++;
    return tag.replace(styleMatch[0], `style="${fixedStyle}"`);
  });
  return { html: out, fixes };
}

/**
 * Variante GLOBALE pour les HTML générés SANS rôles data-pptx-editable
 * (ex. épingle Pinterest) : remonte au plancher tout font-size inline trop
 * petit, quel que soit l'élément. Exemptions décoratives : éléments
 * aria-hidden="true" et éléments dont l'opacity propre est < 0.7 (watermarks,
 * numéros fantômes). Bump only, jamais de réduction.
 */
export function enforceGlobalMinFontSize(
  html: string,
  floorPx = 20,
): { html: string; fixes: number } {
  if (!html) return { html, fixes: 0 };
  let fixes = 0;
  const tagRe = /<[a-zA-Z][a-zA-Z0-9]*((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const out = html.replace(tagRe, (tag) => {
    if (/aria-hidden\s*=\s*"true"/i.test(tag)) return tag;
    const styleMatch = tag.match(/style\s*=\s*"([^"]*)"/i);
    if (!styleMatch) return tag;
    const opacity = styleMatch[1].match(/(?<![a-zA-Z-])opacity\s*:\s*([\d.]+)/i);
    if (opacity && parseFloat(opacity[1]) < 0.7) return tag;
    let bumped = false;
    const fixedStyle = styleMatch[1].replace(
      /(?<![a-zA-Z-])font-size\s*:\s*([\d.]+)px/gi,
      (decl, px) => {
        if (parseFloat(px) >= floorPx) return decl;
        bumped = true;
        return `font-size:${floorPx}px`;
      },
    );
    if (!bumped) return tag;
    fixes++;
    return tag.replace(styleMatch[0], `style="${fixedStyle}"`);
  });
  return { html: out, fixes };
}

/**
 * Plancher BLOQUANT du contrôle qualité de l'éditeur (src/lib/carousel-quality.ts,
 * ESSENTIAL_FLOOR_PX) : sous cette taille, la publication est refusée.
 */
export const EDITOR_BLOCKING_FLOOR_PX = 32;

/**
 * Garde alignée sur le contrôle de l'éditeur (bug 28/09/2026 : carrousel
 * fraîchement généré bloqué à la publication).
 *
 * `enforceMinFontSize` ne regarde que les éléments que le MODÈLE a tagués
 * data-pptx-editable. Or l'éditeur, à l'ouverture, tague lui-même « body »
 * tout élément porteur de texte (libellés de cartes, CTA, emojis…) et les
 * juge tous au plancher de 32 px — y compris ceux qui HÉRITENT leur taille
 * (16 px par défaut du navigateur si rien n'est posé). Cette passe couvre
 * donc ce que l'éditeur jugera :
 * - tout font-size inline en px sous le plancher est remonté, quel que soit
 *   l'élément (hors décors que l'éditeur ignore aussi : aria-hidden,
 *   data-decorative, data-slide-page, pagination « 3 / 8 ») ;
 * - le conteneur racine reçoit une taille par défaut s'il n'en a pas, pour
 *   que le texte sans taille propre n'hérite plus des 16 px du navigateur ;
 * - le contenu des <svg> n'est jamais touché (illustrations).
 * Bump only, jamais de réduction ; font-size:0 (astuce d'espacement) ignoré.
 */
export function enforceEditorFontFloor(
  html: string,
  floorPx = EDITOR_BLOCKING_FLOOR_PX,
): { html: string; fixes: number } {
  if (!html) return { html, fixes: 0 };
  let fixes = 0;
  let rootSeen = false;
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>([^<]*)/g;
  const fixTags = (chunk: string) =>
    chunk.replace(tagRe, (whole, name: string, _attrs: string, text: string) => {
      const tag = whole.slice(0, whole.length - text.length);
      const lower = name.toLowerCase();
      if (["link", "style", "meta", "script", "br", "img"].includes(lower)) return whole;
      const isRoot = !rootSeen;
      rootSeen = true;
      if (
        /aria-hidden\s*=\s*"true"/i.test(tag) ||
        /\sdata-(decorative|slide-page)\b/i.test(tag) ||
        /data-pptx-editable\s*=\s*"(page|page_number|pagination|slide_number|number)"/i.test(tag) ||
        /^\s*\d+\s*\/\s*\d+\s*$/.test(text)
      ) return whole;
      const styleMatch = tag.match(/style\s*=\s*"([^"]*)"/i);
      const hasSize = !!styleMatch && /(?<![a-zA-Z-])font-size\s*:/i.test(styleMatch[1]);
      if (isRoot && !hasSize) {
        fixes++;
        const next = styleMatch
          ? tag.replace(styleMatch[0], `style="${styleMatch[1].replace(/;?\s*$/, ";")}font-size:${floorPx}px"`)
          : tag.replace(/\s*>$/, ` style="font-size:${floorPx}px">`);
        return next + text;
      }
      if (!styleMatch) return whole;
      let bumped = false;
      const fixedStyle = styleMatch[1].replace(
        /(?<![a-zA-Z-])font-size\s*:\s*([\d.]+)px/gi,
        (decl, px) => {
          const v = parseFloat(px);
          if (v < 1 || v >= floorPx) return decl;
          bumped = true;
          return `font-size:${floorPx}px`;
        },
      );
      if (!bumped) return whole;
      fixes++;
      return tag.replace(styleMatch[0], `style="${fixedStyle}"`) + text;
    });
  // Les <svg> (illustrations, pictos) restent intacts.
  const out = html
    .split(/(<svg[\s\S]*?<\/svg>)/i)
    .map((part) => (/^<svg/i.test(part) ? part : fixTags(part)))
    .join("");
  return { html: out, fixes };
}
