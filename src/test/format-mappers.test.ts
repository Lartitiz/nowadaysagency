import { describe, it, expect } from "vitest";
import { deriveCanalFromState, mapFormatToContentType, renumberSlides } from "@/features/creer/format-mappers";

describe("deriveCanalFromState", () => {
  it("null ou état vide -> null", () => {
    expect(deriveCanalFromState(null)).toBeNull();
    expect(deriveCanalFromState({})).toBeNull();
  });
  it("linkedin (format ou carrousel LinkedIn)", () => {
    expect(deriveCanalFromState({ selectedFormat: "linkedin" })).toBe("linkedin");
    expect(deriveCanalFromState({ isLinkedInCarousel: true })).toBe("linkedin");
  });
  it("pinterest par préfixe", () => {
    expect(deriveCanalFromState({ selectedFormat: "pinterest_visual" })).toBe("pinterest");
  });
  it("newsletter", () => {
    expect(deriveCanalFromState({ selectedFormat: "newsletter" })).toBe("newsletter");
  });
  it("instagram par défaut si un format est présent", () => {
    expect(deriveCanalFromState({ selectedFormat: "carousel" })).toBe("instagram");
  });
});

describe("mapFormatToContentType", () => {
  it.each([
    ["newsletter", "newsletter"],
    ["story", "story"],
    ["reel", "reel"],
    ["linkedin", "post_linkedin"],
    ["pinterest", "pinterest"],
    ["pinterest_visual", "pinterest"],
    ["pinterest_photo", "pinterest"],
    ["carousel", "post_instagram"],
    [null, "post_instagram"],
  ])("%s -> %s", (fmt, expected) => {
    expect(mapFormatToContentType(fmt as any)).toBe(expected);
  });
});

describe("renumberSlides", () => {
  it("renumérote 1..N dans l'ordre du tableau (slide_number fractionnaire vu en live : « SLIDE 4.5 / 8 »)", () => {
    const slides = [
      { slide_number: 1, body: "a" },
      { slide_number: 2, body: "b" },
      { slide_number: 5, body: "c" },
      { slide_number: 4.5, body: "d" },
    ];
    expect(renumberSlides(slides).map((s) => s.slide_number)).toEqual([1, 2, 3, 4]);
  });

  it("l'ordre du tableau fait foi : ne trie pas, préserve le contenu", () => {
    const slides = [
      { slide_number: 3, body: "premier" },
      { slide_number: 1, body: "second" },
    ];
    const out = renumberSlides(slides);
    expect(out).toEqual([
      { slide_number: 1, body: "premier" },
      { slide_number: 2, body: "second" },
    ]);
  });

  it("complète les slides sans slide_number et ne mute pas l'entrée", () => {
    const slides: Array<{ slide_number?: number; body: string }> = [{ body: "x" }, { body: "y" }];
    const out = renumberSlides(slides);
    expect(out.map((s) => s.slide_number)).toEqual([1, 2]);
    expect(slides[0].slide_number).toBeUndefined();
  });

  it("tableau vide -> tableau vide", () => {
    expect(renumberSlides([])).toEqual([]);
  });
});
