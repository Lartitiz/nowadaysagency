import { describe, expect, it } from "vitest";
import { logoBackdropColor } from "@/lib/export-logo";

describe("export logo backing", () => {
  it("gives a dark transparent logo a white backing even on a matching slide", () => {
    expect(logoBackdropColor(new Uint8ClampedArray([145,1,75,255, 0,0,0,0]))).toBe("#ffffff");
  });
  it("gives a white transparent logo a black backing", () => {
    expect(logoBackdropColor(new Uint8ClampedArray([255,255,255,255, 0,0,0,0]))).toBe("#000000");
  });
  it("preserves an opaque logo which already carries its own background", () => {
    expect(logoBackdropColor(new Uint8ClampedArray([145,1,75,255, 255,255,255,255]))).toBeNull();
  });
  it("does not turn a fully transparent image into a visible empty tile", () => {
    expect(logoBackdropColor(new Uint8ClampedArray([0,0,0,0]))).toBeNull();
  });
});
