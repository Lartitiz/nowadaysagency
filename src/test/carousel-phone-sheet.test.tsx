// Volet téléphone (26/11/2026) : sur téléphone, ouvrir un onglet du panneau met la slide en
// petit en haut de l'écran et cache les barres du bas ; « Terminé » rend sa taille à la slide.
// Sur ordinateur, rien ne change.
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { setCarouselSheet, useCarouselSheet } from "@/lib/carousel-editor-shown";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
const width = window.innerWidth;
afterEach(() => {
  cleanup();
  act(() => setCarouselSheet(false));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.localStorage.clear();
});
const raw = { slides: [{ slide_number: 1, title: "Titre", body: "Corps" }], caption: { body: "L" } };
const visuals = [{ slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title">Titre</h1><p data-slide-text="body">Corps</p></div>' }];
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  const sheet = useCarouselSheet();
  return (<><output data-testid="sheet">{String(sheet)}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}
const onPhone = () => Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
const sheet = () => screen.getByTestId("sheet").textContent;

describe("volet de réglages sur téléphone", () => {
  it("un onglet ouvre le volet, « Terminé » le referme", () => {
    onPhone();
    render(<Harness />);
    expect(sheet()).toBe("false");
    expect(screen.queryByRole("button", { name: "Terminé" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Couleurs" }));
    expect(sheet()).toBe("true");
    // Les points et « Toutes » sous la slide laissent la place aux réglages.
    expect(screen.queryByRole("button", { name: /Toutes/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Terminé" }));
    expect(sheet()).toBe("false");
    expect(screen.queryByRole("button", { name: "Terminé" })).toBeNull();
  });
  it("toucher une case de texte ouvre le volet", () => {
    onPhone();
    render(<Harness />);
    fireEvent.focus(screen.getByTestId("slide-texts").querySelector("textarea, input")!);
    expect(sheet()).toBe("true");
  });
  it("quitter l'éditeur referme le volet (les barres du bas reviennent)", () => {
    onPhone();
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Texte" }));
    expect(sheet()).toBe("true");
    view.unmount();
    let open = true;
    function Probe() { open = useCarouselSheet(); return null; }
    render(<Probe />);
    expect(open).toBe(false);
  });
  it("sur ordinateur, pas de volet", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Couleurs" }));
    expect(sheet()).toBe("false");
    expect(screen.queryByRole("button", { name: "Terminé" })).toBeNull();
  });
});
