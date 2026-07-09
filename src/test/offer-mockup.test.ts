import { describe, expect, it } from "vitest";
import {
  fitCover,
  lightenHex,
  pickDefaultSupport,
  resolveBackgroundColor,
} from "@/lib/offer-mockup";

describe("pickDefaultSupport", () => {
  it("portrait → tablette", () => {
    expect(pickDefaultSupport(800, 1200)).toBe("tablette");
  });
  it("paysage → ordinateur", () => {
    expect(pickDefaultSupport(1920, 1080)).toBe("ordinateur");
  });
  it("carré (≤ 5 % de marge) → tablette", () => {
    expect(pickDefaultSupport(1000, 1000)).toBe("tablette");
    expect(pickDefaultSupport(1040, 1000)).toBe("tablette");
  });
  it("dimensions manquantes → tablette", () => {
    expect(pickDefaultSupport(0, 0)).toBe("tablette");
  });
});

describe("fitCover", () => {
  it("source plus large que la cible : crop horizontal centré", () => {
    const { sx, sy, sw, sh } = fitCover(2000, 1000, 500, 500);
    expect(sh).toBe(1000);
    expect(sw).toBe(1000);
    expect(sx).toBe(500);
    expect(sy).toBe(0);
  });
  it("source plus haute que la cible : crop vertical centré", () => {
    const { sx, sy, sw, sh } = fitCover(1000, 2000, 500, 500);
    expect(sw).toBe(1000);
    expect(sh).toBe(1000);
    expect(sx).toBe(0);
    expect(sy).toBe(500);
  });
  it("mêmes ratios : aucun crop", () => {
    const { sx, sy, sw, sh } = fitCover(1000, 1414, 500, 707);
    expect(sx).toBeCloseTo(0);
    expect(sy).toBeCloseTo(0);
    expect(sw).toBeCloseTo(1000);
    expect(sh).toBeCloseTo(1414);
  });
  it("dimensions dégénérées : ne jette pas", () => {
    expect(() => fitCover(0, 0, 100, 100)).not.toThrow();
  });
});

describe("lightenHex", () => {
  it("éclaircit vers le blanc", () => {
    expect(lightenHex("#000000", 1)).toBe("#ffffff");
    expect(lightenHex("#000000", 0.5)).toBe("#808080");
  });
  it("accepte le hex sans dièse", () => {
    expect(lightenHex("D85A30", 0)).toBe("#d85a30");
  });
  it("hex invalide → null", () => {
    expect(lightenHex("terracotta", 0.5)).toBeNull();
    expect(lightenHex("#abc", 0.5)).toBeNull();
  });
});

describe("resolveBackgroundColor", () => {
  it("color_background prioritaire", () => {
    expect(resolveBackgroundColor({ color_background: "#EAD9C6", color_primary: "#D85A30" })).toBe(
      "#EAD9C6",
    );
  });
  it("normalise le hex sans dièse", () => {
    expect(resolveBackgroundColor({ color_background: "EAD9C6" })).toBe("#EAD9C6");
  });
  it("sinon primaire fortement éclaircie", () => {
    const out = resolveBackgroundColor({ color_primary: "#D85A30" });
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    expect(out).not.toBe("#D85A30");
  });
  it("charte vide → beige neutre", () => {
    expect(resolveBackgroundColor(null)).toBe("#F1EFE8");
    expect(resolveBackgroundColor({ color_background: "pas-un-hex" })).toBe("#F1EFE8");
  });
});

describe("screenRatioFor", () => {
  it("le support épouse le ratio de la capture dans ses bornes", async () => {
    const { screenRatioFor } = await import("@/lib/offer-mockup");
    // Couverture 800×1120 (0,714) : AUCUN crop sur tablette/livre/pages
    expect(screenRatioFor("tablette", 800, 1120)).toBeCloseTo(800 / 1120);
    expect(screenRatioFor("livre", 800, 1120)).toBeCloseTo(800 / 1120);
    expect(screenRatioFor("pages", 800, 1120)).toBeCloseTo(800 / 1120);
  });
  it("clamp : une capture paysage sur téléphone reste un téléphone", async () => {
    const { screenRatioFor } = await import("@/lib/offer-mockup");
    expect(screenRatioFor("telephone", 1920, 1080)).toBe(0.52);
    expect(screenRatioFor("ordinateur", 800, 1120)).toBe(1.45);
  });
  it("dimensions manquantes : défaut portrait raisonnable", async () => {
    const { screenRatioFor } = await import("@/lib/offer-mockup");
    expect(screenRatioFor("tablette", 0, 0)).toBeCloseTo(0.72);
  });
});
