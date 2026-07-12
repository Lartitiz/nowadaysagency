// Gardes DÉTERMINISTES du rendu photo+overlay (audit carrousel photo 12/07, lot C).
//
// Constats live : le prompt de carousel-visual exige 200px de marge basse, un
// voile sous tout texte clair et une slide 1 « héros » (64-88px) — trois règles
// violées au rendu réel (texte à ~1240px, slide 1 à 44-58px) alors que le modèle
// s'auto-déclare conforme. Même patron que font-size-guard : correction par
// regex sur le HTML inline, on ne RÉTRÉCIT jamais, échec = HTML rendu tel quel.

const BOTTOM_SAFE_PX = 200; // icône carrousel Instagram + crop mobile (prompt)
const TOP_SAFE_PX = 96; // 80px prompt + marge de comptage
const HERO_MIN_PX = 64; // slide 1 « affiche » : 64-88px pour un hook court
const HERO_MAX_WORDS = 12;

/** Parse un raccourci CSS padding (1-4 valeurs px) → {top,right,bottom,left} ou null. */
function parsePaddingShorthand(value: string): { top: number; right: number; bottom: number; left: number } | null {
  const parts = value.trim().split(/\s+/).map((p) => {
    // « 0 » sans unité est du CSS valide et courant (padding:0 80px 100px 80px).
    const m = p.match(/^(\d+(?:\.\d+)?)(?:px)?$/);
    return m ? parseFloat(m[1]) : NaN;
  });
  if (parts.some((n) => Number.isNaN(n)) || parts.length < 1 || parts.length > 4) return null;
  const [a, b = a, c = a, d = b] = parts;
  return { top: a, right: b, bottom: c, left: d };
}

/** Force un plancher de padding (bottom ou top) dans UNE déclaration style inline. */
function bumpPaddingInStyle(style: string, side: "bottom" | "top", floor: number): { style: string; bumped: boolean } {
  // 1. padding-bottom / padding-top explicite
  const explicitRe = new RegExp(`padding-${side}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, "i");
  const explicit = style.match(explicitRe);
  if (explicit) {
    if (parseFloat(explicit[1]) >= floor) return { style, bumped: false };
    return { style: style.replace(explicitRe, `padding-${side}:${floor}px`), bumped: true };
  }
  // 2. raccourci padding:…
  const shortRe = /(?<![a-z-])padding\s*:\s*([^;"']+)/i;
  const short = style.match(shortRe);
  if (short) {
    const parsed = parsePaddingShorthand(short[1]);
    if (!parsed) return { style, bumped: false }; // valeur non-px (%, calc) : on ne touche pas
    if (parsed[side] >= floor) return { style, bumped: false };
    parsed[side] = floor;
    const rebuilt = `padding:${parsed.top}px ${parsed.right}px ${parsed.bottom}px ${parsed.left}px`;
    return { style: style.replace(shortRe, rebuilt), bumped: true };
  }
  // 3. aucun padding : on en pose un
  return { style: `${style.replace(/;\s*$/, "")};padding-${side}:${floor}px`, bumped: true };
}

/**
 * Safe zones Instagram : garantit la marge basse (200px) ou haute (96px) du bloc
 * texte, guidé par l'overlay_position DE LA SLIDE (donnée d'entrée, pas une
 * supposition). Cible les wrappers porteurs du placement : `justify-content:
 * flex-end` en colonne, `margin-top:auto`, et le wrapper immédiat de l'ancre
 * data-slide-text="overlay".
 */
export function enforceSafeZones(html: string, overlayPosition?: string | null): { html: string; fixes: number } {
  if (!html || !html.includes('data-slide-text="overlay"')) return { html, fixes: 0 };
  const pos = String(overlayPosition || "");
  const isBottom = /^bottom/.test(pos) || pos === ""; // défaut du prompt : en bas
  const isTop = /^top/.test(pos);
  if (!isBottom && !isTop) return { html, fixes: 0 }; // center : rien à garantir

  let fixes = 0;
  const side: "bottom" | "top" = isBottom ? "bottom" : "top";
  const floor = isBottom ? BOTTOM_SAFE_PX : TOP_SAFE_PX;

  // Wrappers de placement : flex-end colonne / margin-top:auto (bas) ; flex colonne (haut).
  const anchorIdx = html.indexOf('data-slide-text="overlay"');
  const divRe = /<div style="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  const targets: Array<{ start: number; end: number; style: string }> = [];
  while ((m = divRe.exec(html)) !== null) {
    const style = m[1];
    const isPlacer = isBottom
      ? (/justify-content\s*:\s*flex-end/i.test(style) && /flex-direction\s*:\s*column/i.test(style)) ||
        /margin-top\s*:\s*auto/i.test(style)
      : /justify-content\s*:\s*flex-start/i.test(style) && /flex-direction\s*:\s*column/i.test(style);
    if (isPlacer) targets.push({ start: m.index, end: m.index + m[0].length, style });
  }
  // Wrapper immédiat de l'ancre (dernier div ouvert avant elle) — couvre les
  // layouts sans flex-end (bloc simplement posé en fin de colonne).
  if (isBottom) {
    let lastDiv: RegExpExecArray | null = null;
    divRe.lastIndex = 0;
    while ((m = divRe.exec(html)) !== null) {
      if (m.index >= anchorIdx) break;
      lastDiv = m;
    }
    if (lastDiv && /padding/i.test(lastDiv[1]) && !targets.some((t) => t.start === lastDiv!.index)) {
      targets.push({ start: lastDiv.index, end: lastDiv.index + lastDiv[0].length, style: lastDiv[1] });
    }
  }

  // Applique les bumps de la fin vers le début (les index restent valides).
  let out = html;
  for (const t of targets.sort((a, b) => b.start - a.start)) {
    const { style: newStyle, bumped } = bumpPaddingInStyle(t.style, side, floor);
    if (!bumped) continue;
    out = out.slice(0, t.start) + `<div style="${newStyle}"` + out.slice(t.end);
    fixes++;
  }
  return { html: out, fixes };
}

/**
 * Filet scrim : un texte CLAIR posé sur la photo sans AUCUN voile/bandeau sombre
 * (le text-shadow seul ne compte pas — anti-pattern n°1 du prompt) reçoit un
 * dégradé sombre injecté EN CODE, ancré au bord de l'overlay_position. Zéro
 * appel modèle, zéro réécriture : on ajoute un calque, on ne touche à rien.
 */
export function injectFallbackScrim(html: string, overlayPosition?: string | null): { html: string; injected: boolean } {
  if (!html || !html.includes('data-slide-text="overlay"')) return { html, injected: false };

  // Cas 2 (re-test lots C-F, 12/07 soir) : l'ancre overlay en couleur SOMBRE de la
  // charte (ex #3B382F) posée sur la photo SANS carte claire — illisible et hors
  // contrat (le prompt impose blanc-sur-sombre ou foncé-sur-bandeau-clair). On
  // blanchit l'ancre puis on laisse le scrim sombre se poser en dessous.
  let work = html;
  const anchorRe = /(<[a-z][a-z0-9]*[^>]*data-slide-text="overlay"[^>]*style=")([^"]*)(")/i;
  const anchor = work.match(anchorRe);
  const anchorColor = anchor?.[2].match(/color\s*:\s*#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  const hasLightCard = /background[^;"']*:\s*(?:#fff\b|#ffffff\b|rgba?\(\s*2[45]\d\s*,\s*2[45]\d\s*,\s*2[45]\d)/i.test(work);
  if (anchor && anchorColor && !hasLightCard) {
    const hex = anchorColor[1].length === 3 ? anchorColor[1].split("").map((c) => c + c).join("") : anchorColor[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance < 0.5) {
      const newStyle = anchor[2].replace(/color\s*:\s*#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i, "color:#FFFFFF");
      work = work.replace(anchorRe, `$1${newStyle}$3`);
      console.log("[photo-visual-guards] ancre overlay sombre sur photo sans carte → blanchie (scrim à suivre)");
    }
  }

  const hasLightText = /color\s*:\s*(#fff(?:fff)?\b|white\b|rgba?\(\s*2[45]\d\s*,\s*2[45]\d\s*,\s*2[45]\d)/i.test(work);
  if (!hasLightText) return { html: work, injected: false };
  // Le text-shadow ne compte PAS comme protection (durcissement audit 12/07) :
  // on l'efface avant de chercher un voile/bandeau sombre réel.
  const htmlNoShadow = work.replace(/text-shadow\s*:[^;"']*/gi, "");
  const darkVeil = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(?:0?\.(?:3[5-9]|[4-9]\d?)|1(?:\.0+)?)\s*\)/i.test(htmlNoShadow);
  const darkSolid = /background[^;"']*:\s*(?:#0{3}\b|#0{6}\b|rgb\(\s*(?:[0-2]?\d|3[0-2])\s*,)/i.test(htmlNoShadow);
  if (darkVeil || darkSolid) return { html: work, injected: false };

  const pos = String(overlayPosition || "");
  const scrim = /^top/.test(pos)
    ? `<div data-injected-scrim="1" style="position:absolute;left:0;right:0;top:0;height:520px;background:linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0));pointer-events:none;"></div>`
    : pos === "center"
      ? `<div data-injected-scrim="1" style="position:absolute;inset:0;background:radial-gradient(circle at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 68%);pointer-events:none;"></div>`
      : `<div data-injected-scrim="1" style="position:absolute;left:0;right:0;bottom:0;height:520px;background:linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0));pointer-events:none;"></div>`;

  // Injection juste après l'ouverture du div racine 1080×1350 (position:relative
  // déjà posée par le contrat de rendu ; on l'ajoute si absente).
  const rootRe = /(<div style=")([^"]*width\s*:\s*1080px[^"]*)(")/i;
  const root = rootRe.exec(work);
  if (!root) return { html: work, injected: false };
  let rootStyle = root[2];
  if (!/position\s*:/i.test(rootStyle)) rootStyle = `position:relative;${rootStyle}`;
  const rootTagClose = work.indexOf(">", root.index + root[0].length);
  if (rootTagClose < 0) return { html: work, injected: false };
  const out =
    work.slice(0, root.index) +
    `<div style="${rootStyle}"` +
    work.slice(root.index + root[0].length, rootTagClose + 1) +
    scrim +
    work.slice(rootTagClose + 1);
  return { html: out, injected: true };
}

/**
 * Slide 1 « héros » : un hook court (≤ 12 mots) doit être une affiche (64-88px,
 * règle du prompt), pas un texte timide — constaté 44-58px sur 2 runs live. On
 * remonte le font-size de l'ancre overlay au plancher héros. Jamais de réduction.
 */
export function enforceHeroHook(html: string, overlayText?: string | null): { html: string; bumped: boolean } {
  if (!html || !overlayText) return { html, bumped: false };
  const words = String(overlayText).trim().split(/\s+/).filter(Boolean).length;
  if (words === 0 || words > HERO_MAX_WORDS) return { html, bumped: false };

  const anchorRe = /(<[a-z][a-z0-9]*[^>]*data-slide-text="overlay"[^>]*style=")([^"]*)(")/i;
  const m = html.match(anchorRe);
  if (!m) return { html, bumped: false };
  const sizeRe = /font-size\s*:\s*(\d+(?:\.\d+)?)px/i;
  const size = m[2].match(sizeRe);
  if (!size || parseFloat(size[1]) >= HERO_MIN_PX) return { html, bumped: false };
  const newStyle = m[2].replace(sizeRe, `font-size:${HERO_MIN_PX}px`);
  return { html: html.replace(anchorRe, `$1${newStyle}$3`), bumped: true };
}
