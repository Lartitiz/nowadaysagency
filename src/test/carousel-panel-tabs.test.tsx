// Colonne de droite simplifiée (03/10/2026) : onglets Élément / Slide / Carrousel,
// calques repliés, une seule liste de polices, styles de bloc tout faits.
import React, { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
beforeEach(() => window.localStorage.setItem("carousel-editor:onglet", "calques"));  // panneau complet (« Plus d'outils »), chantier D
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
  fireEvent.click(tab("Calques"));
  fireEvent.click(screen.getByRole("button", { name: /Choisir le calque Titre/ }));
};

// Panneau à onglets (26/11/2026, maquette validée par Laetitia) : un seul panneau, un sujet à la fois.
describe("panneau à onglets", () => {
  it("s'ouvre sur « Texte » ; ajouter, mises en page et thèmes ont chacun leur onglet", () => {
    window.localStorage.removeItem("carousel-editor:onglet");
    render(<Harness />);
    expect(tab("Texte").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("slide-texts")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ajouter un texte/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Appliquer le thème/ })).toBeNull();
    // Plus de bouton de mode : il n'y a qu'un panneau.
    expect(screen.queryByRole("button", { name: /Plus d’outils|Mode simple/ })).toBeNull();
    fireEvent.click(tab("Ajouter"));
    expect(screen.getByRole("button", { name: /Ajouter un texte/ })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Ajouter un élément tout fait" }).querySelectorAll("button").length).toBeGreaterThan(5);
    fireEvent.click(tab("Couleurs"));
    expect(screen.getAllByRole("button", { name: /Appliquer le thème/ }).length).toBeGreaterThan(1);
    expect(screen.queryByRole("button", { name: /Ajouter un texte/ })).toBeNull();
    fireEvent.click(tab("Mise en page"));
    expect(screen.getAllByRole("button", { name: /^Mise en page / }).length).toBeGreaterThan(1);
  });
  it("« Calques » : la liste, et dessous les réglages de l'élément choisi ; l'éditeur s'en souvient", () => {
    render(<Harness />);
    chooseTitle();
    expect(tab("Calques").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Calques de la slide")).toBeTruthy();
    expect(screen.getByLabelText("Texte sélectionné")).toBeTruthy();
    expect(screen.getByTestId("panel-advanced")).toBeTruthy();
    // Gras / italique / dupliquer sont dans la barre de l'élément, pas en double ici.
    expect(screen.queryByRole("button", { name: "Gras" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Centre" }));
    expect(screen.getByTestId("saved").textContent).toContain("text-align: center");
    expect(window.localStorage.getItem("carousel-editor:onglet")).toBe("calques");
    fireEvent.click(tab("Texte"));
    expect(window.localStorage.getItem("carousel-editor:onglet")).toBeNull();
    // L'onglet « Texte » montre le même texte choisi, et ses réglages avancés.
    expect(screen.getByLabelText("Texte sélectionné")).toBeTruthy();
    expect(screen.getByTestId("panel-advanced")).toBeTruthy();
    expect(screen.queryByLabelText("Calques de la slide")).toBeNull();
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
