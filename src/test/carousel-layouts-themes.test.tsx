// Galerie de mises en page, thèmes du carrousel, polices Google (03/10/2026).
import { describe, expect, it } from "vitest";
import {
  applyTheme,
  carouselThemes,
  composeLayout,
  ensureFontLink,
  getEditorElements,
  LAYOUTS,
  makeSlide,
  renumberDocument,
  slidePhotoSource,
  type CarouselDocument,
} from "@/lib/carousel-editor";

const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("layout gallery", () => {
  it("recomposes every layout with the same title, text and photo", () => {
    const photo = "https://example.com/p.jpg";
    for (const { variant, photo: withPhoto } of LAYOUTS) {
      const s = composeLayout({ title: "Mon titre", body: "Mon texte", photo_index: 2 }, variant, withPhoto ? photo : "");
      const els = getEditorElements(s.html);
      expect(els.find((e) => e.field === "title")!.text, variant).toBe("Mon titre");
      expect(els.find((e) => e.field === "body")!.text, variant).toBe("Mon texte");
      if (withPhoto) expect(slidePhotoSource(s.html), variant).toBe(photo);
      expect(s.data.layout_variant).toBe(variant);
    }
  });
  it("keeps the text readable on a dark background", () => {
    const s = composeLayout({ title: "T", body: "B" }, "texte", "", { fontImports: "", titleFont: "Georgia", bodyFont: "Arial", titleColor: "#1a1a1a", bodyColor: "#222222", background: "#1a1815", titleSize: "72px", bodySize: "40px", titleWeight: "500", align: "left" });
    const title = dom(s.html).querySelector<HTMLElement>('[data-slide-text="title"]')!;
    expect(title.style.color).toMatch(/255, 255, 255|#ffffff/i);
  });
});

describe("carousel themes", () => {
  const doc = (): CarouselDocument =>
    renumberDocument({ caption: {}, slides: [makeSlide({ title: "A", body: "a" }, "text_only"), makeSlide({ title: "B", body: "b", photo_index: 1 }, "photo_full", "https://example.com/p.jpg")] });
  it("restyles text slides and leaves photo slides alone", () => {
    const dark = carouselThemes("#91014b").find((t) => t.id === "sombre")!;
    const out = applyTheme(doc(), dark);
    expect(out.changed).toBe(1);
    expect(out.skipped).toBe(1);
    const d = dom(out.document.slides[0].html);
    expect((d.body.firstElementChild as HTMLElement).style.backgroundColor).toMatch(/22, 22, 22|#161616/);
    expect(d.querySelector<HTMLElement>('[data-slide-text="body"]')!.style.color).toMatch(/245, 245, 245|#f5f5f5/);
  });
  it("offers four themes built on the brand colour", () => {
    expect(carouselThemes("#fb3d80").map((t) => t.id)).toEqual(["charte", "contraste", "sombre", "doux"]);
  });
});

describe("Google fonts", () => {
  it("adds the font stylesheet to the slide once, for preview and export", () => {
    const s = makeSlide({ title: "T" }, "text_only");
    const once = ensureFontLink(s, "Playfair Display");
    expect(dom(once.html).querySelectorAll('link[href*="Playfair+Display"]')).toHaveLength(1);
    expect(ensureFontLink(once, "Playfair Display").html).toBe(once.html);
    expect(ensureFontLink(s, "Comic Sans").html).toBe(s.html);
  });
});
