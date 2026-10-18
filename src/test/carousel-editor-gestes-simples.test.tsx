// Chantier AB (18/10/2026) : les gestes de base en mode simple. « Mise en page » et
// « Thème du carrousel » ouvrent les galeries de « Plus d'outils » ; « Ajouter une
// icône » pose un dessin aux couleurs de la charte, qui part dans l'export ;
// « Centrer sur la slide » met l'élément au centre.
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { getEditorElements, readCarouselDocument } from "@/lib/carousel-editor";
import { addIcon, centerOnSlide, iconColor, isIcon, setIconColor } from "@/components/creer/CarouselEditorParts/editor-icons";
import { EDITOR_ICONS } from "@/components/creer/CarouselEditorParts/IconPicker";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const raw = { slides: [{ slide_number: 1, title: "Mon atelier", body: "Texte" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "Ma légende" } };
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px;background-color:#fff4f8;color:#123456"><h1 data-slide-text="title" style="color:#91014b">Mon atelier</h1><p data-slide-text="body">Texte</p></div>' },
  { slide_number: 2, html: '<div style="position:relative;width:1080px;height:1350px;background-color:#fff4f8"><h1 data-slide-text="title">Suite</h1><p data-slide-text="body">Fin</p></div>' },
];
function Harness({ brandColors }: { brandColors?: string[] }) {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify({ r, v })}</output>
    <CarouselEditor result={r} visualSlides={v} brandColors={brandColors} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);
const panel = () => screen.getByLabelText("Réglages simples");
const undo = () => fireEvent.click(screen.getByLabelText("Annuler la modification"));

describe("gestes de base en mode simple (chantier AB)", () => {
  it("« Mise en page » ouvre la galerie de la slide ; un choix, une étape d'Annuler", () => {
    render(<Harness />);
    const before = saved().v[0].html, other = saved().v[1].html;
    fireEvent.click(within(panel()).getByRole("button", { name: /^Mise en page/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mise en page Titre centré" }));
    const after = saved();
    expect(after.v[0].html).not.toBe(before);
    expect(after.v[0].html).toContain("Mon atelier");
    expect(after.v[1].html).toBe(other);
    undo();
    expect(saved().v[0].html).toBe(before);
  });

  it("« Thème du carrousel » change toutes les slides en une étape d'Annuler", () => {
    render(<Harness />);
    const before = saved().v.map((s: { html: string }) => s.html);
    fireEvent.click(within(panel()).getByRole("button", { name: /^Thème du carrousel/ }));
    const themes = screen.getAllByRole("button", { name: /^Appliquer le thème/ });
    expect(themes.map((b) => b.getAttribute("aria-label"))).toEqual(expect.arrayContaining(["Appliquer le thème Sombre"]));
    fireEvent.click(screen.getByRole("button", { name: "Appliquer le thème Sombre" }));
    const after = saved().v.map((s: { html: string }) => s.html);
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    undo();
    expect(saved().v.map((s: { html: string }) => s.html)).toEqual(before);
  });

  it("« Ajouter une icône » : recherche en français, icône posée au centre en couleur de marque, couleur changeable", () => {
    render(<Harness brandColors={["#91014b"]} />);
    fireEvent.click(within(panel()).getByRole("button", { name: /Ajouter une icône/ }));
    fireEvent.change(screen.getByLabelText("Chercher une icône"), { target: { value: "coeur" } });
    const icons = within(screen.getByRole("group", { name: "Icônes" })).getAllByRole("button");
    expect(icons.map((b) => b.getAttribute("aria-label"))).toEqual(["Icône Cœur"]);
    fireEvent.click(icons[0]);
    const html = readCarouselDocument(saved().r, saved().v).slides[0].html;
    const box = new DOMParser().parseFromString(html, "text/html").querySelector<HTMLElement>('[data-editor-icon="Cœur"]')!;
    expect(box.getAttribute("data-editor-shape")).toBe("dessin");
    expect(box.getAttribute("style")).toMatch(/left: ?440px/);
    const svg = box.querySelector("svg")!;
    expect(svg.getAttribute("stroke")).toBe("#91014b");
    expect(svg.outerHTML).not.toContain("currentColor");
    expect(screen.getByText("Icône choisie")).toBeTruthy();
    const swatch = within(panel()).getAllByRole("button", { name: /^Couleur de l’icône #/ }).find((b) => !/91014b/i.test(b.getAttribute("aria-label")!))!;
    fireEvent.click(swatch);
    const hex = swatch.getAttribute("aria-label")!.split(" ").pop()!;
    expect(readCarouselDocument(saved().r, saved().v).slides[0].html).toContain(`stroke="${hex}"`);
  });

  it("une quarantaine d'icônes, chacune avec un nom unique", () => {
    expect(EDITOR_ICONS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(EDITOR_ICONS.map((i) => i.name)).size).toBe(EDITOR_ICONS.length);
  });
});

describe("icônes et centrage (fonctions)", () => {
  const slide = { id: "s1", data: {}, html: visuals[0].html, locked: false } as never;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3"></path></svg>';
  it("l'icône est un calque « Dessin », retirable et recolorable ; rien sur une slide verrouillée", () => {
    const out = addIcon(slide, "Cœur", svg, "#91014b");
    expect(out.id).toBeTruthy();
    expect(isIcon(out.slide, out.id)).toBe(true);
    expect(getEditorElements(out.slide.html).find((e) => e.id === out.id)?.kind).toBe("shape");
    expect(iconColor(out.slide, out.id!)).toBe("#91014b");
    expect(iconColor(setIconColor(out.slide, out.id!, "#123456"), out.id!)).toBe("#123456");
    expect(addIcon({ ...(slide as object), locked: true } as never, "Cœur", svg, "#000000").id).toBeNull();
  });
  it("« Centrer sur la slide » calcule le déplacement depuis la boîte affichée", () => {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;left:100px;top:50px";
    el.getBoundingClientRect = () => ({ left: 100, top: 50, width: 280, height: 150 }) as DOMRect;
    document.body.append(el);
    expect(centerOnSlide(el, window)).toEqual({ position: "absolute", left: "400px", top: "600px" });
    el.remove();
  });
});

describe("« Centrer sur la slide » dans le menu « … »", () => {
  it("déplace l'élément choisi au centre de la slide", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
    try {
      render(<Harness />);
      const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
      const doc = iframe.contentDocument!;
      doc.body.innerHTML = readCarouselDocument(raw, visuals).slides[0].html;
      fireEvent.load(iframe);
      const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]')!;
      title.getBoundingClientRect = () => ({ left: 100, top: 200, width: 600, height: 120, right: 700, bottom: 320, x: 100, y: 200, toJSON: () => ({}) }) as DOMRect;
      fireEvent.pointerDown(title, { button: 0, clientX: 150, clientY: 250 });
      fireEvent.pointerUp(title, { button: 0, clientX: 150, clientY: 250 });
      fireEvent.click(title, { clientX: 150, clientY: 250 });
      fireEvent.click(screen.getByLabelText("Plus d’actions sur l’élément"));
      fireEvent.click(screen.getByRole("button", { name: /Centrer sur la slide/ }));
      const html = readCarouselDocument(saved().r, saved().v).slides[0].html;
      const h1 = new DOMParser().parseFromString(html, "text/html").querySelector<HTMLElement>('[data-slide-text="title"]')!;
      expect(h1.style.left).toBe("140px");
      expect(h1.style.top).toBe("415px");
    } finally {
      width.mockRestore();
    }
  });
});
