// Barre d'outils flottante et couleur d'un seul mot (03/10/2026).
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import {
  documentColors,
  getEditorElements,
  makeSlide,
  readCarouselDocument,
  sanitizeRichText,
  setElementHtml,
} from "@/lib/carousel-editor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(cleanup);
const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("rich text of a single word", () => {
  it("keeps only colour, weight, style and underline", () => {
    const out = sanitizeRichText('Un <span style="color:#ff0000;font-size:90px" onclick="x()">mot</span> <script>x</script><a href="https://x">lien</a><div>ligne</div>');
    expect(out).toContain('<span style="color: rgb(255, 0, 0);">mot</span>');
    expect(out).not.toMatch(/font-size|onclick|script|href|<a|<div/);
    expect(out).toContain("lien");
    expect(out).toContain("<br>ligne");
  });
  it("saves a coloured word and keeps the source field as plain text", () => {
    const slide = makeSlide({ title: "Une autre façon", body: "Corps" }, "text_only");
    const title = getEditorElements(slide.html).find((e) => e.field === "title")!;
    const next = setElementHtml(slide, title.id, 'Une <span style="color:#91014b;font-weight:700">autre</span> façon');
    expect(next.data.title).toBe("Une autre façon");
    const el = dom(next.html).querySelector(`[data-editor-id="${title.id}"]`)!;
    expect(el.innerHTML).toContain("font-weight: 700");
    expect(el.textContent).toBe("Une autre façon");
  });
  it("offers the carousel's own colours without near duplicates", () => {
    const colors = documentColors([{ html: '<div style="color:#1a1a1a"><p style="color:#161616">a</p><p style="color:#91014B;background-color:#FFF4F8">b</p></div>' }]);
    expect(colors).toContain("#91014b");
    expect(colors.filter((c) => ["#1a1a1a", "#161616"].includes(c))).toHaveLength(1);
  });
});

const raw = { slides: [{ slide_number: 1, title: "Mon atelier", body: "Texte" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "L" } };
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px;color:#123456"><h1 data-slide-text="title" style="color:#91014b">Mon atelier</h1><p data-slide-text="body">Texte</p></div>' },
  { slide_number: 2, html: '<div><h1 data-slide-text="title">Suite</h1><p data-slide-text="body">Fin</p></div>' },
];
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify({ r, v })}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}
describe("floating toolbar", () => {
  it("colours only the selected word while writing on the slide", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
    try {
      render(<Harness />);
      const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
      const doc = iframe.contentDocument!;
      doc.body.innerHTML = readCarouselDocument(raw, visuals).slides[0].html;
      fireEvent.load(iframe);
      const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]')!;
      // jsdom ne mesure rien : on donne au titre sa boîte affichée.
      const box = () => ({ left: 100, top: 200, width: 600, height: 120, right: 700, bottom: 320, x: 100, y: 200, toJSON: () => ({}) }) as DOMRect;
      title.getBoundingClientRect = box;
      // Le contrôle de débordement mesure aussi le texte par une plage (absent de jsdom).
      const RangeCtor = (doc.defaultView as unknown as { Range: typeof Range }).Range;
      RangeCtor.prototype.getBoundingClientRect = box;
      fireEvent.dblClick(title);
      // Choisit « atelier » dans le titre.
      const text = title.firstChild!;
      const range = doc.createRange();
      range.setStart(text, 4);
      range.setEnd(text, 11);
      const sel = doc.defaultView!.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      const toolbar = screen.getByRole("toolbar", { name: /Barre d’outils/ });
      const swatch = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button")).find((b) => /Couleur du texte #1a1a1a/.test(b.getAttribute("aria-label") || ""))!;
      fireEvent.click(swatch);
      fireEvent.keyDown(doc, { key: "Escape" });
      const saved = JSON.parse(screen.getByTestId("saved").textContent!);
      const html = dom(saved.v[0].html).querySelector('[data-slide-text="title"]')!.innerHTML;
      expect(html).toMatch(/Mon <span style="color: rgb\(26, 26, 26\);">atelier<\/span>/);
      expect(saved.r.slides[0].title).toBe("Mon atelier");
    } finally {
      width.mockRestore();
    }
  });
});
