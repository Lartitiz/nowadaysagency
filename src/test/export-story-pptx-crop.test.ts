import { describe, expect, it } from "vitest";
import { computeStoryPhotoCrop } from "@/lib/export-story-pptx";

describe("computeStoryPhotoCrop", () => {
  it("centre un paysage au ratio 9:16 sans déformer la photo", () => {
    const crop = computeStoryPhotoCrop(1920, 1080);
    expect(crop.x).toBeCloseTo(656.25, 2);
    expect(crop.y).toBeCloseTo(0, 2);
    expect(crop.width / crop.height).toBeCloseTo(9 / 16, 5);
  });

  it("reproduit le point focal et le zoom choisis dans l’éditeur", () => {
    const left = computeStoryPhotoCrop(1920, 1080, 0, 50, 1);
    const rightZoomed = computeStoryPhotoCrop(1920, 1080, 100, 50, 1.5);
    expect(left.x).toBe(0);
    expect(rightZoomed.x).toBeGreaterThan(left.x);
    expect(rightZoomed.width).toBeLessThan(left.width);
    expect(rightZoomed.width / rightZoomed.height).toBeCloseTo(9 / 16, 5);
  });
});
