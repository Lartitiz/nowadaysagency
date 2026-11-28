import { describe, expect, it } from "vitest";
import { keepToolbarOffText } from "@/lib/toolbar-avoid";
import { placeToolbar } from "@/lib/carousel-editor";

// Slide affichée à 300 × 375, photo plein cadre choisie, barre de 260 × 40.
const canvas = { width: 300, height: 375 };
const bar = { width: 260, height: 40 };
const photo = { left: 0, top: 0, width: 300, height: 375 };
const textBottom = { left: 23, top: 290, width: 250, height: 60 };
const textTop = { left: 23, top: 30, width: 250, height: 60 };

describe("barre d'une photo plein cadre (Loom du 28/11/2026)", () => {
  it("un arrondi d'un demi-pixel la posait en bas, sur le texte : elle remonte", () => {
    const rounded = { ...photo, top: -0.4 };
    const base = placeToolbar(rounded, bar, canvas);
    expect(base.top).toBe(canvas.height - bar.height - 4); // le défaut d'avant
    const fixed = keepToolbarOffText(base, rounded, bar, canvas, [textBottom]);
    expect(fixed.top).toBe(4);
  });
  it("texte en haut : la barre reste (ou va) en bas", () => {
    const base = placeToolbar(photo, bar, canvas);
    expect(keepToolbarOffText(base, photo, bar, canvas, [textTop]).top).toBe(canvas.height - bar.height - 4);
  });
  it("aucun texte caché : place d'origine gardée", () => {
    const base = placeToolbar(photo, bar, canvas);
    expect(keepToolbarOffText(base, photo, bar, canvas, [{ left: 23, top: 180, width: 250, height: 40 }])).toEqual(base);
  });
  it("barre hors de la slide ou à côté de l'élément : rien ne change", () => {
    const outside = placeToolbar(photo, bar, canvas, 8, 4, { above: 0, below: 100 });
    expect(outside.top).toBeGreaterThanOrEqual(canvas.height);
    expect(keepToolbarOffText(outside, photo, bar, canvas, [textBottom])).toEqual(outside);
    const small = { left: 40, top: 200, width: 100, height: 80 };
    const beside = placeToolbar(small, bar, canvas);
    expect(keepToolbarOffText(beside, small, bar, canvas, [textTop, textBottom])).toEqual(beside);
  });
  it("texte en haut ET en bas : le bord qui en cache le moins", () => {
    const base = { left: 4, top: canvas.height - bar.height - 4 };
    const bigTop = { left: 0, top: 0, width: 300, height: 120 };
    expect(keepToolbarOffText(base, photo, bar, canvas, [bigTop, { left: 23, top: 340, width: 60, height: 20 }]).top).toBe(base.top);
  });
});
