// Recadrage sur la slide et problèmes signalés sur la slide (03/10/2026).
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { readCarouselDocument } from "@/lib/carousel-editor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
vi.mock("@/lib/carousel-quality", async (orig) => {
  const real = await orig<typeof import("@/lib/carousel-quality")>();
  return {
    ...real,
    // jsdom ne mesure rien : on simule un titre jugé trop petit.
    inspectSlide: (doc: Document) => {
      const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]');
      return title ? [{ slide: 0, elementId: title.dataset.editorId!, kind: "size", severity: "error", message: "Texte essentiel trop petit", fix: { "font-size": "38px" } }] : [];
    },
  };
});
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(cleanup);

const raw = { slides: [{ slide_number: 1, title: "Titre", body: "Corps" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "L" } };
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px"><div data-pptx-photo="1" style="position:absolute;left:0;top:0;width:1080px;height:600px;background-image:url(https://example.com/p.jpg)"></div><h1 data-slide-text="title" style="font-size:20px">Titre</h1><p data-slide-text="body">Corps</p></div>' },
  { slide_number: 2, html: '<div><h1 data-slide-text="title">Suite</h1></div>' },
];
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify(v)}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}
function setup() {
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
  render(<Harness />);
  const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
  const doc = iframe.contentDocument!;
  doc.body.innerHTML = readCarouselDocument(raw, visuals).slides[0].html;
  const box = { left: 80, top: 100, width: 400, height: 40, right: 480, bottom: 140, x: 80, y: 100, toJSON: () => ({}) } as DOMRect;
  doc.querySelectorAll<HTMLElement>("[data-editor-id]").forEach((el) => (el.getBoundingClientRect = () => box));
  fireEvent.load(iframe);
  return { width, doc };
}

describe("issues shown on the slide", () => {
  it("puts a marker on the element and fixes it in one click", () => {
    const { width } = setup();
    try {
      const marker = screen.getByTestId("slide-issue");
      expect(marker.getAttribute("title")).toBe("Texte essentiel trop petit");
      fireEvent.click(marker);
      fireEvent.click(screen.getByRole("button", { name: /Corriger/ }));
      const html = JSON.parse(screen.getByTestId("saved").textContent!)[0].html;
      expect(new DOMParser().parseFromString(html, "text/html").querySelector<HTMLElement>('[data-slide-text="title"]')!.style.fontSize).toBe("38px");
    } finally {
      width.mockRestore();
    }
  });
});

describe("crop on the slide", () => {
  it("double-clicking the photo opens the crop mode, Escape closes it", () => {
    const { width, doc } = setup();
    try {
      fireEvent.dblClick(doc.querySelector('[data-pptx-photo]')!);
      expect(screen.getByText(/Recadrage : glisse la photo/)).toBeTruthy();
      fireEvent.keyDown(doc, { key: "Escape" });
      expect(screen.queryByText(/Recadrage : glisse la photo/)).toBeNull();
    } finally {
      width.mockRestore();
    }
  });
});
