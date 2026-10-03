// Vignettes glissables, zoom et plein écran de l'aperçu (03/10/2026).
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  // jsdom n'a pas PointerEvent : sans lui, la position du pointeur est perdue.
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  });
});
afterEach(cleanup);

const raw = { slides: [1, 2, 3].map((n) => ({ slide_number: n, title: `Titre ${n}`, body: "x" })), caption: { body: "L" } };
const visuals = [1, 2, 3].map((n) => ({ slide_number: n, html: `<div><h1 data-slide-text="title">Titre ${n}</h1></div>` }));
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify(r.slides.map((s: any) => s.title))}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}

describe("slide thumbnails", () => {
  it("shows a real miniature per slide and reorders by dragging one", () => {
    render(<Harness />);
    const thumbs = Array.from(document.querySelectorAll<HTMLElement>("[data-thumb]"));
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0].querySelector("iframe")!.getAttribute("srcdoc")).toContain("Titre 1");
    // Vignettes de 100 px côte à côte.
    thumbs.forEach((t, i) => (t.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 90, width: 90, top: 0, bottom: 120, height: 120, x: i * 100, y: 0, toJSON: () => ({}) }) as DOMRect));
    // La 3e glissée avant la 1re.
    fireEvent.pointerDown(thumbs[2], { clientX: 245, pointerId: 1 });
    fireEvent.pointerMove(thumbs[2], { clientX: 120, pointerId: 1 });
    fireEvent.pointerMove(thumbs[2], { clientX: 10, pointerId: 1 });
    fireEvent.pointerUp(thumbs[2], { clientX: 10, pointerId: 1 });
    expect(JSON.parse(screen.getByTestId("saved").textContent!)).toEqual(["Titre 3", "Titre 1", "Titre 2"]);
    // La 1re (« Titre 3 ») glissée tout au bout.
    const again = Array.from(document.querySelectorAll<HTMLElement>("[data-thumb]"));
    again.forEach((t, i) => (t.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 90, width: 90, top: 0, bottom: 120, height: 120, x: i * 100, y: 0, toJSON: () => ({}) }) as DOMRect));
    fireEvent.pointerDown(again[0], { clientX: 40, pointerId: 1 });
    fireEvent.pointerMove(again[0], { clientX: 400, pointerId: 1 });
    fireEvent.pointerUp(again[0], { clientX: 400, pointerId: 1 });
    expect(JSON.parse(screen.getByTestId("saved").textContent!)).toEqual(["Titre 1", "Titre 2", "Titre 3"]);
  });
  it("a simple click still opens the slide", () => {
    render(<Harness />);
    const thumbs = Array.from(document.querySelectorAll<HTMLElement>("[data-thumb]"));
    fireEvent.pointerDown(thumbs[1], { clientX: 150, pointerId: 1 });
    fireEvent.pointerUp(thumbs[1], { clientX: 150, pointerId: 1 });
    fireEvent.click(thumbs[1]);
    expect(thumbs[1].getAttribute("aria-pressed")).toBe("true");
  });
});

describe("preview zoom and full screen", () => {
  it("zooms the preview and opens it full screen", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Zoomer l’aperçu"));
    expect(screen.getByText("150 %")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Ouvrir l’aperçu en grand"));
    expect(screen.getByLabelText("Quitter le plein écran")).toBeTruthy();
  });
});
