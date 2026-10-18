// Chantier V (18/10/2026, choix C1 de Laetitia) : en mode simple, la police et la
// couleur changent le texte choisi, et « Mettre cette police / couleur partout »
// les reporte sur tous les textes du carrousel, en une seule étape d'Annuler, sans
// toucher aux slides verrouillées. La police s'ouvre aussi depuis le « … » de la
// barre posée sur la slide.
import React, { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { readCarouselDocument } from "@/lib/carousel-editor";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
// Débordement simulé (jsdom ne calcule pas la mise en page) : un titre de plus de 50 px est « coupé ».
vi.mock("@/lib/carousel-quality", async (orig) => {
  const real = await orig<typeof import("@/lib/carousel-quality")>();
  const findClippedIds = (doc: Document) =>
    [...doc.querySelectorAll<HTMLElement>('[data-slide-text="title"][data-editor-id]')].filter((el) => parseFloat(el.style.fontSize) > 50).map((el) => el.dataset.editorId!);
  return { ...real, findClippedIds, hasClippedElement: (doc: Document) => findClippedIds(doc).length > 0, inspectSlide: () => [] };
});
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const textSlide = (title: string, body: string) =>
  '<div style="position:relative;width:1080px;height:1350px;background-color:#fff4f8">' +
  `<h1 data-slide-text="title" data-pptx-editable="title" style="font-family:Arial;color:#91014b;font-size:72px">${title}</h1>` +
  `<p data-slide-text="body" data-pptx-editable="body" style="font-family:Arial;color:#1a1a1a;font-size:40px">${body}</p></div>`;
const raw = {
  slides: [
    { slide_number: 1, title: "Un", body: "Premier" },
    { slide_number: 2, title: "Deux", body: "Deuxième" },
    { slide_number: 3, title: "Trois", body: "Troisième", editor_locked: true },
  ],
  caption: { body: "Légende" },
};
const visuals = raw.slides.map((s) => ({ slide_number: s.slide_number, html: textSlide(s.title, s.body) }));
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (
    <>
      <output data-testid="saved">{JSON.stringify({ r, v })}</output>
      <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} />
    </>
  );
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);
const slides = () => readCarouselDocument(saved().r, saved().v).slides;
const texts = (i: number) => [...new DOMParser().parseFromString(slides()[i].html, "text/html").querySelectorAll<HTMLElement>("[data-slide-text]")];
const panel = () => screen.getByLabelText("Réglages simples");
// Le bouton « Police » (téléphone) choisit le premier texte de la slide.
const chooseFirstText = () => fireEvent.click(within(panel()).getByRole("button", { name: "Police" }));
const pickFont = (label: string) => {
  if (!screen.queryByLabelText("Polices")) fireEvent.click(screen.getByLabelText("Choisir une police"));
  fireEvent.click([...screen.getByLabelText("Polices").querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent!.startsWith(label))!);
};

describe("« Mettre cette police partout » (mode simple)", () => {
  it("la police choisie va sur tous les textes, sauf la slide verrouillée, et un seul Annuler revient", () => {
    render(<Harness />);
    chooseFirstText();
    pickFont("Playfair Display");
    // Le texte choisi seulement, avant le bouton.
    expect(texts(0)[0].style.fontFamily).toMatch(/Playfair/);
    expect(texts(1)[0].style.fontFamily).toBe("Arial");
    const lockedBefore = slides()[2].html;
    const before = JSON.stringify(saved());
    fireEvent.click(screen.getByTestId("font-everywhere"));
    for (const i of [0, 1]) for (const t of texts(i)) expect(t.style.fontFamily).toMatch(/Playfair Display/);
    // La police Google suit sur chaque slide (aperçu et export).
    expect(slides()[1].html).toMatch(/fonts\.googleapis\.com[^"]*Playfair\+Display/);
    expect(slides()[2].html).toBe(lockedBefore);
    expect(toast.success).toHaveBeenCalledWith("Police mise sur tous les textes", { description: "1 slide verrouillée garde la sienne. Tu peux annuler." });
    fireEvent.click(screen.getByLabelText("Annuler la modification"));
    expect(texts(1)[0].style.fontFamily).toBe("Arial");
    expect(texts(0)[0].style.fontFamily).toMatch(/Playfair/);
    // Une seule étape : l'état est exactement celui d'avant le bouton.
    expect(JSON.stringify(saved())).toBe(before);
  });

  it("« Mettre cette couleur partout » reporte la couleur du texte choisi", () => {
    render(<Harness />);
    chooseFirstText();
    const swatch = within(panel()).getAllByRole("button", { name: /^Couleur du texte #/ }).find((b) => b.getAttribute("aria-pressed") !== "true")!;
    fireEvent.click(swatch);
    const hex = swatch.getAttribute("aria-label")!.split(" ").pop()!.toLowerCase();
    fireEvent.click(screen.getByTestId("color-everywhere"));
    const rgb = (h: string) => `rgb(${[1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)).join(", ")})`;
    for (const i of [0, 1]) for (const t of texts(i)) expect(t.style.color).toBe(rgb(hex));
    expect(texts(2)[0].style.color).toBe(rgb("#91014b"));
  });

  it("sans police choisie (police du thème), le bouton ne fait rien et le dit par son état", () => {
    const html = visuals.map((v) => ({ ...v, html: v.html.replace(/font-family:Arial;/g, "") }));
    function NoFont() {
      const [r, setR] = useState<any>(raw), [v, setV] = useState(html);
      return <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} />;
    }
    render(<NoFont />);
    chooseFirstText();
    expect((screen.getByTestId("font-everywhere") as HTMLButtonElement).disabled).toBe(true);
  });

  it("le garde-fou du mode simple tient : les boutons « partout » n'apparaissent qu'avec un texte choisi", () => {
    render(<Harness />);
    expect(screen.queryByTestId("font-everywhere")).toBeNull();
    expect(screen.queryByTestId("color-everywhere")).toBeNull();
  });
});

describe("« Changer la police » dans le « … » de la barre posée sur la slide", () => {
  it("ouvre la liste des polices du panneau simple", async () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
    try {
      render(<Harness />);
      const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
      const doc = iframe.contentDocument!;
      doc.body.innerHTML = slides()[0].html;
      fireEvent.load(iframe);
      const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]')!;
      title.getBoundingClientRect = () => ({ left: 100, top: 200, width: 600, height: 120, right: 700, bottom: 320, x: 100, y: 200, toJSON: () => ({}) }) as DOMRect;
      fireEvent.pointerDown(title, { button: 0, clientX: 150, clientY: 250 });
      fireEvent.pointerUp(title, { button: 0, clientX: 150, clientY: 250 });
      fireEvent.click(title, { clientX: 150, clientY: 250 });
      const toolbar = screen.getByRole("toolbar", { name: /Barre d’outils/ });
      fireEvent.click(within(toolbar).getByLabelText("Plus d’actions sur l’élément"));
      fireEvent.click(screen.getByText("Changer la police"));
      expect(await screen.findByLabelText("Polices")).toBeTruthy();
    } finally {
      width.mockRestore();
    }
  });
});

describe("« Ajuster la taille » dans l'alerte de débordement", () => {
  it("réduit le seul texte coupé, en une étape d'Annuler", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
    render(<Harness />);
    const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
    const doc = iframe.contentDocument!;
    doc.body.innerHTML = new DOMParser().parseFromString(slides()[0].html, "text/html").body.innerHTML;
    fireEvent.load(iframe);
    const alert = await screen.findByText(/Un élément dépasse/);
    fireEvent.click(within(alert).getByRole("button", { name: "Ajuster la taille" }));
    const title = texts(0)[0];
    expect(parseFloat(title.style.fontSize)).toBeLessThanOrEqual(50);
    // Le corps, lui, n'est pas touché.
    expect(texts(0)[1].style.fontSize).toBe("40px");
    fireEvent.click(screen.getByLabelText("Annuler la modification"));
    expect(texts(0)[0].style.fontSize).toBe("72px");
    vi.restoreAllMocks();
  });
});
