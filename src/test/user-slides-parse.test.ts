import { describe, it, expect } from "vitest";
import { parseSlidesFromText, composeOverlayText } from "@/lib/user-slides-parse";

describe("parseSlidesFromText — découpage sur lignes vides", () => {
  it("découpe sur une ligne vide simple", () => {
    const out = parseSlidesFromText("Première slide.\n\nDeuxième slide.");
    expect(out.map((s) => s.body)).toEqual(["Première slide.", "Deuxième slide."]);
  });

  it("tolère plusieurs lignes vides et des lignes d'espaces", () => {
    const out = parseSlidesFromText("Un\n\n\n   \nDeux\n \nTrois");
    expect(out.map((s) => s.body)).toEqual(["Un", "Deux", "Trois"]);
  });

  it("garde les retours à la ligne INTERNES à un bloc", () => {
    const out = parseSlidesFromText("Ligne 1\nLigne 2\n\nAutre slide");
    expect(out[0].body).toBe("Ligne 1\nLigne 2");
    expect(out).toHaveLength(2);
  });

  it("gère les fins de ligne Windows (\\r\\n)", () => {
    const out = parseSlidesFromText("Un\r\n\r\nDeux");
    expect(out.map((s) => s.body)).toEqual(["Un", "Deux"]);
  });

  it("texte vide ou blanc → aucune slide", () => {
    expect(parseSlidesFromText("")).toEqual([]);
    expect(parseSlidesFromText("  \n \n")).toEqual([]);
  });
});

describe("parseSlidesFromText — marqueurs de slides", () => {
  it("retire « Slide N : » en début de bloc (marqueur seul sur sa ligne)", () => {
    const out = parseSlidesFromText("Slide 1 :\nMon accroche\n\nSlide 2 :\nLa suite");
    expect(out.map((s) => s.body)).toEqual(["Mon accroche", "La suite"]);
  });

  it("retire « Slide N : » inline (texte sur la même ligne)", () => {
    const out = parseSlidesFromText("Slide 1 : Mon accroche\n\nslide 2. La suite");
    expect(out.map((s) => s.body)).toEqual(["Mon accroche", "La suite"]);
  });

  it("une ligne « Slide N » découpe MÊME sans ligne vide avant", () => {
    const out = parseSlidesFromText("Slide 1 : Un\nSlide 2 : Deux\nSlide 3 : Trois");
    expect(out.map((s) => s.body)).toEqual(["Un", "Deux", "Trois"]);
  });

  it("retire les marqueurs numériques « 3. », « 3/ », « 3) » en début de bloc", () => {
    const out = parseSlidesFromText("1. Un\n\n2/ Deux\n\n3) Trois");
    expect(out.map((s) => s.body)).toEqual(["Un", "Deux", "Trois"]);
  });

  it("ne traite PAS une année comme un marqueur (« 2026. »)", () => {
    const out = parseSlidesFromText("2026. C'était hier.\n\nSuite");
    expect(out[0].body).toBe("2026. C'était hier.");
  });

  it("un marqueur numérique au MILIEU d'un bloc n'est pas retiré (liste numérotée)", () => {
    const out = parseSlidesFromText("Mes 3 astuces :\n1. Respirer\n2. Écrire\n\nFin");
    expect(out[0].body).toBe("Mes 3 astuces :\n1. Respirer\n2. Écrire");
  });
});

describe("parseSlidesFromText — texte gardé verbatim", () => {
  it("chiffres, ponctuation, émojis et guillemets restent intacts", () => {
    const body = "−40 % en 3 mois… « incroyable », non ?! 🌸 #vrai";
    const out = parseSlidesFromText(`${body}\n\nAutre`);
    expect(out[0].body).toBe(body);
  });

  it("ne touche pas aux espaces internes ni à la casse", () => {
    const body = "PAS de réécriture   (même les doubles espaces restent)";
    expect(parseSlidesFromText(body)[0].body).toBe(body);
  });

  it("le titre proposé est toujours vide (jamais deviné)", () => {
    const out = parseSlidesFromText("Un titre possible\nEt du texte\n\nDeux");
    expect(out[0].title).toBe("");
  });
});

describe("composeOverlayText — titre préfixé proprement", () => {
  it("sans titre → texte tel quel", () => {
    expect(composeOverlayText("", "Mon texte")).toBe("Mon texte");
  });

  it("titre sans ponctuation → séparateur tiret cadratin", () => {
    expect(composeOverlayText("Avant", "le salon était vide.")).toBe("Avant — le salon était vide.");
  });

  it("titre déjà ponctué → simple espace", () => {
    expect(composeOverlayText("Avant :", "le salon était vide.")).toBe("Avant : le salon était vide.");
  });

  it("titre seul (texte vide) → titre tel quel", () => {
    expect(composeOverlayText("Juste un mot", "")).toBe("Juste un mot");
  });
});
