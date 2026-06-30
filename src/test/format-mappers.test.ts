import { describe, it, expect } from "vitest";
import { deriveCanalFromState, mapFormatToContentType } from "@/features/creer/format-mappers";

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
