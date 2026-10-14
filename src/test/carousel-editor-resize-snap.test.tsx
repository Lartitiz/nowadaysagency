// Lot E2 (14/10/2026) : on fige le comportement de l'éditeur avant son découpage.
// Poignées de redimensionnement (élargir, rétrécir, allonger, coin) et
// magnétisme (repères roses quand un bloc s'aligne sur la slide ou un autre bloc).
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { readCarouselDocument } from "@/lib/carousel-editor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(cleanup);

const raw = { slides: [{ slide_number: 1, title: "Mon atelier", body: "Texte" }], caption: { body: "L" } };
const visuals = [
  {
    slide_number: 1,
    html:
      '<div style="position:relative;width:1080px;height:1350px">' +
      '<h1 data-slide-text="title" style="position:absolute;left:80px;top:100px;font-size:60px">Mon atelier</h1>' +
      '<p data-slide-text="body" style="position:absolute;left:80px;top:400px">Texte</p>' +
      '<div data-pptx-shape="1" style="position:absolute;left:700px;top:900px;width:200px;height:120px;background-color:#ffd6e8"></div>' +
      "</div>",
  },
];
function Harness({ locked = false }: { locked?: boolean }) {
  const start = locked ? { ...raw, slides: [{ ...raw.slides[0], editor_locked: true }] } : raw;
  const [r, setR] = useState<any>(start), [v, setV] = useState(visuals);
  return (
    <>
      <output data-testid="saved">{JSON.stringify(v)}</output>
      <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} />
    </>
  );
}
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
// La boîte d'un élément suit sa position écrite (left / top), comme dans un vrai navigateur.
const follow = (el: HTMLElement, width: number, height: number) => {
  el.getBoundingClientRect = () =>
    rect(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0, parseFloat(el.style.width) || width, parseFloat(el.style.height) || height);
};
function setup(locked = false) {
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
  render(<Harness locked={locked} />);
  const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
  const doc = iframe.contentDocument!;
  const start = locked ? { ...raw, slides: [{ ...raw.slides[0], editor_locked: true }] } : raw;
  doc.body.innerHTML = readCarouselDocument(start, visuals).slides[0].html;
  const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]')!;
  const body = doc.querySelector<HTMLElement>('[data-slide-text="body"]')!;
  const shape = doc.querySelector<HTMLElement>("[data-pptx-shape]")!;
  follow(title, 600, 100);
  follow(body, 600, 60);
  follow(shape, 200, 120);
  fireEvent.load(iframe);
  return { width, doc, title, body, shape };
}
// jsdom n'a pas PointerEvent : on envoie des MouseEvent du même nom, avec leurs coordonnées.
const ptr = (el: EventTarget, type: string, clientX: number, clientY: number, extra: MouseEventInit = {}) =>
  act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, ...extra })); });
const savedEl = (selector: string) => {
  const v = JSON.parse(screen.getByTestId("saved").textContent!);
  return new DOMParser().parseFromString(v[0].html, "text/html").querySelector<HTMLElement>(selector)!;
};
const choose = (el: HTMLElement, x: number, y: number) => {
  ptr(el, "pointerdown", x, y);
  ptr(el, "pointerup", x, y);
};
const handle = (name: string) => document.querySelector<HTMLElement>(`[data-handle="${name}"]`);
const handles = () => Array.from(document.querySelectorAll<HTMLElement>("[data-handle]")).map((h) => h.dataset.handle).sort();
// Poignée tirée de dx / dy pixels écran (aperçu à 540 px : 1 px écran = 2 px slide).
const pull = (name: string, dx: number, dy: number) => {
  ptr(handle(name)!, "pointerdown", 500, 500);
  ptr(window, "pointermove", 500 + dx, 500 + dy);
  ptr(window, "pointerup", 500 + dx, 500 + dy);
};

describe("magnétisme et repères d'alignement", () => {
  it("un bloc glissé près du centre de la slide s'y aligne et le repère rose apparaît", () => {
    const { width, title } = setup();
    try {
      ptr(title, "pointerdown", 100, 120);
      // 163 px à droite : centre du titre à 543, à 3 px du centre de la slide (540).
      ptr(title, "pointermove", 263, 120);
      const guide = screen.getByTestId("guide-x");
      expect(guide.style.left).toBe("270px"); // 540 px de slide × échelle 0,5
      expect(screen.queryByTestId("guide-y")).toBeNull();
      expect(title.style.left).toBe("240px");
      ptr(title, "pointerup", 263, 120);
      expect(screen.queryByTestId("guide-x")).toBeNull();
      expect(savedEl('[data-slide-text="title"]').style.left).toBe("240px");
      expect(savedEl('[data-slide-text="title"]').style.top).toBe("100px");
    } finally { width.mockRestore(); }
  });
  it("s'aligne aussi sur le bord d'un autre bloc (repère horizontal)", () => {
    const { width, title } = setup();
    try {
      ptr(title, "pointerdown", 100, 120);
      // 296 px plus bas : haut du titre à 396, à 4 px du haut du corps (400).
      ptr(title, "pointermove", 100, 416);
      expect(screen.getByTestId("guide-y").style.top).toBe("200px");
      expect(title.style.top).toBe("400px");
      ptr(title, "pointerup", 100, 416);
      expect(savedEl('[data-slide-text="title"]').style.top).toBe("400px");
    } finally { width.mockRestore(); }
  });
  it("⌘/Ctrl maintenu : placement libre, sans repère ni correction", () => {
    const { width, title } = setup();
    try {
      ptr(title, "pointerdown", 100, 120);
      ptr(title, "pointermove", 263, 120, { metaKey: true });
      expect(screen.queryByTestId("guide-x")).toBeNull();
      ptr(title, "pointerup", 263, 120, { metaKey: true });
      expect(savedEl('[data-slide-text="title"]').style.left).toBe("243px");
    } finally { width.mockRestore(); }
  });
  it("au-delà de 8 px, pas d'aimant : la position reste celle du pointeur", () => {
    const { width, title } = setup();
    try {
      ptr(title, "pointerdown", 100, 120);
      // Centre à 555 : 15 px du centre de la slide, hors de portée.
      ptr(title, "pointermove", 275, 120);
      expect(screen.queryByTestId("guide-x")).toBeNull();
      ptr(title, "pointerup", 275, 120);
      expect(savedEl('[data-slide-text="title"]').style.left).toBe("255px");
    } finally { width.mockRestore(); }
  });
  it("un petit geste (moins de 5 px) choisit l'élément sans le déplacer", () => {
    const { width, title } = setup();
    try {
      ptr(title, "pointerdown", 100, 120);
      ptr(title, "pointermove", 102, 121);
      ptr(title, "pointerup", 102, 121);
      expect(screen.getByTestId("selection-box")).toBeTruthy();
      expect(savedEl('[data-slide-text="title"]').style.left).toBe("80px");
    } finally { width.mockRestore(); }
  });
});

describe("poignées de redimensionnement", () => {
  it("un texte a trois poignées (gauche, droite, coin), une forme en a quatre", () => {
    const { width, title, shape } = setup();
    try {
      choose(title, 100, 120);
      expect(handles()).toEqual(["e", "se", "w"]);
      choose(shape, 750, 950);
      expect(handles()).toEqual(["e", "s", "se", "w"]);
    } finally { width.mockRestore(); }
  });
  it("poignée droite : élargit le texte sans toucher à sa taille ni à sa position", () => {
    const { width, title } = setup();
    try {
      choose(title, 100, 120);
      pull("e", 100, 0);
      const t = savedEl('[data-slide-text="title"]');
      expect(t.style.width).toBe("800px");
      expect(t.style.maxWidth).toBe("none");
      expect(t.style.left).toBe("80px");
      expect(t.style.fontSize).toBe("60px");
    } finally { width.mockRestore(); }
  });
  it("poignée gauche : rétrécit par la gauche, le bord droit reste en place", () => {
    const { width, title } = setup();
    try {
      choose(title, 100, 120);
      pull("w", 50, 0);
      const t = savedEl('[data-slide-text="title"]');
      expect(t.style.width).toBe("500px");
      expect(t.style.left).toBe("180px");
      expect(t.style.position).toBe("absolute");
    } finally { width.mockRestore(); }
  });
  it("largeur minimale de 60 px, même en tirant très loin", () => {
    const { width, title } = setup();
    try {
      choose(title, 100, 120);
      pull("e", -1000, 0);
      expect(savedEl('[data-slide-text="title"]').style.width).toBe("60px");
    } finally { width.mockRestore(); }
  });
  it("coin d'un texte : agrandit la largeur ET la taille du texte, proportionnellement", () => {
    const { width, title } = setup();
    try {
      choose(title, 100, 120);
      pull("se", 150, 40);
      const t = savedEl('[data-slide-text="title"]');
      expect(t.style.width).toBe("900px");
      expect(t.style.fontSize).toBe("90px"); // 60 × 900 / 600
      expect(t.style.height).toBe("");
    } finally { width.mockRestore(); }
  });
  it("poignée du bas d'une forme : allonge sa hauteur seulement", () => {
    const { width, shape } = setup();
    try {
      choose(shape, 750, 950);
      pull("s", 0, 40);
      const s = savedEl("[data-pptx-shape]");
      expect(s.style.height).toBe("200px");
      expect(s.style.width).toBe("200px");
    } finally { width.mockRestore(); }
  });
  it("coin d'une forme : largeur et hauteur, sans police", () => {
    const { width, shape } = setup();
    try {
      choose(shape, 750, 950);
      pull("se", 50, 50);
      const s = savedEl("[data-pptx-shape]");
      expect(s.style.width).toBe("300px");
      expect(s.style.height).toBe("220px");
      expect(s.style.fontSize).toBe("");
    } finally { width.mockRestore(); }
  });
  it("un redimensionnement s'annule en une fois", () => {
    const { width, title } = setup();
    try {
      choose(title, 100, 120);
      pull("e", 100, 0);
      expect(savedEl('[data-slide-text="title"]').style.width).toBe("800px");
      fireEvent.click(screen.getByRole("button", { name: "Annuler la modification" }));
      expect(savedEl('[data-slide-text="title"]').style.width).toBe("");
    } finally { width.mockRestore(); }
  });
  it("un texte tourné garde sa largeur quand on touche sa poignée (corrigé après le lot E2)", () => {
    // La largeur de départ est celle du bloc (offsetWidth), pas sa boîte
    // englobante à l'écran, plus grande ou plus petite quand il est tourné.
    // Bloc de 600 × 100 tourné de 45° : boîte englobante de 495 × 495.
    const { width, title } = setup();
    try {
      title.style.transform = "rotate(45deg)";
      title.getBoundingClientRect = () => rect(80, 100, 495, 495);
      Object.defineProperty(title, "offsetWidth", { configurable: true, value: 600 });
      Object.defineProperty(title, "offsetHeight", { configurable: true, value: 100 });
      choose(title, 100, 120);
      pull("e", 1, 0);
      expect(savedEl('[data-slide-text="title"]').style.width).toBe("602px");
      pull("se", 50, 0);
      // Le coin agrandit le texte en proportion de la vraie largeur : 60 × 700 / 600.
      expect(savedEl('[data-slide-text="title"]').style.width).toBe("700px");
      expect(savedEl('[data-slide-text="title"]').style.fontSize).toBe("70px");
    } finally { width.mockRestore(); }
  });
  it("slide verrouillée : aucune poignée, rien ne bouge", () => {
    const { width, title } = setup(true);
    try {
      const before = screen.getByTestId("saved").textContent;
      choose(title, 100, 120);
      expect(handles()).toEqual([]);
      ptr(title, "pointerdown", 100, 120);
      ptr(title, "pointermove", 300, 300);
      ptr(title, "pointerup", 300, 300);
      expect(screen.getByTestId("saved").textContent).toBe(before);
    } finally { width.mockRestore(); }
  });
});
