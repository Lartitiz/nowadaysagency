import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findClippedIds,
  hasClippedElement,
  inspectSlide,
} from "@/lib/carousel-quality";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const inside = { left: 100, top: 100, right: 900, bottom: 400 };
const outside = { left: 100, top: 1200, right: 900, bottom: 1600 };
const fullBleed = { left: -60, top: -60, right: 1140, bottom: 1410 };

function build(html: string, rects: Record<string, any>) {
  document.body.innerHTML = html;
  document.querySelectorAll<HTMLElement>("[data-editor-id]").forEach((el) => {
    const r = { ...(rects[el.dataset.editorId!] || inside) };
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      ...r,
      width: r.right - r.left,
      height: r.bottom - r.top,
    } as DOMRect);
  });
  vi.spyOn(document, "createRange").mockImplementation(() => {
    let node: HTMLElement;
    return {
      selectNodeContents(n: HTMLElement) {
        node = n;
      },
      getBoundingClientRect: () => node.getBoundingClientRect(),
    } as any;
  });
}

describe("shared carousel geometry", () => {
  it("flags a structural shape that leaves the slide", () => {
    build(
      '<div data-editor-id="s" data-pptx-shape="band" style="font-size:40px"></div>',
      { s: outside },
    );
    expect(findClippedIds(document)).toEqual(["s"]);
    expect(inspectSlide(document, 2)).toContainEqual(
      expect.objectContaining({ kind: "overflow", severity: "error", slide: 2 }),
    );
  });
  it("never treats a cropped photo or a full-bleed background as clipped", () => {
    build(
      '<div data-editor-id="bg" data-pptx-shape="background"></div><div data-editor-id="ph" data-editor-photo="true"></div>',
      { bg: fullBleed, ph: fullBleed },
    );
    expect(findClippedIds(document)).toEqual([]);
    expect(hasClippedElement(document)).toBe(false);
  });
  it("reports only the deepest element instead of a parent/child duplicate", () => {
    build(
      '<div data-editor-id="wrap" style="font-size:40px"><p data-editor-id="txt" data-pptx-editable="body" style="font-size:40px">Un texte</p></div>',
      { wrap: outside, txt: outside },
    );
    expect(findClippedIds(document)).toEqual(["txt"]);
  });
  it("gives the editor preview and the quality check the same verdict", () => {
    build('<p data-editor-id="t" style="font-size:40px">Un texte</p>', {
      t: outside,
    });
    expect(hasClippedElement(document)).toBe(
      inspectSlide(document, 0).some((i) => i.kind === "overflow"),
    );
  });
  it("does not exempt overflowing text just because its box spans the canvas", () => {
    build('<p data-editor-id="t" data-pptx-editable="body" style="font-size:40px">Texte</p>', { t: fullBleed });
    expect(findClippedIds(document)).toEqual(["t"]);
  });
  it("does not measure a card container as an extra small text", () => {
    build('<div data-editor-id="card" data-pptx-shape="card" style="font-size:16px"><p data-editor-id="t" data-pptx-editable="body" style="font-size:40px">Texte</p></div>', { card: inside, t: inside });
    expect(inspectSlide(document, 0).some(i => i.elementId === "card" && i.kind === "size")).toBe(false);
  });
  it("ignores pagination and decorative elements that touch the edge", () => {
    build(
      '<span data-editor-id="p" data-slide-page style="font-size:24px">3 / 8</span><span data-editor-id="d" aria-hidden="true" style="font-size:200px">”</span>',
      { p: outside, d: outside },
    );
    expect(findClippedIds(document)).toEqual([]);
  });
});
