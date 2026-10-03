// « Mes styles » de l'éditeur de carrousel (03/10/2026).
import React, { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import type { CarouselStylesApi, SavedCarouselStyle } from "@/hooks/use-carousel-styles";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
// Les calques sont repliés par défaut : ces tests les ouvrent.
beforeEach(() => window.localStorage.setItem("carousel-panel:Calques", "1"));
afterEach(cleanup);

const raw = { slides: [{ slide_number: 1, title: "Titre", body: "Corps" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "L" } };
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title" style="color:#91014b;font-size:80px;letter-spacing:2px">Titre</h1><p data-slide-text="body" style="color:#222222;font-size:40px">Corps</p></div>' },
  { slide_number: 2, html: '<div><h1 data-slide-text="title">Suite</h1><p data-slide-text="body">Fin</p></div>' },
];
function Harness({ api }: { api: CarouselStylesApi }) {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify(v)}</output>
    <CarouselEditor result={r} visualSlides={v} savedStyles={api} brandColors={["#FB3D80"]} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}

describe("my styles", () => {
  it("saves the chosen title's style as a text style", async () => {
    const save = vi.fn(async () => true);
    render(<Harness api={{ list: [], save, remove: vi.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: /Choisir le calque Titre/ }));
    fireEvent.change(screen.getByLabelText("Nom du style"), { target: { value: "Titre rose" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Enregistrer ce style"));
    });
    expect(save).toHaveBeenCalledWith("Titre rose", "text", expect.objectContaining({ "font-size": "80px", "letter-spacing": "2px" }));
    const styles = (save.mock.calls[0] as unknown[])[2] as Record<string, string>;
    expect(styles.color).toMatch(/145, 1, 75|#91014b/i);
  });
  it("applies a saved text style in one click, and only offers styles of the same kind", () => {
    const list: SavedCarouselStyle[] = [
      { id: "a", name: "Titre rose", kind: "text", styles: { color: "#fb3d80", "font-size": "90px" } },
      { id: "b", name: "Ma forme", kind: "shape", styles: { "background-color": "#000000" } },
    ];
    render(<Harness api={{ list, save: vi.fn(), remove: vi.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: /Choisir le calque Corps/ }));
    expect(screen.queryByText("Ma forme")).toBeNull();
    fireEvent.click(screen.getByTitle("Appliquer ce style"));
    const html = JSON.parse(screen.getByTestId("saved").textContent!)[0].html;
    const body = new DOMParser().parseFromString(html, "text/html").querySelector<HTMLElement>('[data-slide-text="body"]')!;
    expect(body.style.fontSize).toBe("90px");
    expect(body.style.color).toMatch(/251, 61, 128|#fb3d80/i);
  });
  it("hides the section when styles are not available", () => {
    render(<CarouselEditor result={raw} visualSlides={visuals} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Choisir le calque Titre/ }));
    expect(screen.queryByLabelText("Mes styles")).toBeNull();
  });
});
