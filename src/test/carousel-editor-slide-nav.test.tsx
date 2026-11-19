// Retour d'une cliente en rendez-vous (19/11/2026) : difficile de passer d'une
// slide à l'autre dans l'éditeur. Flèches ‹ › dans l'en-tête, et ← → au clavier
// quand rien n'est choisi sur la slide.
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => { cleanup(); window.localStorage.clear(); });

const slide = (n: number) => ({ slide_number: n, html: `<div style="position:relative;width:1080px;height:1350px;background-color:#fff4f8"><h1 data-slide-text="title">Titre ${n}</h1></div>` });
const raw = { slides: [1, 2, 3].map((n) => ({ slide_number: n, title: `Titre ${n}`, body: "" })), caption: { body: "" } };
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState([1, 2, 3].map(slide));
  return <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} />;
}
const opened = () => screen.getAllByRole("button", { name: /^Sélectionner la slide/ }).findIndex((b) => b.getAttribute("aria-pressed") === "true") + 1;

describe("passer d'une slide à l'autre", () => {
  it("les flèches de l'en-tête avancent et reculent, bornées aux extrémités", () => {
    render(<Harness />);
    const header = screen.getByRole("group", { name: "Personnaliser mon carrousel" });
    const prev = within(header).getByRole("button", { name: "Slide précédente" });
    const next = within(header).getByRole("button", { name: "Slide suivante" });
    expect(opened()).toBe(1);
    expect(prev).toBeDisabled();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    fireEvent.click(next);
    expect(opened()).toBe(2);
    fireEvent.click(next);
    expect(opened()).toBe(3);
    expect(next).toBeDisabled();
    fireEvent.click(prev);
    expect(opened()).toBe(2);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("flèches rondes sur les bords de la slide, sans précédente sur la première", () => {
    render(<Harness />);
    expect(screen.queryByTestId("slide-edge-prev")).toBeNull();
    fireEvent.click(screen.getByTestId("slide-edge-next"));
    expect(opened()).toBe(2);
    fireEvent.click(screen.getByTestId("slide-edge-prev"));
    expect(opened()).toBe(1);
  });

  it("← → au clavier changent de slide quand rien n'est choisi", () => {
    render(<Harness />);
    fireEvent.keyDown(window.document.body, { key: "ArrowRight" });
    expect(opened()).toBe(2);
    fireEvent.keyDown(window.document.body, { key: "PageDown" });
    expect(opened()).toBe(3);
    fireEvent.keyDown(window.document.body, { key: "ArrowLeft" });
    expect(opened()).toBe(2);
  });
});
