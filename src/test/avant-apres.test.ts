import { describe, expect, it } from "vitest";
import {
  labelTextColor,
  pickDefaultLayout,
  resolveAfterLabelColor,
} from "@/lib/avant-apres";

describe("pickDefaultLayout", () => {
  it("deux photos paysage → haut/bas (photos d'intérieur entières)", () => {
    expect(
      pickDefaultLayout({ width: 4000, height: 3000 }, { width: 1920, height: 1080 }),
    ).toBe("haut_bas");
  });

  it("au moins une photo portrait → côte à côte", () => {
    expect(
      pickDefaultLayout({ width: 3000, height: 4000 }, { width: 1920, height: 1080 }),
    ).toBe("cote_a_cote");
    expect(
      pickDefaultLayout({ width: 3000, height: 3000 }, { width: 3000, height: 3000 }),
    ).toBe("cote_a_cote");
  });

  it("dimensions inconnues (0) → côte à côte sans crash", () => {
    expect(pickDefaultLayout({ width: 0, height: 0 }, { width: 0, height: 0 })).toBe(
      "cote_a_cote",
    );
  });
});

describe("labelTextColor", () => {
  it("fond sombre → texte blanc", () => {
    expect(labelTextColor("#1C1C20")).toBe("#FFFFFF");
    expect(labelTextColor("#0F6E56")).toBe("#FFFFFF");
  });

  it("fond clair → texte charbon", () => {
    expect(labelTextColor("#F6F4F0")).toBe("#1C1C20");
    expect(labelTextColor("#FAC775")).toBe("#1C1C20");
  });

  it("hex invalide → blanc par défaut (étiquette avant, fond sombre)", () => {
    expect(labelTextColor("tomate")).toBe("#FFFFFF");
  });
});

describe("resolveAfterLabelColor", () => {
  it("reprend la couleur primaire de la charte, avec ou sans #", () => {
    expect(resolveAfterLabelColor({ color_primary: "#FB3D80" })).toBe("#FB3D80");
    expect(resolveAfterLabelColor({ color_primary: "FB3D80" })).toBe("#FB3D80");
  });

  it("charte absente ou couleur invalide → charbon neutre", () => {
    expect(resolveAfterLabelColor(null)).toBe("#1C1C20");
    expect(resolveAfterLabelColor({ color_primary: "rose" })).toBe("#1C1C20");
    expect(resolveAfterLabelColor({ color_primary: null })).toBe("#1C1C20");
  });
});
