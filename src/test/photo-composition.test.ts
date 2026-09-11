import { describe, it, expect } from "vitest";
import { PHOTO_FORMATS, cleanRecipe, makePhotoRecipe, photoGeometry, normaliseCrop, confirmedPhotoCopy } from "@/lib/photo-composition";

describe("photo composition fidelity", () => {
  for (const format of Object.keys(PHOTO_FORMATS) as (keyof typeof PHOTO_FORMATS)[]) {
    for (const [width, height] of [[2400, 300], [300, 2400], [1200, 1200]]) {
      it(`keeps all source pixels within ${format} for ${width}×${height}, including reserved text`, () => {
        const recipe = makePhotoRecipe(format); recipe.direction.textPosition = "bottom"; recipe.direction.padding = 0.2;
        const g = photoGeometry(width, height, recipe);
        expect(g.source).toEqual({ x: 0, y: 0, width, height });
        expect(g.dest.width / g.dest.height).toBeCloseTo(width / height);
        expect(g.dest.x).toBeGreaterThanOrEqual(0); expect(g.dest.y).toBeGreaterThanOrEqual(0);
        expect(g.dest.x + g.dest.width).toBeLessThanOrEqual(recipe.width);
        expect(g.dest.y + g.dest.height).toBeLessThanOrEqual(g.textArea!.y);
      });
    }
  }
  it("never enlarges an explicit detail and rejects an undersized detail", () => {
    const r = makePhotoRecipe("story"); r.crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
    const g = photoGeometry(600, 800, r);
    expect(g.source).toEqual({ x: 60, y: 160, width: 300, height: 400 });
    expect(g.dest.width).toBe(300); expect(g.dest.height).toBe(400);
    expect(photoGeometry(300, 400, r).detailTooSmall).toBe(true);
  });
  it("bounds corrupt stored recipes and crops", () => {
    expect(normaliseCrop({ x: 2, y: -4, width: 3, height: NaN })).toEqual({ x: 0.9, y: 0, width: 0.09999999999999998, height: 0.1 });
    const r = cleanRecipe({ ...makePhotoRecipe("banner"), width: 99999, height: -2, exposure: Infinity, text: 1, direction: null } as never);
    expect([r.width, r.height]).toEqual([2400, 320]); expect(r.text).toBe(""); expect(r.direction.background).toBe("#ffffff");
  });
  it("includes only confirmed statements, including an absent price/material", () => {
    const copy = confirmedPhotoCopy("Sac Alba", "Deux anses\nFormat compact", "Une nouveauté à découvrir", "Écris-moi pour en parler");
    expect(copy.caption).toBe("Sac Alba\n\nDeux anses\nFormat compact\n\nUne nouveauté à découvrir\n\nÉcris-moi pour en parler");
    expect(copy.caption).not.toMatch(/cuir|€|stock|offert/);
  });
});
