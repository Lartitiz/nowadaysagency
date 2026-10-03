// Raccourcis clavier de l'éditeur de carrousel (03/10/2026).
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { readCarouselDocument } from "@/lib/carousel-editor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(cleanup);

const raw = { slides: [{ slide_number: 1, title: "Mon atelier", body: "Texte" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "L" } };
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title" style="position:absolute;left:80px;top:100px">Mon atelier</h1><p data-slide-text="body" style="position:absolute;left:80px;top:400px">Texte</p></div>' },
  { slide_number: 2, html: '<div><h1 data-slide-text="title">Suite</h1><p data-slide-text="body">Fin</p></div>' },
];
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify({ r, v })}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);
const slideDoc = () => new DOMParser().parseFromString(saved().v[0].html, "text/html");
function setup() {
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
  render(<Harness />);
  const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
  const doc = iframe.contentDocument!;
  doc.body.innerHTML = readCarouselDocument(raw, visuals).slides[0].html;
  fireEvent.load(iframe);
  const key = (key: string, extra: Record<string, boolean> = {}) => fireEvent.keyDown(doc, { key, ...extra });
  const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]')!;
  return { width, doc, key, title };
}

describe("editor keyboard shortcuts", () => {
  it("⌘D duplicates, ⌘Z undoes it, ⌘⇧Z redoes it", () => {
    const { width, key, title } = setup();
    try {
      fireEvent.pointerDown(title); fireEvent.pointerUp(title);
      key("d", { metaKey: true });
      expect(slideDoc().body.textContent!.match(/Mon atelier/g)).toHaveLength(2);
      key("z", { metaKey: true });
      expect(slideDoc().body.textContent!.match(/Mon atelier/g)).toHaveLength(1);
      key("z", { metaKey: true, shiftKey: true });
      expect(slideDoc().body.textContent!.match(/Mon atelier/g)).toHaveLength(2);
    } finally { width.mockRestore(); }
  });
  it("⌘X cuts and ⌘V pastes back", () => {
    const { width, key, title } = setup();
    try {
      fireEvent.pointerDown(title); fireEvent.pointerUp(title);
      key("x", { ctrlKey: true });
      expect(slideDoc().body.textContent).not.toContain("Mon atelier");
      key("v", { ctrlKey: true });
      expect(slideDoc().body.textContent).toContain("Mon atelier");
    } finally { width.mockRestore(); }
  });
  it("⌘A selects every element, Tab moves to the next one", () => {
    const { width, key } = setup();
    try {
      key("a", { metaKey: true });
      expect(screen.getByText(/2 éléments sélectionnés/)).toBeTruthy();
      key("Escape");
      key("Tab");
      const pressed = screen.getAllByRole("button", { pressed: true }).map((b) => b.getAttribute("aria-label") || "");
      expect(pressed.some((l) => /Choisir le calque/.test(l))).toBe(true);
    } finally { width.mockRestore(); }
  });
  it("⌘B makes the chosen text bold, ⌘] brings it forward", () => {
    const { width, key, title } = setup();
    try {
      fireEvent.pointerDown(title); fireEvent.pointerUp(title);
      key("b", { metaKey: true });
      expect(slideDoc().querySelector<HTMLElement>('[data-slide-text="title"]')!.style.fontWeight).toBe("700");
      key("]", { metaKey: true });
      const z = slideDoc().querySelector<HTMLElement>('[data-slide-text="title"]')!.style.zIndex;
      expect(Number(z)).toBeGreaterThan(Number(slideDoc().querySelector<HTMLElement>('[data-slide-text="body"]')!.style.zIndex || 0));
    } finally { width.mockRestore(); }
  });
  it("Enter starts writing in the chosen text", () => {
    const { width, key, title } = setup();
    try {
      fireEvent.pointerDown(title); fireEvent.pointerUp(title);
      key("Enter");
      expect(title.getAttribute("contenteditable")).toBeTruthy();
    } finally { width.mockRestore(); }
  });
  it("lists the shortcuts", () => {
    const { width } = setup();
    try {
      fireEvent.click(screen.getByLabelText("Voir les raccourcis clavier"));
      expect(screen.getByText("Raccourcis clavier")).toBeTruthy();
      expect(screen.getByText("Dupliquer l’élément")).toBeTruthy();
    } finally { width.mockRestore(); }
  });
});
