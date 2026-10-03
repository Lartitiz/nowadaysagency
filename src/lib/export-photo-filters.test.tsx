import { describe, expect, it } from "vitest";
import { applyPhotoFilter, parsePhotoFilter } from "./export-photo-filters";

describe("photo filters baked for export", () => {
  it("reads the editor filter, grayscale included", () => {
    expect(parsePhotoFilter("brightness(1.2) contrast(0.8) saturate(1.5)")).toEqual({ brightness: 1.2, contrast: 0.8, saturate: 1.5 });
    expect(parsePhotoFilter("blur(28px) saturate(0)")?.saturate).toBe(0);
    expect(parsePhotoFilter("blur(28px)")).toBeNull();
  });
  it("matches CSS: brightness multiplies, saturate(0) gives grey", () => {
    const px = new Uint8ClampedArray([100, 50, 200, 255]);
    applyPhotoFilter(px, { brightness: 1.5, contrast: 1, saturate: 1 });
    expect(Array.from(px.slice(0, 3))).toEqual([150, 75, 255]);
    const grey = new Uint8ClampedArray([200, 40, 40, 255]);
    applyPhotoFilter(grey, { brightness: 1, contrast: 1, saturate: 0 });
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
    expect(grey[3]).toBe(255);
  });
});
