// Répétition du 25/11/2026 : « Refaire les visuels ? » disait « Tes retouches
// seront remplacées » sans aucune retouche, et « Que montre chaque photo ? »
// cachait « Créer mon carrousel » sous le pli avec 5 photos.
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import RedoVisualsDialog from "@/components/creer/RedoVisualsDialog";
import PhotoContextStepDialog from "@/components/creer/PhotoContextStepDialog";
import { hasRetouches, retouchedOnImport } from "@/lib/carousel-retouched";
import { requestCarouselTextList } from "@/lib/carousel-editor-shown";
import { APP_TAB_TITLE, useAppTabTitle } from "@/hooks/use-app-tab-title";

vi.mock("sonner", () => { const toast: any = () => {}; toast.success = toast.error = toast.warning = toast.info = toast.message = () => {}; return { toast }; });
vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => { cleanup(); window.localStorage.clear(); });

const raw = { slides: [{ slide_number: 1, role: "hook", title: "Mon atelier", body: "Texte" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "Ma légende" } };
const design = (label: string) => [
  { slide_number: 1, html: `<div data-v="${label}"><h1 data-slide-text="title">Mon atelier</h1><p data-slide-text="body">Texte</p></div>` },
  { slide_number: 2, html: `<div data-v="${label}"><h1 data-slide-text="title">Suite</h1><p data-slide-text="body">Fin</p></div>` },
];
let setVisuals: (v: any) => void = () => {};
function Harness({ r0 = raw }: { r0?: any }) {
  const [r, setR] = useState<any>(r0), [v, setV] = useState(design("a"));
  setVisuals = setV;
  return (<><output data-testid="saved">{JSON.stringify(r)}</output>
    <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} /></>);
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);
const retoucher = () => {
  React.act(() => requestCarouselTextList());
  fireEvent.change(screen.getByLabelText("Slide 2 : titre"), { target: { value: "La suite corrigée" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer le texte" }));
};

describe("suivi des retouches d'un carrousel", () => {
  it("visuels tout juste créés : aucune retouche ; un geste dans l'éditeur : retouché ; visuels refaits : de nouveau aucune", async () => {
    render(<Harness />);
    expect(saved().carousel_editor_version).toBe(1);
    expect(saved().carousel_retouched).toBe(false);
    expect(hasRetouches(saved())).toBe(false);
    retoucher();
    expect(saved().carousel_retouched).toBe(true);
    expect(saved().slides[1].title).toBe("La suite corrigée");
    // « Refaire les visuels » : de nouveaux visuels arrivent dans le même éditeur.
    React.act(() => setVisuals(design("b")));
    expect(saved().carousel_retouched).toBe(false);
  });

  it("carrousel retouché rouvert (rechargement, Mes idées) : reste retouché ; carrousel d'avant ce suivi : on prévient comme avant", () => {
    render(<Harness r0={{ ...raw, carousel_editor_version: 1, carousel_retouched: true }} />);
    expect(saved().carousel_retouched).toBe(true);
    cleanup();
    render(<Harness r0={{ ...raw, carousel_editor_version: 1 }} />);
    expect(saved().carousel_retouched).toBeUndefined();
    expect(hasRetouches(saved())).toBe(true);
    expect(hasRetouches(null)).toBe(true);
  });

  it("à la première arrivée, un écart entre les deux copies des visuels ne prouve rien", () => {
    const doc = { carousel_editor_version: 1, carousel_retouched: true, visual_html: design("a") };
    expect(retouchedOnImport(doc, design("b"), true)).toBeUndefined();
    expect(retouchedOnImport(doc, design("b"), false)).toBe(false);
    expect(retouchedOnImport(doc, design("a"), false)).toBeUndefined();
    expect(retouchedOnImport({}, design("a"), true)).toBe(false);
  });
});

describe("fenêtre « Refaire les visuels ? »", () => {
  const ouvrir = (retouched?: boolean) => render(<RedoVisualsDialog open canCopy retouched={retouched} onCancel={() => {}} onConfirm={() => {}} />);

  it("sans retouche : ne parle ni de retouches ni de copie", () => {
    ouvrir(false);
    const fenetre = screen.getByRole("alertdialog");
    expect(fenetre).toHaveTextContent("Le design actuel sera remplacé par un nouveau. Le texte reste.");
    expect(fenetre).toHaveTextContent("Cela compte 1 crédit. Tu pourras revenir à celui-ci pendant 30 secondes.");
    expect(fenetre).not.toHaveTextContent(/retouche/i);
    expect(within(fenetre).queryByRole("button", { name: "Garder une copie dans Mes idées" })).toBeNull();
    expect(within(fenetre).getByRole("button", { name: "Refaire les visuels" })).toBeInTheDocument();
  });

  it("avec retouches (ou sans information) : texte et boutons d'avant", () => {
    ouvrir();
    const fenetre = screen.getByRole("alertdialog");
    expect(fenetre).toHaveTextContent("Tes retouches seront remplacées par un nouveau design. Le texte reste.");
    expect(within(fenetre).getByRole("button", { name: "Garder une copie dans Mes idées" })).toBeInTheDocument();
    expect(within(fenetre).getByRole("button", { name: "Refaire quand même" })).toBeInTheDocument();
  });
});

describe("fenêtre « Que montre chaque photo ? »", () => {
  it("seule la liste des photos défile : le titre et « Créer mon carrousel » restent à l'écran", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ key: `p${i}`, text: "", suggested: false })) as any;
    render(<PhotoContextStepDialog open previews={[]} rows={rows} onRowsChange={() => {}} onConfirm={() => {}} onSkip={() => {}} onCancel={() => {}} />);
    const fenetre = screen.getByTestId("photo-context-step");
    const liste = screen.getByTestId("photo-context-list");
    expect(fenetre.className).toMatch(/overflow-hidden/);
    expect(fenetre.className).not.toMatch(/overflow-y-auto/);
    expect(liste.className).toMatch(/overflow-y-auto/);
    expect(within(liste).getAllByRole("textbox")).toHaveLength(5);
    const bouton = screen.getByRole("button", { name: "Créer mon carrousel" });
    expect(liste.contains(bouton)).toBe(false);
    expect(liste.contains(screen.getByRole("button", { name: "Passer" }))).toBe(false);
    expect(liste.contains(screen.getByText("Que montre chaque photo ?"))).toBe(false);
  });
});

describe("titre d'onglet dans l'outil", () => {
  it("une fois connectée : le nom de l'outil ; en sortant : le titre du site revient", () => {
    document.title = "L'Assistant Com' — Communication éthique pour créatrices | Nowadays";
    const { unmount, rerender } = renderHook(({ on }) => useAppTabTitle(on), { initialProps: { on: false } });
    expect(document.title).toMatch(/créatrices/);
    rerender({ on: true });
    expect(document.title).toBe(APP_TAB_TITLE);
    expect(document.title).not.toMatch(/créatrices/);
    unmount();
    expect(document.title).toMatch(/créatrices/);
  });
});
