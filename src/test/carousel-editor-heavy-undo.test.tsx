// Lot E2 (14/10/2026) : on fige le comportement de l'éditeur avant son découpage.
// Annuler / rétablir après une opération « lourde » (qui réécrit une slide entière
// ou plusieurs slides d'un coup) : mise en page, thème, report sur toutes les
// slides, collage. Un clic sur « Annuler » doit rendre EXACTEMENT l'état d'avant
// (HTML et données de chaque slide), et « Rétablir » l'état d'après.
import React, { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem("carousel-editor:mode", "complet"); // panneau complet (« Plus d'outils »), chantier D
  for (const title of ["Calques", "Toutes les slides"]) window.localStorage.setItem(`carousel-panel:${title}`, "1");
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const textSlide = (title: string, body: string) =>
  '<div style="position:relative;width:1080px;height:1350px;background-color:#fff4f8;color:#1a1a1a">' +
  `<h1 data-slide-text="title" data-pptx-editable="title" style="position:absolute;left:80px;top:100px;font-family:Georgia;color:#91014b;font-size:72px">${title}</h1>` +
  `<p data-slide-text="body" data-pptx-editable="body" style="position:absolute;left:80px;top:400px;font-family:Arial;color:#1a1a1a;font-size:40px">${body}</p></div>`;
const raw = {
  slides: [
    { slide_number: 1, title: "Un", body: "Premier" },
    { slide_number: 2, title: "Deux", body: "Deuxième" },
    { slide_number: 3, title: "Trois", body: "Photo", photo_index: 1 },
  ],
  caption: { body: "Légende" },
};
const visuals = [
  { slide_number: 1, html: textSlide("Un", "Premier") },
  { slide_number: 2, html: textSlide("Deux", "Deuxième") },
  {
    slide_number: 3,
    html:
      '<div style="position:relative;width:1080px;height:1350px">' +
      '<img data-pptx-photo="1" src="https://example.com/p.jpg" style="position:absolute;left:0;top:0;width:1080px;height:1350px;object-fit:cover">' +
      '<h1 data-slide-text="title" style="position:absolute;left:80px;top:1000px;color:#ffffff">Trois</h1></div>',
  },
];
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (
    <>
      <output data-testid="saved">{JSON.stringify({ v, slides: r.slides })}</output>
      <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} />
    </>
  );
}
const state = () => screen.getByTestId("saved").textContent!;
const saved = () => JSON.parse(state());
const slideDoc = (i: number) => new DOMParser().parseFromString(saved().v[i].html, "text/html");
const undoButton = () => screen.getByLabelText("Annuler la modification") as HTMLButtonElement;
const redoButton = () => screen.getByLabelText("Rétablir la modification") as HTMLButtonElement;
const undo = () => fireEvent.click(undoButton());
const redo = () => fireEvent.click(redoButton());
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const chooseLayer = (name: RegExp) => fireEvent.click(screen.getByLabelText(name));

/** L'opération change l'état ; Annuler le rend à l'identique, Rétablir aussi. */
function expectExactUndoRedo(before: string) {
  const after = state();
  expect(after).not.toBe(before);
  undo();
  expect(state()).toBe(before);
  expect(redoButton().disabled).toBe(false);
  redo();
  expect(state()).toBe(after);
  return after;
}

describe("annuler / rétablir après une opération lourde", () => {
  it("changement de mise en page (composeLayout)", () => {
    render(<Harness />);
    const before = state();
    fireEvent.click(screen.getByLabelText("Mise en page Citation"));
    expect(saved().slides[0].layout_variant).toBe("citation");
    // La slide garde son identité (même slide, nouvelle disposition).
    expect(saved().slides[0].editor_id).toBe(JSON.parse(before).slides[0].editor_id);
    expectExactUndoRedo(before);
    undo();
    expect(saved().slides[0].layout_variant).toBeUndefined();
  });
  it("deux mises en page de suite : deux annulations, pas une", () => {
    render(<Harness />);
    const before = state();
    fireEvent.click(screen.getByLabelText("Mise en page Citation"));
    const middle = state();
    fireEvent.click(screen.getByLabelText("Mise en page Titre centré"));
    undo();
    expect(state()).toBe(middle);
    undo();
    expect(state()).toBe(before);
    expect(undoButton().disabled).toBe(true);
  });
  it("thème du carrousel (applyTheme) : toutes les slides reviennent d'un coup", () => {
    render(<Harness />);
    const before = state();
    tab("Carrousel");
    fireEvent.click(screen.getByLabelText("Appliquer le thème Sombre"));
    expect(slideDoc(0).body.innerHTML).not.toBe(new DOMParser().parseFromString(JSON.parse(before).v[0].html, "text/html").body.innerHTML);
    expect(slideDoc(1).body.innerHTML).not.toBe(new DOMParser().parseFromString(JSON.parse(before).v[1].html, "text/html").body.innerHTML);
    // La slide photo garde ses couleurs.
    expect(saved().v[2].html).toBe(JSON.parse(before).v[2].html);
    expectExactUndoRedo(before);
  });
  it("thème puis mise en page : on remonte pas à pas", () => {
    render(<Harness />);
    const before = state();
    tab("Carrousel");
    fireEvent.click(screen.getByLabelText("Appliquer le thème Sombre"));
    const themed = state();
    tab("Slide");
    fireEvent.click(screen.getByLabelText("Mise en page Citation"));
    undo();
    expect(state()).toBe(themed);
    undo();
    expect(state()).toBe(before);
  });
  it("« Appliquer à toutes les slides » (style et position)", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Un/);
    fireEvent.change(screen.getByLabelText("Taille du texte (valeur)"), { target: { value: "96" } });
    const before = state();
    fireEvent.change(screen.getByLabelText("Appliquer à toutes les slides"), { target: { value: "both" } });
    expect(slideDoc(1).querySelector<HTMLElement>('[data-slide-text="title"]')!.style.fontSize).toBe("96px");
    expectExactUndoRedo(before);
  });
  it("« Police et couleur sur toutes les slides »", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Un/);
    fireEvent.click(screen.getByLabelText("Choisir une police"));
    const playfair = Array.from(screen.getByLabelText("Polices").querySelectorAll<HTMLElement>('[role="option"]')).find((o) => o.textContent!.startsWith("Playfair Display"))!;
    fireEvent.click(playfair);
    const before = state();
    fireEvent.click(screen.getByText("Police et couleur sur toutes les slides"));
    expect(slideDoc(1).querySelector<HTMLElement>('[data-slide-text="title"]')!.style.fontFamily).toMatch(/Playfair/);
    expectExactUndoRedo(before);
  });
  it("une retouche après une annulation efface « Rétablir »", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Mise en page Citation"));
    undo();
    expect(redoButton().disabled).toBe(false);
    tab("Carrousel");
    fireEvent.click(screen.getByLabelText("Appliquer le thème Sombre"));
    expect(redoButton().disabled).toBe(true);
  });
  it("collage sur une autre slide : Annuler retire l'élément collé, Rétablir le remet", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
    try {
      render(<Harness />);
      const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
      const doc = iframe.contentDocument!;
      // Le HTML enregistré porte déjà les identifiants posés par l'éditeur.
      doc.body.innerHTML = saved().v[0].html;
      fireEvent.load(iframe);
      const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]')!;
      title.getBoundingClientRect = () => ({ left: 80, top: 100, width: 400, height: 90, right: 480, bottom: 190, x: 80, y: 100, toJSON() {} }) as DOMRect;
      act(() => { title.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 100, clientY: 120, button: 0 })); });
      act(() => { title.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: 100, clientY: 120, button: 0 })); });
      fireEvent.click(screen.getByLabelText("Copier l’élément"));
      expect(toast.success).toHaveBeenCalledWith("Élément copié", expect.anything());
      fireEvent.click(screen.getByLabelText("Sélectionner la slide 2"));
      const before = state();
      fireEvent.click(screen.getByText("Coller l’élément copié"));
      const pasted = Array.from(slideDoc(1).querySelectorAll("h1")).map((h) => h.textContent);
      expect(pasted).toEqual(["Deux", "Un"]);
      // La copie n'est pas reliée au titre de la slide 1.
      expect(slideDoc(1).querySelectorAll('[data-slide-text="title"]')).toHaveLength(1);
      expectExactUndoRedo(before);
      undo();
      expect(Array.from(slideDoc(1).querySelectorAll("h1")).map((h) => h.textContent)).toEqual(["Deux"]);
    } finally { width.mockRestore(); }
  });
});
