// Panneau de réglages rangé en sections repliables (03/10/2026).
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
// Les calques sont repliés par défaut : ces tests les ouvrent.
beforeEach(() => window.localStorage.setItem("carousel-panel:Calques", "1"));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
const raw = { slides: [{ slide_number: 1, title: "Titre", body: "Corps" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "L" } };
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title">Titre</h1><p data-slide-text="body">Corps</p></div>' },
  { slide_number: 2, html: '<div><h1 data-slide-text="title">Suite</h1><p data-slide-text="body">Fin</p></div>' },
];
const section = (name: string) => screen.getByRole("button", { name, expanded: undefined });

describe("settings panel sections", () => {
  it("opens only the essentials, the rest on demand, and remembers it", () => {
    render(<CarouselEditor result={raw} visualSlides={visuals} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Choisir le calque Titre/ }));
    expect(section("Texte").getAttribute("aria-expanded")).toBe("true");
    expect(section("Typographie avancée").getAttribute("aria-expanded")).toBe("false");
    expect(section("Position et taille").getAttribute("aria-expanded")).toBe("false");
    // Les réglages repliés restent dans la page, simplement masqués.
    expect(document.querySelector<HTMLElement>("input[aria-label=\"Interligne\"]")!.closest("[hidden]")).not.toBeNull();
    fireEvent.click(section("Typographie avancée"));
    expect(section("Typographie avancée").getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector<HTMLElement>("input[aria-label=\"Interligne\"]")!.closest("[hidden]")).toBeNull();
    cleanup();
    render(<CarouselEditor result={raw} visualSlides={visuals} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Choisir le calque Titre/ }));
    expect(section("Typographie avancée").getAttribute("aria-expanded")).toBe("true");
  });
  it("on phone the panel is a bottom sheet that opens when an element is chosen", () => {
    render(<CarouselEditor result={raw} visualSlides={visuals} onChange={() => {}} />);
    expect(screen.getByLabelText("Ouvrir les réglages")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Choisir le calque Titre/ }));
    expect(screen.getByLabelText("Replier les réglages")).toBeTruthy();
  });
});
