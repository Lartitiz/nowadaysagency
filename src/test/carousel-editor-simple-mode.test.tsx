// Mode simple de l'éditeur de carrousel (chantier D, 15/10/2026). Par défaut, quatre
// réglages (texte, photo, couleur, police) ; tout le reste est à un clic dans
// « Plus d'outils ». Ce fichier sert aussi de garde-fou : si le mode simple ou la
// barre posée sur la slide regagnent des boutons, il échoue (seuils ci-dessous).
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { readCarouselDocument } from "@/lib/carousel-editor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// Seuils du garde-fou (à ne relever qu'avec l'accord de Laetitia).
const MAX_SIMPLE_PANEL_CONTROLS = 22;
const MAX_SIMPLE_TOOLBAR_BUTTONS = 11;

const raw = { slides: [{ slide_number: 1, title: "Mon atelier", body: "Texte" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "Ma légende" } };
const visuals = [
  { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px;color:#123456"><h1 data-slide-text="title" style="color:#91014b">Mon atelier</h1><p data-slide-text="body">Texte</p></div>' },
  { slide_number: 2, html: '<div><h1 data-slide-text="title">Suite</h1><p data-slide-text="body">Fin</p></div>' },
];
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (<><output data-testid="saved">{JSON.stringify({ r, v })}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);
const panel = () => screen.getByLabelText("Réglages simples");

describe("mode simple de l'éditeur", () => {
  it("s'ouvre par défaut avec texte, photo, couleur et police, sans onglets ni calques", () => {
    render(<Harness />);
    expect(screen.queryByRole("tab", { name: "Slide" })).toBeNull();
    expect(screen.queryByText(/Calques/)).toBeNull();
    for (const part of ["Texte", "Photo", "Couleur", "Police"]) expect(within(panel()).getAllByText(part).length).toBeGreaterThan(0);
    expect(screen.getByText(/Touche un texte ou une photo sur la slide/)).toBeTruthy();
    const controls = panel().querySelectorAll("button, input, select, textarea");
    expect(controls.length).toBeLessThanOrEqual(MAX_SIMPLE_PANEL_CONTROLS);
  });

  it("le bouton « Texte » choisit le premier texte : on l'écrit, le grossit et le centre", () => {
    render(<Harness />);
    fireEvent.click(within(panel()).getByRole("button", { name: "Texte" }));
    const field = screen.getByLabelText("Texte sélectionné") as HTMLTextAreaElement;
    expect(field.value).toBe("Mon atelier");
    fireEvent.change(field, { target: { value: "Mon nouvel atelier" } });
    expect(saved().r.slides[0].title).toBe("Mon nouvel atelier");
    fireEvent.change(screen.getByRole("slider", { name: "Taille du texte" }), { target: { value: "90" } });
    fireEvent.click(within(panel()).getByRole("button", { name: "Centre" }));
    expect(saved().v[0].html).toMatch(/font-size: 90px/);
    expect(saved().v[0].html).toMatch(/text-align: center/);
  });

  it("sans élément choisi, une pastille change le fond de la slide", () => {
    render(<Harness />);
    const swatch = within(panel()).getAllByRole("button", { name: /^Fond de la slide #/ })[0];
    fireEvent.click(swatch);
    const hex = swatch.getAttribute("aria-label")!.split(" ").pop()!;
    expect(readCarouselDocument(saved().r, saved().v).slides[0].html.toLowerCase()).toContain("background-color");
    expect(swatch.getAttribute("aria-pressed")).toBe("true");
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("« Plus d'outils » ouvre le panneau complet, s'en souvient, et « Mode simple » revient", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Plus d’outils/ }));
    expect(screen.getByRole("tab", { name: "Slide" })).toBeTruthy();
    expect(window.localStorage.getItem("carousel-editor:mode")).toBe("complet");
    cleanup();
    render(<Harness />);
    expect(screen.getByRole("tab", { name: "Slide" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Mode simple/ }));
    expect(screen.queryByRole("tab", { name: "Slide" })).toBeNull();
    expect(screen.getByLabelText("Réglages simples")).toBeTruthy();
  });

  it("les aides s'ouvrent au toucher (pas seulement au survol)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Aide : gestes sur la slide" }));
    expect(screen.getByText(/Double-clique \(ou touche « Écrire »\)/)).toBeTruthy();
  });

  it("la légende est repliée sous l'éditeur, son début reste visible, un clic l'ouvre", () => {
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: /Légende de la publication/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Ma légende");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect((screen.getByLabelText("Légende du carrousel") as HTMLTextAreaElement).value).toBe("Ma légende");
  });

  it("la barre posée sur la slide reste courte ; le reste est dans « … », avec des mots", () => {
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
      const toolbar = screen.getByRole("toolbar", { name: /Barre d’outils/ });
      // L'alerte qualité (« ! Corriger ») n'apparaît que s'il y a un souci : elle ne compte pas.
      const buttons = [...toolbar.querySelectorAll("button")].filter((b) => !/Corriger|À vérifier/.test(b.textContent || ""));
      expect(buttons.length).toBeLessThanOrEqual(MAX_SIMPLE_TOOLBAR_BUTTONS);
      expect(within(toolbar).getByText("Retirer")).toBeTruthy();
      expect(within(toolbar).queryByLabelText("Verrouiller l’élément")).toBeNull();
      fireEvent.click(within(toolbar).getByLabelText("Plus d’actions sur l’élément"));
      expect(screen.getByText(/Verrouiller \(il ne bougera plus\)/)).toBeTruthy();
      expect(screen.getByText("Dupliquer")).toBeTruthy();
    } finally {
      width.mockRestore();
    }
  });
});
