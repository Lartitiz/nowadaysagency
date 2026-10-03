// Cadre de sélection de l'éditeur de carrousel (03/10/2026) : glisser depuis
// le vide, ou clic long puis glisser, choisit plusieurs éléments.
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { readCarouselDocument } from "@/lib/carousel-editor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const raw = { slides: [{ slide_number: 1, title: "Mon atelier", body: "Texte" }], caption: { body: "L" } };
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title" style="position:absolute;left:80px;top:100px">Mon atelier</h1><p data-slide-text="body" style="position:absolute;left:80px;top:400px">Texte</p></div>' },
];
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} />;
}
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
function setup() {
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
  render(<Harness />);
  const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
  const doc = iframe.contentDocument!;
  doc.body.innerHTML = readCarouselDocument(raw, visuals).slides[0].html;
  fireEvent.load(iframe);
  const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]')!;
  const body = doc.querySelector<HTMLElement>('[data-slide-text="body"]')!;
  title.getBoundingClientRect = () => rect(80, 100, 600, 100);
  body.getBoundingClientRect = () => rect(80, 400, 600, 60);
  return { width, doc, title, body };
}
// jsdom n'a pas PointerEvent : on envoie des MouseEvent du même nom, avec leurs coordonnées.
const ptr = (el: Element, type: string, clientX: number, clientY: number) =>
  act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY })); });
const selectedCount = () => screen.queryByText(/éléments sélectionnés/)?.textContent || "";

describe("selection marquee", () => {
  it("dragging from the empty slide selects every element the box touches", () => {
    const { width, doc } = setup();
    try {
      ptr(doc.body, "pointerdown", 20, 20);
      ptr(doc.body, "pointermove", 300, 300);
      expect(screen.getByTestId("selection-marquee")).toBeTruthy();
      ptr(doc.body, "pointermove", 700, 500);
      ptr(doc.body, "pointerup", 700, 500);
      expect(screen.queryByTestId("selection-marquee")).toBeNull();
      expect(selectedCount()).toMatch(/2 éléments sélectionnés/);
    } finally { width.mockRestore(); }
  });
  it("a small box picks only what it touches; a simple click in the void deselects", () => {
    const { width, doc } = setup();
    try {
      ptr(doc.body, "pointerdown", 20, 20);
      ptr(doc.body, "pointermove", 200, 150);
      ptr(doc.body, "pointerup", 200, 150);
      expect(screen.getAllByRole("button", { pressed: true }).some((b) => /Choisir le calque Mon atelier/.test(b.getAttribute("aria-label") || ""))).toBe(true);
      expect(selectedCount()).toBe("");
      ptr(doc.body, "pointerdown", 900, 900);
      ptr(doc.body, "pointerup", 900, 900);
      expect(screen.queryAllByRole("button", { pressed: true }).some((b) => /Choisir le calque Mon atelier/.test(b.getAttribute("aria-label") || ""))).toBe(false);
    } finally { width.mockRestore(); }
  });
  it("a long press on an element then a drag draws the box instead of moving it", () => {
    vi.useFakeTimers();
    const { width, doc, title } = setup();
    try {
      ptr(title, "pointerdown", 100, 120);
      act(() => { vi.advanceTimersByTime(500); });
      ptr(doc.body, "pointermove", 300, 450);
      ptr(doc.body, "pointerup", 300, 450);
      expect(title.style.left).toBe("80px");
      expect(selectedCount()).toMatch(/2 éléments sélectionnés/);
    } finally { width.mockRestore(); }
  });
});
