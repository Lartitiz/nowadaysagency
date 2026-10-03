// Copier-coller entre slides et « appliquer à toutes les slides » (03/10/2026).
import { describe, expect, it } from "vitest";
import {
  applyToAllSlides,
  getEditorElements,
  makeSlide,
  pasteElement,
  patchElement,
  renumberDocument,
  type CarouselDocument,
} from "@/lib/carousel-editor";

const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");
const doc3 = (): CarouselDocument =>
  renumberDocument({
    caption: {},
    slides: [1, 2, 3].map((n) => makeSlide({ title: `Titre ${n}`, body: `Corps ${n}` }, "text_only")),
  });

describe("copy / paste", () => {
  it("pastes a copied text onto another slide at the same place, unlinked from the source", () => {
    const d = doc3();
    const [a, b] = d.slides;
    const title = getEditorElements(a.html).find((e) => e.field === "title")!;
    const clip = { html: dom(a.html).querySelector(`[data-editor-id="${title.id}"]`)!.outerHTML, rect: { left: 80, top: 160, width: 920, height: 160 } };
    const out = pasteElement(b, clip, false);
    expect(out.id).toBeTruthy();
    const pasted = dom(out.slide.html).querySelector<HTMLElement>(`[data-editor-id="${out.id}"]`)!;
    expect(pasted.textContent).toBe("Titre 1");
    expect(pasted.style.left).toBe("80px");
    expect(pasted.hasAttribute("data-slide-text")).toBe(false);
    // Le titre de la slide 2 reste son propre titre.
    const edited = patchElement(out.slide, out.id!, { text: "Copie" });
    expect(edited.data.title).toBe("Titre 2");
  });
  it("offsets a paste on the same slide so the copy is visible", () => {
    const [a] = doc3().slides;
    const body = getEditorElements(a.html).find((e) => e.field === "body")!;
    const clip = { html: dom(a.html).querySelector(`[data-editor-id="${body.id}"]`)!.outerHTML, rect: { left: 80, top: 300, width: 900, height: 60 } };
    const out = pasteElement(a, clip, true);
    const pasted = dom(out.slide.html).querySelector<HTMLElement>(`[data-editor-id="${out.id}"]`)!;
    expect(pasted.style.left).toBe("120px");
    expect(pasted.style.top).toBe("340px");
  });
});

describe("apply to all slides", () => {
  it("reports the title style on the other slides' titles only", () => {
    const d = doc3();
    const first = d.slides[0];
    const title = getEditorElements(first.html).find((e) => e.field === "title")!;
    const styled = { ...d, slides: [patchElement(first, title.id, { styles: { color: "#ff0000", "font-size": "90px" } }), ...d.slides.slice(1)] };
    const out = applyToAllSlides(styled, first.id, title.id, { style: true });
    expect(out.changed).toBe(2);
    out.document.slides.slice(1).forEach((s) => {
      const t = getEditorElements(s.html).find((e) => e.field === "title")!;
      expect(t.style.color).toBe("rgb(255, 0, 0)");
      expect(t.style["font-size"]).toBe("90px");
      const body = getEditorElements(s.html).find((e) => e.field === "body")!;
      expect(body.style.color).not.toBe("rgb(255, 0, 0)");
    });
  });
  it("reports the position, skips locked slides, and says when nothing matches", () => {
    const d = doc3();
    d.slides[2] = { ...d.slides[2], locked: true };
    const first = d.slides[0];
    const body = getEditorElements(first.html).find((e) => e.field === "body")!;
    const moved = { ...d, slides: [patchElement(first, body.id, { styles: { position: "absolute", left: "200px", top: "900px" } }), ...d.slides.slice(1)] };
    const out = applyToAllSlides(moved, first.id, body.id, { position: true });
    expect(out.changed).toBe(1);
    const b2 = getEditorElements(out.document.slides[1].html).find((e) => e.field === "body")!;
    expect(b2.style.top).toBe("900px");
    expect(out.document.slides[2]).toBe(d.slides[2]);
    const page = getEditorElements(first.html).find((e) => !e.field && e.kind === "text")!;
    expect(applyToAllSlides(d, first.id, page.id, { style: true }).changed).toBe(0);
  });
});
