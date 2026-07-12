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
