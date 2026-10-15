// Export hybride (fiche 15, lot 3) : placement du texte MODIFIABLE dans la slide
// PowerPoint (largeur, carte parente, place verticale, plancher 15 pt), déplacé à
// l'identique depuis export-carousel-hybrid-pptx.ts. pptxgenjs n'y sert qu'aux types.
import { type BlockRender, PX_PER_IN, type BlockLayoutContext, SLIDE_H_PX, type HybridCharter, PPTX_W_IN, PPTX_H_IN } from "./types";
import { pxToInches, fontSizePxToPt, letterSpacingPxToCharSpacing, type ShapeBlock, fontSizePxToPtRaw, MIN_FONT_PT, mapFontToPptx, normalizeHex } from "../pptx-font-mapping";
import type PptxGenJS from "pptxgenjs";
import { applyTextTransform } from "./text-blocks";

/** Police à chasse fixe ? (IBM Plex Mono, Courier…) */
export function isMonoFont(fontFamily: string | undefined | null): boolean {
  return /mono|courier/i.test(fontFamily || "");
}

/**
 * Largeur CIBLE (en pouces) d'un bloc texte dans PowerPoint.
 *
 * Le navigateur rend les webfonts réelles ; PowerPoint/Canva substituent
 * souvent (Libre Baskerville, IBM Plex Mono rarement installées) par des
 * polices aux métriques plus larges → un texte re-wrappe, gagne des lignes et
 * chevauche le bloc du dessous (vu en prod sur 4 slides d'un même carrousel).
 *
 * - Bloc UNE LIGNE en mono : largeur EXACTE calculable (chasse fixe 0.6 em)
 *   + letter-spacing + marge de gravure 6 %.
 * - Sinon : slack forfaitaire — 25 % pour les mono (substitution Courier plus
 *   large + letter-spacing), 18 % pour le reste (serif de substitution).
 */
export function desiredTextWidthIn(block: BlockRender): number {
  const wRaw = pxToInches(block.rect.w, PX_PER_IN);
  // Photo copy is laid out against pixels and local reading surfaces. Font
  // substitution must never enlarge its frame across the photograph/card.
  if (block.el?.closest("[data-photo-reading-panel],[data-photo-text-layout]")) return wRaw;
  const mono = isMonoFont(block.style.fontFamily);
  const singleLine = !block.text.includes("\n") && block.rect.h < block.style.lineHeight * 1.6;
  if (mono && singleLine) {
    const fontPt = fontSizePxToPt(block.style.fontSizePx, PX_PER_IN);
    const spacingPt = letterSpacingPxToCharSpacing(block.style.letterSpacingPx, PX_PER_IN) || 0;
    const n = block.text.length;
    const estIn = (n * fontPt * 0.6 + Math.max(0, n - 1) * spacingPt) / 72 * 1.06;
    return Math.max(wRaw, estIn);
  }
  const ratio = mono ? 0.25 : 0.18;
  return wRaw + Math.max(0.12, wRaw * ratio);
}

/** Marge intérieure conservée entre le texte et le bord de sa carte (px). */
export const CARD_INSET_PX = 10;

/**
 * Respiration minimale conservée au-dessus du bloc suivant (fraction de
 * ligne). 0.35 laissait encore un « baiser » d'une ligne sous police
 * substituée (mesuré sur process_visible colonne étroite) — 0.5 l'absorbe.
 */
export const BUDGET_GAP_LINES = 0.5;

/**
 * Plus petite CARTE native contenant entièrement le bloc (tolérance 2 px).
 * Les PILULES sont exclues : elles sont élargies nativement pour épouser leur
 * label (#420) — borner le label à la pilule d'origine casserait ce mécanisme.
 */
export function parentCardOf(block: BlockRender, cards: ShapeBlock[]): ShapeBlock | null {
  const b = block.rect;
  let best: ShapeBlock | null = null;
  for (const c of cards) {
    if (c.type !== "card") continue;
    const r = c.rect;
    const contains =
      b.x >= r.x - 2 && b.y >= r.y - 2 && b.x + b.w <= r.x + r.w + 2 && b.y + b.h <= r.y + r.h + 2;
    if (!contains) continue;
    if (!best || r.w * r.h < best.rect.w * best.rect.h) best = c;
  }
  return best;
}

/**
 * Espace vertical (px) dont dispose le bloc avant le premier obstacle : le
 * prochain bloc texte qui le recouvre horizontalement, sinon le bas de sa
 * carte, sinon le bas de la slide. C'est le budget que le plancher
 * MIN_FONT_PT n'a pas le droit de dépasser.
 */
export function verticalBudgetPx(block: BlockRender, ctx: BlockLayoutContext, card: ShapeBlock | null): number {
  const b = block.rect;
  let limit = SLIDE_H_PX;
  for (const s of ctx.siblings) {
    if (s === block) continue;
    if (s.rect.y <= b.y + 1) continue; // au-dessus ou même ligne
    const overlap = Math.min(b.x + b.w, s.rect.x + s.rect.w) - Math.max(b.x, s.rect.x);
    if (overlap < Math.min(b.w, s.rect.w) * 0.15) continue; // pas la même colonne
    limit = Math.min(limit, s.rect.y);
  }
  if (card) limit = Math.min(limit, card.rect.y + card.rect.h - CARD_INSET_PX);
  const gap = block.style.lineHeight * BUDGET_GAP_LINES;
  return Math.max(0, limit - b.y - gap);
}

/**
 * Jusqu'où (en pt) le bloc peut grossir sans déborder de sa boîte élargie
 * (largeur `wIn`, budget vertical `budgetPx`). Estimation déterministe :
 * nb de lignes HTML mesuré × inflation. En grossissant d'un facteur f, les
 * caractères par ligne baissent en 1/f (→ lignes × f) et la hauteur de ligne
 * monte en f → hauteur totale ≈ f². Une seule ligne (wrap:false) : la largeur
 * mesurée rect.w grossit en f et doit tenir dans la boîte.
 */
export function maxFitPt(block: BlockRender, wIn: number, budgetPx: number, isSingleLine: boolean): number {
  const naturalPt = fontSizePxToPtRaw(block.style.fontSizePx, PX_PER_IN);
  if (naturalPt <= 0) return MIN_FONT_PT;
  const lhPx = Math.max(1, block.style.lineHeight);
  const wPx = Math.max(wIn * PX_PER_IN, block.rect.w * 0.9);
  let f: number;
  if (isSingleLine) {
    // rect.w = largeur du BLOC (souvent toute la carte), pas celle du texte.
    // Estime la largeur du texte lui-même (em moyen prudent : 0.72 par
    // caractère, 1.25 par emoji) pour autoriser la montée des labels courts
    // dans une carte large, sans jamais risquer de traverser la boîte.
    let ems = 0;
    for (const chr of block.text) ems += /\p{Extended_Pictographic}/u.test(chr) ? 1.25 : 0.72;
    const estTextPx =
      Math.min(block.rect.w, ems * block.style.fontSizePx) +
      Math.max(0, block.text.length - 1) * (block.style.letterSpacingPx || 0);
    const fWidth = wPx / Math.max(1, estTextPx);
    const fHeight = budgetPx / lhPx;
    f = Math.min(fWidth, fHeight);
  } else {
    // Ne PAS créditer la boîte élargie d'une réduction du nombre de lignes :
    // PowerPoint garde souvent le wrap HTML (mesuré : un ×0.85 optimiste
    // laissait encore un chevauchement d'une ligne). Lignes = lignes HTML.
    const linesHtml = Math.max(1, Math.round(block.rect.h / lhPx));
    f = Math.sqrt(budgetPx / Math.max(1, linesHtml * lhPx));
  }
  return Math.floor(naturalPt * Math.max(1, f) * 10) / 10;
}

export function addBlockToSlide(
  slide: PptxGenJS.Slide,
  block: BlockRender,
  charter: HybridCharter | null | undefined,
  ctx: BlockLayoutContext,
) {
  let x = pxToInches(block.rect.x, PX_PER_IN);
  const y = pxToInches(block.rect.y, PX_PER_IN);
  const wRaw = pxToInches(block.rect.w, PX_PER_IN);
  // Slack LARGEUR (cf. desiredTextWidthIn) : étendu SELON L'ALIGNEMENT pour ne
  // pas décaler le texte, borné aux bords de la slide. La boîte reste
  // transparente : la largeur en plus n'est occupée que si le texte en a
  // réellement besoin.
  const wDesired = desiredTextWidthIn(block);
  const wSafety = wDesired - wRaw;
  let w = wDesired;
  if (block.style.textAlign === "center") {
    x -= wSafety / 2;
  } else if (block.style.textAlign === "right") {
    x -= wSafety;
  }
  // Le slack s'arrête au bord INTÉRIEUR de la carte parente, pas au bord de
  // slide (audit 10/07 : le texte traversait la bordure des cartes voisines
  // sur comparison/matrix_2x2). Hors carte : bords de slide comme avant.
  const parentCard = parentCardOf(block, ctx.cards);
  const minX = parentCard ? pxToInches(parentCard.rect.x + CARD_INSET_PX, PX_PER_IN) : 0;
  const maxX2 = parentCard
    ? Math.min(PPTX_W_IN, pxToInches(parentCard.rect.x + parentCard.rect.w - CARD_INSET_PX, PX_PER_IN))
    : PPTX_W_IN;
  if (x < minX) {
    w -= minX - x;
    x = minX;
  }
  w = Math.min(w, maxX2 - x);
  // Garde-fou : une carte anormalement étroite ne doit jamais produire une
  // boîte nulle/négative (le bloc sauterait) — on retombe sur la boîte HTML.
  if (w < wRaw * 0.5) {
    x = pxToInches(block.rect.x, PX_PER_IN);
    w = Math.min(wRaw, PPTX_W_IN - x);
  }
  // Marge de sécurité proportionnelle à la taille de police (≈ demi-ligne),
  // plancher 0.15" — absorbe les écarts de wrapping HTML vs PowerPoint
  // (métriques de fonts, kerning, arrondis lineSpacing/charSpacing).
  const safetyMargin = Math.max(
    0.15,
    pxToInches(block.style.fontSizePx, PX_PER_IN) * 0.5,
  );
  const h = Math.min(
    PPTX_H_IN - y,
    pxToInches(block.rect.h, PX_PER_IN) + (block.style.verticalAlign ? 0 : safetyMargin),
    ...(block.el?.closest("[data-photo-editorial-text]")
      ? [pxToInches(Math.max(block.rect.h, verticalBudgetPx(block, ctx, parentCard)), PX_PER_IN)] : []),
  );

  const isTitleish = block.kind === "title" || block.kind === "overlay";
  const fontFace = mapFontToPptx(
    block.style.fontFamily || (isTitleish ? charter?.font_title : charter?.font_body),
  );
  const charterTextFallback = normalizeHex(charter?.color_text, "FFFFFF");
  const color = normalizeHex(block.style.color, charterTextFallback);
  const charSpacing = letterSpacingPxToCharSpacing(block.style.letterSpacingPx, PX_PER_IN);

  // Un bloc rendu sur UNE seule ligne en HTML ne doit JAMAIS re-wrapper dans
  // PowerPoint : ses métriques (mono + letter-spacing surtout) y sont plus
  // larges et cassent les petits labels malgré le slack de largeur
  // (« ENTREPRI/SES » hors pilule, « LE/CONSTAT », « LIEN EN [BIO] » — vus en
  // prod). La boîte est transparente : le léger débord éventuel est bénin,
  // contrairement à un wrap qui déborde verticalement sur l'élément du dessous.
  const isSingleLine =
    !block.text.includes("\n") &&
    block.rect.h < block.style.lineHeight * 1.6;

  // Boîte MULTI-LIGNE bloquée par le bord de la slide (colonne collée à
  // droite, pleine largeur…) : elle ne peut pas absorber le slack → le texte
  // re-wrapperait quand même et gagnerait des lignes sur le bloc du dessous
  // (vu en prod : deux paragraphes superposés). On réduit la police au prorata
  // du déficit (plancher 80 % — mesuré : une colonne collée au bord droit
  // demandait 84 %, le plancher 88 % laissait encore une ligne de chevauche-
  // ment) : le wrap redevient ≈ celui du HTML. Les blocs une-ligne sont en
  // wrap:false → jamais concernés.
  // ── Taille de police : plancher MIN_FONT_PT layout-aware (audit 10/07) ──
  // Base = taille naturelle px→pt, fidèle au HTML. La règle de déficit de
  // largeur (#425) s'applique sur cette base. Puis, si la base est sous
  // MIN_FONT_PT (#179, lisibilité Canva), on monte vers 15pt UNIQUEMENT tant
  // que le bloc tient dans son budget vertical (prochain bloc texte / bas de
  // carte) et dans sa boîte élargie. C'est ce que `fit:"shrink"` promettait,
  // mais PowerPoint n'applique pas normAutofit à l'ouverture → le plancher
  // aveugle produisait des chevauchements (mesurés sur 8 templates + 1
  // carrousel réel, cf. audit fidélité 10/07).
  const naturalPt = fontSizePxToPtRaw(block.style.fontSizePx, PX_PER_IN);
  let fontSize = naturalPt;
  if (naturalPt < MIN_FONT_PT) {
    const budgetPx = verticalBudgetPx(block, ctx, parentCard);
    const fitPt = maxFitPt(block, w, budgetPx, isSingleLine);
    fontSize = Math.max(naturalPt, Math.min(MIN_FONT_PT, fitPt));
    if (fontSize < MIN_FONT_PT) {
      console.debug(
        `[hybrid] plancher ${MIN_FONT_PT}pt refusé (place manquante) : ${fontSize}pt gardés pour « ${block.text.slice(0, 40)} »`,
      );
    }
  }
  // La règle de déficit de largeur (#425) s'applique EN DERNIER, sur la taille
  // éventuellement montée : elle protège du re-wrap de SUBSTITUTION de police
  // (boîte clampée à la carte = slack inabsorbable), que le budget vertical ne
  // modélise pas. L'inverser annulait sa protection (mesuré : colonnes
  // process_visible toujours en collision à l'itération 1 du lot 1).
  if (!isSingleLine && w < wDesired - 0.01) {
    fontSize = Math.round(fontSize * Math.max(0.8, w / wDesired) * 10) / 10;
  }

  const frameOptions: PptxGenJS.TextPropsOptions = {
    x,
    y,
    w,
    h,
    fontFace,
    fontSize,
    bold: block.style.fontWeight >= 600,
    italic: block.style.fontStyle === "italic",
    color,
    align: block.style.textAlign,
    valign: block.style.verticalAlign || "top",
    wrap: !isSingleLine,
    margin: 0,
    // « Réduire le texte en cas de débordement » : si malgré les slacks le texte
    // dépasse encore la boîte (métriques de police exotiques), PowerPoint le
    // rétrécit au lieu de le laisser déborder sur l'élément d'en dessous
    // (dernière ligne rognée au bord d'une carte, vue en prod).
    fit: "shrink",
    charSpacing: charSpacing || undefined,
    lineSpacingMultiple: Math.max(0.9, Math.min(1.6, block.style.lineHeight / Math.max(1, block.style.fontSizePx))),
  };

  // Multi-runs path: preserve inline italic/bold/color/surligneur from
  // <span>/<em>/<strong>. Un run unique passe aussi ici s'il porte un
  // surligneur (sinon il serait perdu par le chemin texte plat).
  if (block.runs && (block.runs.length >= 2 || block.runs.some((r) => r.highlight))) {
    const pptxRuns = block.runs.map((r) => ({
      text: applyTextTransform(r.text, block.style.textTransform),
      options: {
        bold: r.bold,
        italic: r.italic,
        color: r.color,
        // Surligneur natif PowerPoint (CR-2) : suit le texte au re-wrap,
        // contrairement à des bandes posées aux positions de ligne HTML.
        highlight: r.highlight,
      },
    }));
    slide.addText(pptxRuns, frameOptions);
    return;
  }

  // Flat text path (unchanged behavior).
  slide.addText(applyTextTransform(block.text, block.style.textTransform), frameOptions);
}
