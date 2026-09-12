import { afterEach, describe, expect, it, vi } from "vitest";
import { contrastRatio, inspectSlide } from "@/lib/carousel-quality";
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
function fixture(
  css = "",
  bounds = {
    left: 80,
    top: 100,
    right: 800,
    bottom: 250,
    width: 720,
    height: 150,
  },
) {
  document.body.innerHTML = `<div style="background-color:rgb(255,255,255)"><p data-editor-id="t" data-pptx-editable="body" style="font-size:48px;color:rgb(0,0,0);${css}">Un texte</p></div>`;
  const el = document.querySelector("p")!;
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(bounds as DOMRect);
  vi.spyOn(document, "createRange").mockReturnValue({
    selectNodeContents() {},
    getBoundingClientRect: () => bounds,
  } as any);
  const original = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((e) => {
    const actual = original(e);
    return new Proxy(actual, {
      get: (target, key) => {
        if (
          key === "backgroundImage" &&
          e.getAttribute("style")?.includes("linear-gradient")
        )
          return "linear-gradient(red, blue)";
        if (key === "backgroundColor")
          return target.backgroundColor || "rgba(0, 0, 0, 0)";
        if (
          ["opacity", "filter", "mixBlendMode", "backgroundImage"].includes(
            String(key),
          )
        )
          return (
            (target as any)[key] ||
            (
              {
                opacity: "1",
                filter: "none",
                mixBlendMode: "normal",
                backgroundImage: "none",
              } as any
            )[key]
          );
        return (target as any)[key];
      },
    });
  });
  return el;
}
describe("carousel quality checks", () => {
  it("uses exact WCAG luminance ratios", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBe(21);
    expect(contrastRatio([100, 100, 100], [100, 100, 100])).toBe(1);
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeLessThan(4.5);
  });
  it("accepts readable text inside the canvas", () => {
    fixture();
    expect(inspectSlide(document, 0)).toEqual([]);
  });
  it("flags clipped text on its exact slide and element", () => {
    fixture("", {
      left: 80,
      top: 1300,
      right: 800,
      bottom: 1450,
      width: 720,
      height: 150,
    });
    expect(inspectSlide(document, 3)).toContainEqual(
      expect.objectContaining({
        slide: 3,
        elementId: "t",
        kind: "overflow",
        severity: "error",
      }),
    );
  });
  it("blocks unreadable font sizes and measured low contrast", () => {
    fixture("font-size:20px;color:rgb(220,220,220)");
    const issues = inspectSlide(document, 0);
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "size",
        severity: "error",
        fix: { "font-size": "38px" },
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "contrast",
        severity: "error",
        fix: { color: "#000000" },
      }),
    );
  });
  it("only advises on an essential text that is readable but tight", () => {
    fixture("font-size:34px");
    expect(inspectSlide(document, 0)).toContainEqual(
      expect.objectContaining({ kind: "size", severity: "warning" }),
    );
  });
  it("accepts secondary microcopy at 30 px and blocks below it", () => {
    const el = fixture("font-size:30px");
    el.dataset.pptxEditable = "caption";
    expect(inspectSlide(document, 0).some((i) => i.kind === "size")).toBe(false);
    el.style.fontSize = "22px";
    expect(inspectSlide(document, 0)).toContainEqual(
      expect.objectContaining({
        kind: "size",
        severity: "error",
        fix: { "font-size": "30px" },
      }),
    );
  });

  it("warns about safe margins without blocking publication", () => {
    fixture("", {
      left: 20,
      top: 100,
      right: 800,
      bottom: 250,
      width: 780,
      height: 150,
    });
    expect(inspectSlide(document, 0)).toContainEqual(
      expect.objectContaining({ kind: "margin", severity: "warning" }),
    );
  });
  it("does not claim to measure contrast on gradients", () => {
    fixture(
      "background-image:linear-gradient(red,blue);color:rgb(240,240,240)",
    );
    const issues = inspectSlide(document, 0);
    expect(issues.some((i) => i.kind === "manual")).toBe(true);
    expect(issues.some((i) => i.kind === "contrast")).toBe(false);
  });
  it("does not treat intentionally cropped photos as clipped text", () => {
    const el = fixture("", {
      left: -100,
      top: -100,
      right: 1200,
      bottom: 1500,
      width: 1300,
      height: 1600,
    });
    el.setAttribute("data-editor-photo", "true");
    expect(inspectSlide(document, 0)).toEqual([]);
  });
  it("ignores decorative page numbers and hidden text", () => {
    const el = fixture("font-size:14px");
    el.dataset.pptxEditable = "page_number";
    expect(inspectSlide(document, 0)).toEqual([]);
    el.dataset.pptxEditable = "body";
    el.style.display = "none";
    expect(inspectSlide(document, 0)).toEqual([]);
  });
});
