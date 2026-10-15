import { describe, it, expect } from "vitest";
import {
  addBlockToSlide,
  applyTextTransform,
  desiredTextWidthIn,
  isMonoFont,
  maxFitPt,
  parentCardOf,
  verticalBudgetPx,
  type BlockLayoutContext,
  type BlockRender,
} from "@/lib/export-carousel-hybrid-pptx";
import type { ShapeBlock } from "@/lib/pptx-font-mapping";

/**
 * Placement du texte MODIFIABLE de l'export hybride (fiche 18 de
 * docs/robustesse/gros-fichiers.md → fiche 15, lot T, 15/10/2026).
 *
 * Ces 290 lignes portent la plupart des corrections de l'été (audit fidélité
 * 10/07, #179 plancher 15 pt, #420 pilules, #425 déficit de largeur) et
 * n'étaient testées nulle part en CI. Le découpage du fichier ne doit changer
 * AUCUNE des options passées à pptxgenjs : elles sont figées ici en snapshot.
 *
 * Repère : slide 1080 px = 7,5 pouces → 144 px/pouce ; police px → pt = px / 2.
 */

const style = (over: Partial<BlockRender["style"]> = {}): BlockRender["style"] => ({
  color: "rgb(26, 26, 26)",
  fontFamily: "'IBM Plex Sans', sans-serif",
  fontSizePx: 40,
  fontWeight: 400,
  fontStyle: "normal",
  textAlign: "left",
  textTransform: "none",
  lineHeight: 50,
  letterSpacingPx: 0,
  ...over,
});

const block = (over: Partial<BlockRender> = {}, styleOver: Partial<BlockRender["style"]> = {}): BlockRender => ({
  text: "Un paragraphe sur deux lignes dans la slide",
  rect: { x: 100, y: 300, w: 600, h: 100 },
  style: style(styleOver),
  kind: "body",
  ...over,
});

const card = (rect: ShapeBlock["rect"], type: ShapeBlock["type"] = "card"): ShapeBlock =>
  ({ type, rect } as unknown as ShapeBlock);

const ctx = (siblings: BlockRender[] = [], cards: ShapeBlock[] = []): BlockLayoutContext => ({ siblings, cards });

/** Fausse slide pptxgenjs : note chaque addText (texte + options). */
function fakeSlide() {
  const calls: { text: unknown; options: Record<string, unknown> }[] = [];
  return {
    calls,
    slide: { addText: (text: unknown, options: Record<string, unknown>) => calls.push({ text, options }) } as never,
  };
}

/** Pose un bloc et rend l'unique addText, avec les nombres arrondis au millième. */
function place(b: BlockRender, c: BlockLayoutContext = ctx([b]), charter = null) {
  const { calls, slide } = fakeSlide();
  addBlockToSlide(slide, b, charter, c);
  expect(calls).toHaveLength(1);
  return JSON.parse(JSON.stringify(calls[0], (_k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));
}

describe("isMonoFont / applyTextTransform", () => {
  it("reconnaît les polices à chasse fixe", () => {
    expect(isMonoFont("'IBM Plex Mono', monospace")).toBe(true);
    expect(isMonoFont("Courier New")).toBe(true);
    expect(isMonoFont("Libre Baskerville")).toBe(false);
    expect(isMonoFont(null)).toBe(false);
  });

  it("applique les transformations CSS", () => {
    expect(applyTextTransform("Bonjour toi", "uppercase")).toBe("BONJOUR TOI");
    expect(applyTextTransform("Bonjour TOI", "lowercase")).toBe("bonjour toi");
    expect(applyTextTransform("bonjour toi", "capitalize")).toBe("Bonjour Toi");
    expect(applyTextTransform("Bonjour", "none")).toBe("Bonjour");
  });
});

describe("desiredTextWidthIn — marge contre les polices de remplacement", () => {
  it("serif / sans multi-lignes : +18 % (au moins 0,12 pouce)", () => {
    // 600 px = 4,1667 pouces → + 18 % = 4,9167
    expect(desiredTextWidthIn(block())).toBeCloseTo(4.1667 * 1.18, 3);
    // bloc étroit : le plancher 0,12 pouce l'emporte
    expect(desiredTextWidthIn(block({ rect: { x: 0, y: 0, w: 72, h: 100 } }))).toBeCloseTo(0.5 + 0.12, 3);
  });

  it("mono multi-lignes : +25 %", () => {
    const b = block({}, { fontFamily: "'IBM Plex Mono', monospace" });
    expect(desiredTextWidthIn(b)).toBeCloseTo(4.1667 * 1.25, 3);
  });

  it("mono sur UNE ligne : largeur exacte (0,6 em par caractère + 6 %) si elle dépasse la boîte HTML", () => {
    const b = block(
      { text: "ENTREPRISES", rect: { x: 100, y: 300, w: 100, h: 40 } },
      { fontFamily: "'IBM Plex Mono', monospace", fontSizePx: 40, lineHeight: 40, letterSpacingPx: 4 },
    );
    // 11 car. × 20 pt × 0,6 + 10 × 2 pt d'espacement = 152 pt → /72 × 1,06
    expect(desiredTextWidthIn(b)).toBeCloseTo((11 * 20 * 0.6 + 10 * 2) / 72 * 1.06, 3);
  });
});

describe("parentCardOf — la plus petite carte qui contient le bloc", () => {
  const b = block({ rect: { x: 120, y: 320, w: 300, h: 60 } });

  it("choisit la plus petite carte englobante (tolérance 2 px)", () => {
    const grande = card({ x: 0, y: 0, w: 1080, h: 1350 });
    const petite = card({ x: 121, y: 318, w: 301, h: 64 });
    expect(parentCardOf(b, [grande, petite])).toBe(petite);
  });

  it("ignore les pilules (élargies à part, #420) et les cartes qui ne contiennent pas le bloc", () => {
    const pilule = card({ x: 110, y: 310, w: 320, h: 80 }, "pill");
    const voisine = card({ x: 500, y: 300, w: 300, h: 100 });
    expect(parentCardOf(b, [pilule, voisine])).toBeNull();
  });
});

describe("verticalBudgetPx — place avant le premier obstacle", () => {
  const b = block({ rect: { x: 100, y: 300, w: 400, h: 60 } });

  it("s'arrête au prochain bloc de la même colonne (moins une demi-ligne)", () => {
    const dessous = block({ rect: { x: 120, y: 500, w: 300, h: 60 } });
    expect(verticalBudgetPx(b, ctx([b, dessous]), null)).toBe(500 - 300 - 25);
  });

  it("ignore un bloc d'une autre colonne et un bloc au-dessus", () => {
    const autreColonne = block({ rect: { x: 700, y: 400, w: 300, h: 60 } });
    const dessus = block({ rect: { x: 100, y: 100, w: 400, h: 60 } });
    expect(verticalBudgetPx(b, ctx([b, autreColonne, dessus]), null)).toBe(1350 - 300 - 25);
  });

  it("s'arrête au bas de la carte parente (moins sa marge intérieure)", () => {
    const c = card({ x: 80, y: 280, w: 500, h: 200 });
    expect(verticalBudgetPx(b, ctx([b]), c)).toBe(280 + 200 - 10 - 300 - 25);
  });
});

describe("maxFitPt — jusqu'où la police peut monter", () => {
  it("plusieurs lignes : facteur √(budget / hauteur des lignes HTML)", () => {
    const b = block({ rect: { x: 0, y: 0, w: 600, h: 100 } }, { fontSizePx: 20, lineHeight: 25 });
    // 4 lignes de 25 px = 100 px ; budget 400 → f = 2 → 10 pt × 2
    expect(maxFitPt(b, 5, 400, false)).toBe(20);
    // budget plus petit que le texte : jamais sous la taille naturelle
    expect(maxFitPt(b, 5, 50, false)).toBe(10);
  });

  it("une ligne : limité par la largeur estimée du texte et par la hauteur", () => {
    const b = block({ text: "Court", rect: { x: 0, y: 0, w: 600, h: 25 } }, { fontSizePx: 20, lineHeight: 25 });
    // texte ≈ 5 × 0,72 em × 20 px = 72 px ; boîte 600 px → largeur large ; hauteur 50/25 = 2
    expect(maxFitPt(b, 600 / 144, 50, true)).toBe(20);
  });
});

describe("addBlockToSlide — options passées à pptxgenjs", () => {
  it("bloc aligné à gauche hors carte", () => {
    expect(place(block())).toMatchSnapshot();
  });

  it("bloc centré : la marge de largeur se répartit des deux côtés", () => {
    expect(place(block({}, { textAlign: "center" }))).toMatchSnapshot();
  });

  it("bloc aligné à droite : la marge part vers la gauche", () => {
    expect(place(block({}, { textAlign: "right" }))).toMatchSnapshot();
  });

  it("bloc dans une carte : la boîte s'arrête au bord intérieur de la carte", () => {
    const b = block({ rect: { x: 120, y: 320, w: 400, h: 100 } });
    const c = card({ x: 100, y: 300, w: 440, h: 300 });
    expect(place(b, ctx([b], [c]))).toMatchSnapshot();
  });

  it("carte trop étroite : repli sur la boîte HTML", () => {
    // Bloc de 30 px dans une carte de 34 px : avec 10 px de marge de chaque côté,
    // la boîte bornée ferait 14 px, moins de la moitié du bloc → repli.
    const b = block({ text: "OK", rect: { x: 120, y: 320, w: 30, h: 100 } });
    const c = card({ x: 118, y: 318, w: 34, h: 104 });
    const out = place(b, ctx([b], [c]));
    expect(out.options.x).toBeCloseTo(120 / 144, 3);
    expect(out.options.w).toBeCloseTo(30 / 144, 3);
    expect(out).toMatchSnapshot();
  });

  it("petite police montée vers 15 pt quand il y a la place", () => {
    const b = block({ rect: { x: 100, y: 300, w: 600, h: 60 } }, { fontSizePx: 24, lineHeight: 30 });
    const out = place(b);
    expect(out.options.fontSize).toBe(15);
    expect(out).toMatchSnapshot();
  });

  it("petite police gardée quand le bloc suivant est trop près", () => {
    const b = block({ rect: { x: 100, y: 300, w: 600, h: 60 } }, { fontSizePx: 24, lineHeight: 30 });
    const dessous = block({ rect: { x: 100, y: 375, w: 600, h: 60 } });
    const out = place(b, ctx([b, dessous]));
    expect(out.options.fontSize).toBeLessThan(15);
    expect(out).toMatchSnapshot();
  });

  it("bloc multi-lignes collé au bord droit : police réduite, jamais sous 80 %", () => {
    const b = block({ rect: { x: 480, y: 300, w: 600, h: 100 } });
    const out = place(b);
    expect(out.options.fontSize).toBeGreaterThanOrEqual(20 * 0.8);
    expect(out.options.fontSize).toBeLessThan(20);
    expect(out).toMatchSnapshot();
  });

  it("une seule ligne : wrap:false", () => {
    const b = block({ text: "LE CONSTAT", rect: { x: 100, y: 300, w: 300, h: 50 } }, { lineHeight: 50 });
    const out = place(b);
    expect(out.options.wrap).toBe(false);
    expect(out).toMatchSnapshot();
  });

  it("runs avec surligneur et majuscules : chemin multi-runs", () => {
    const b = block(
      {
        text: "Un mot surligné",
        runs: [
          { text: "Un mot ", bold: false, italic: false, color: "1A1A1A" },
          { text: "surligné", bold: true, italic: false, color: "FB3D80", highlight: "FFE561" },
        ] as BlockRender["runs"],
      },
      { textTransform: "uppercase" },
    );
    expect(place(b)).toMatchSnapshot();
  });

  it("titre sans police : police de titre de la charte ; couleur illisible : couleur de la charte", () => {
    const b = block({ kind: "title" }, { fontFamily: "", color: "" });
    const { calls, slide } = fakeSlide();
    addBlockToSlide(slide, b, { font_title: "Libre Baskerville", font_body: "IBM Plex Sans", color_text: "#91014b" }, ctx([b]));
    expect(calls[0].options).toMatchSnapshot();
  });

  it("texte d'un panneau de lecture photo : largeur brute, sans marge", () => {
    const panneau = { closest: (sel: string) => (sel.includes("data-photo-reading-panel") ? {} : null) } as unknown as Element;
    const b = block({ el: panneau });
    const out = place(b);
    expect(out.options.w).toBeCloseTo(600 / 144, 3);
  });
});
