// Colonne de droite simplifiée (03/10/2026) : onglets Élément / Slide / Carrousel,
// calques repliés, une seule liste de polices, styles de bloc tout faits.
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
const raw = { slides: [{ slide_number: 1, title: "Titre", body: "Corps" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "L" } };
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title">Titre</h1><p data-slide-text="body">Corps</p></div>' },
  { slide_number: 2, html: '<div><h1 data-slide-text="title">Suite</h1><p data-slide-text="body">Fin</p></div>' },
];
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify(v)}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}
const tab = (name: string) => screen.getByRole("tab", { name });
const chooseTitle = () => {
  fireEvent.click(screen.getByRole("button", { name: /^Calques/ }));
  fireEvent.click(screen.getByRole("button", { name: /Choisir le calque Titre/ }));
};

describe("simplified settings column", () => {
  it("folds the layers by default and shows the slide tab when nothing is chosen", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /^Calques \(\d+\)/ }).getAttribute("aria-expanded")).toBe("false");
    expect(tab("Slide").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Ajouter un texte" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Appliquer le thème/ })).toBeNull();
    fireEvent.click(tab("Carrousel"));
    expect(screen.getAllByRole("button", { name: /Appliquer le thème/ }).length).toBeGreaterThan(1);
    expect(screen.queryByRole("button", { name: "Ajouter un texte" })).toBeNull();
  });
  it("choosing an element opens the element tab with its settings only", () => {
    render(<Harness />);
    chooseTitle();
    expect(tab("Élément").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Texte sélectionné")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ajouter un texte" })).toBeNull();
    // Gras / italique / dupliquer sont dans la barre de l'élément, plus en double ici.
    expect(screen.queryByRole("button", { name: "Gras" })).toBeNull();
    fireEvent.click(tab("Slide"));
    expect(screen.getByRole("button", { name: "Ajouter un texte" })).toBeTruthy();
    fireEvent.click(tab("Élément"));
    fireEvent.click(screen.getByRole("button", { name: "Centré" }));
    expect(screen.getByTestId("saved").textContent).toContain("text-align: center");
  });
  it("one font list: carousel fonts, classics and Google fonts", () => {
    render(<Harness />);
    chooseTitle();
    fireEvent.click(screen.getByRole("button", { name: "Choisir une police" }));
    const options = screen.getAllByRole("option").map((o) => o.textContent || "");
    expect(options.some((o) => o.startsWith("Georgia"))).toBe(true);
    expect(options.some((o) => o.startsWith("Playfair Display"))).toBe(true);
    fireEvent.click(screen.getAllByRole("option").find((o) => o.textContent!.startsWith("Georgia"))!);
    expect(screen.getByTestId("saved").textContent).toContain("Georgia");
  });
  it("a ready-made block style applies in one click", () => {
    render(<Harness />);
    chooseTitle();
    fireEvent.click(screen.getByRole("button", { name: "Carte" }));
    const html = screen.getByTestId("saved").textContent!;
    expect(html).toContain("border-radius: 24px");
    expect(html).toMatch(/box-shadow: 0(px)? 8px 24px/);
  });
});
