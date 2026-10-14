// Lot E3-0 (14/10/2026) : avant de découper CarouselEditor.tsx, on fige le
// BRANCHEMENT des commandes que les autres tests ne passent pas par l'écran.
// Le calcul de chaque commande est testé ailleurs (src/lib/carousel-editor.ts) ;
// ici on vérifie qu'un clic dans l'éditeur arrive bien jusqu'à la slide
// enregistrée : contrôle qualité, sélection multiple (aligner, grouper),
// flèches du clavier, boutons des slides, calques masqués / retirés / remis,
// fond de la slide, texte sur la photo, voile, aperçu Instagram.
import React, { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { getEditorElements, prepareSlideHtml, readCarouselDocument, veilAlpha } from "@/lib/carousel-editor";
import type { CarouselQuality } from "@/hooks/use-carousel-quality";
import { composePhotoSlide } from "../../supabase/functions/_shared/photo-overlay-templates";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem("carousel-panel:Calques", "1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.innerHTML = "";
});

const textSlide = (title: string, body: string) =>
  '<div style="position:relative;width:1080px;height:1350px;background-color:#fff4f8;color:#1a1a1a">' +
  `<h1 data-slide-text="title" data-pptx-editable="title" style="position:absolute;left:80px;top:100px;font-size:72px">${title}</h1>` +
  `<p data-slide-text="body" data-pptx-editable="body" style="position:absolute;left:300px;top:400px;font-size:40px">${body}</p></div>`;
const charter = { color_accent: "#5C7A5A", color_primary: "#5C7A5A", font_title: "Georgia", font_body: "Arial" };
const photoHtml = composePhotoSlide(
  { slide_number: 3, photo_index: 1, overlay_text: "Une phrase sur la photo.", overlay_position: "bottom_left" } as never,
  charter as never,
  { isFirst: false, isLast: false },
).html.replace(/\{\{PHOTO_1\}\}/g, "https://example.com/p.jpg");
const raw = {
  slides: [
    { slide_number: 1, title: "Un", body: "Premier" },
    { slide_number: 2, title: "Deux", body: "Deuxième" },
    { slide_number: 3, overlay_text: "Une phrase sur la photo.", overlay_position: "bottom_left", photo_index: 1 },
  ],
  caption: { body: "Légende" },
};
const visuals = [
  { slide_number: 1, html: textSlide("Un", "Premier") },
  { slide_number: 2, html: textSlide("Deux", "Deuxième") },
  { slide_number: 3, html: prepareSlideHtml(photoHtml) },
];
const editorDoc = () => readCarouselDocument(raw, visuals);
const idOf = (slide: number, field: string) =>
  getEditorElements(editorDoc().slides[slide].html).find((e) => e.field === field)!.id;

function Harness({ quality, portal }: { quality?: CarouselQuality; portal?: HTMLElement }) {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (
    <>
      <output data-testid="saved">{JSON.stringify({ v, slides: r.slides })}</output>
      <CarouselEditor result={r} visualSlides={v} quality={quality} toolsPortal={portal} onChange={(a, b) => { setR(a); setV(b); }} />
    </>
  );
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!);
const slideDoc = (i: number) => new DOMParser().parseFromString(saved().v[i].html, "text/html");
const savedEl = (i: number, id: string) => slideDoc(i).querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
const undo = () => fireEvent.click(screen.getByLabelText("Annuler la modification"));
const buttonText = (text: string) => screen.getByText(text).closest("button") as HTMLButtonElement;

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
// La boîte d'un élément suit sa position écrite (left / top), comme dans un vrai navigateur.
const follow = (el: HTMLElement, width: number, height: number) => {
  el.getBoundingClientRect = () =>
    rect(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0, parseFloat(el.style.width) || width, parseFloat(el.style.height) || height);
};
/** Aperçu chargé (slide 1), avec des boîtes mesurables pour le titre et le texte. */
function withCanvas(props: { quality?: CarouselQuality; portal?: HTMLElement } = {}) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
  render(<Harness {...props} />);
  const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
  const doc = iframe.contentDocument!;
  doc.body.innerHTML = editorDoc().slides[0].html;
  const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]')!;
  const body = doc.querySelector<HTMLElement>('[data-slide-text="body"]')!;
  follow(title, 600, 100);
  follow(body, 400, 60);
  fireEvent.load(iframe);
  return { doc, title, body };
}
const ptr = (el: EventTarget, type: string, clientX: number, clientY: number, extra: MouseEventInit = {}) =>
  act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, ...extra })); });
const choose = (el: HTMLElement, x: number, y: number) => {
  ptr(el, "pointerdown", x, y);
  ptr(el, "pointerup", x, y);
};
const key = (doc: Document, k: string, extra: KeyboardEventInit = {}) =>
  act(() => { doc.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra })); });

describe("contrôle qualité (encadré sous les boutons de la page)", () => {
  const portal = () => {
    const host = document.createElement("div");
    host.setAttribute("data-testid", "portal");
    document.body.append(host);
    return host;
  };
  const issue = () => ({
    slide: 1,
    elementId: idOf(1, "title"),
    kind: "size" as const,
    severity: "error" as const,
    message: "Texte trop petit pour le mobile",
    fix: { "font-size": "50px" },
  });
  it("affiche le bilan dans l'encadré et relance la vérification", () => {
    const host = portal();
    const recheck = vi.fn();
    render(<Harness portal={host} quality={{ status: "done", issues: [issue()], recheck }} />);
    expect(host.textContent).toContain("1 point(s) bloquant(s) · 0 conseil(s)");
    expect(host.textContent).toContain("Slide 2 — À corriger : Texte trop petit pour le mobile");
    fireEvent.click(buttonText("Revérifier"));
    expect(recheck).toHaveBeenCalledTimes(1);
  });
  it("« Appliquer la correction » corrige la bonne slide, s'annule, et ouvre l'élément", () => {
    render(<Harness portal={portal()} quality={{ status: "done", issues: [issue()], recheck: () => {} }} />);
    const before = saved();
    fireEvent.click(buttonText("Appliquer la correction"));
    expect(savedEl(1, idOf(1, "title"))!.style.fontSize).toBe("50px");
    expect(saved().v[0].html).toBe(before.v[0].html);
    expect(screen.getByLabelText("Sélectionner la slide 2").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Texte sélectionné") as HTMLTextAreaElement).value).toBe("Deux");
    undo();
    expect(saved()).toEqual(before);
  });
  it("« Voir cet élément » ouvre la slide et choisit l'élément sans rien changer", () => {
    render(<Harness portal={portal()} quality={{ status: "done", issues: [issue()], recheck: () => {} }} />);
    const before = saved();
    fireEvent.click(buttonText("Voir cet élément"));
    expect(screen.getByLabelText("Sélectionner la slide 2").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Texte sélectionné") as HTMLTextAreaElement).value).toBe("Deux");
    expect(saved()).toEqual(before);
  });
  it("sans encadré hôte, rien n'est affiché ; en cours de vérification, le bouton attend", () => {
    const host = portal();
    const { unmount } = render(<Harness quality={{ status: "done", issues: [issue()], recheck: () => {} }} />);
    expect(screen.queryByText("Revérifier")).toBeNull();
    unmount();
    render(<Harness portal={host} quality={{ status: "checking", issues: [], recheck: () => {} }} />);
    expect(host.textContent).toContain("Contrôle de toutes les slides…");
    expect(buttonText("Revérifier").disabled).toBe(true);
  });
});

describe("sélection multiple : aligner et grouper", () => {
  const selectTitleAndBody = () => {
    fireEvent.click(screen.getByLabelText("Choisir le calque Un"));
    fireEvent.click(screen.getByLabelText("Choisir le calque Premier"), { shiftKey: true });
  };
  it("Maj + clic dans les calques ouvre le panneau « 2 éléments sélectionnés »", () => {
    withCanvas();
    selectTitleAndBody();
    expect(screen.getByLabelText("Sélection multiple").textContent).toContain("2 éléments sélectionnés");
  });
  it("« À gauche » aligne les deux blocs sur le plus à gauche, en une seule annulation", () => {
    withCanvas();
    selectTitleAndBody();
    const before = saved();
    fireEvent.click(buttonText("À gauche"));
    expect(savedEl(0, idOf(0, "title"))!.style.left).toBe("80px");
    expect(savedEl(0, idOf(0, "body"))!.style.left).toBe("80px");
    undo();
    expect(saved()).toEqual(before);
  });
  it("« Centrés » centre les blocs sur la largeur commune", () => {
    withCanvas();
    selectTitleAndBody();
    fireEvent.click(buttonText("Centrés"));
    // Titre 80 → 680 (centre 380), texte 300 → 700 (centre 500) : centre commun 390.
    expect(savedEl(0, idOf(0, "title"))!.style.left).toBe("90px");
    expect(savedEl(0, idOf(0, "body"))!.style.left).toBe("190px");
  });
  it("« Grouper » réunit les deux blocs, « Dégrouper » les rend", () => {
    withCanvas();
    selectTitleAndBody();
    fireEvent.click(buttonText("Grouper"));
    expect(screen.getByLabelText("Choisir le calque Groupe")).toBeTruthy();
    const group = slideDoc(0).querySelector<HTMLElement>(`[data-editor-id="${idOf(0, "title")}"]`)!.parentElement!;
    expect(group.querySelector(`[data-editor-id="${idOf(0, "body")}"]`)).toBeTruthy();
    fireEvent.click(buttonText("Dégrouper"));
    expect(screen.queryByLabelText("Choisir le calque Groupe")).toBeNull();
    expect(screen.getByLabelText("Sélection multiple").textContent).toContain("2 éléments sélectionnés");
  });
});

describe("flèches du clavier dans l'aperçu", () => {
  it("déplacent l'élément choisi de 1 px, de 10 px avec Maj", () => {
    const { doc, title } = withCanvas();
    choose(title, 100, 120);
    key(doc, "ArrowRight");
    expect(savedEl(0, idOf(0, "title"))!.style.left).toBe("81px");
    key(doc, "ArrowDown", { shiftKey: true });
    expect(savedEl(0, idOf(0, "title"))!.style.top).toBe("110px");
  });
  it("déplacent ensemble les éléments d'une sélection multiple", () => {
    const { doc, title, body } = withCanvas();
    choose(title, 100, 120);
    ptr(body, "pointerdown", 320, 420, { shiftKey: true });
    ptr(body, "pointerup", 320, 420, { shiftKey: true });
    key(doc, "ArrowLeft", { shiftKey: true });
    expect(savedEl(0, idOf(0, "title"))!.style.left).toBe("70px");
    expect(savedEl(0, idOf(0, "body"))!.style.left).toBe("290px");
  });
  it("Suppr retire l'élément choisi ; Annuler le remet", () => {
    const { doc, body } = withCanvas();
    const before = saved();
    choose(body, 320, 420);
    key(doc, "Delete");
    expect(savedEl(0, idOf(0, "body"))).toBeNull();
    undo();
    expect(saved()).toEqual(before);
  });
});

describe("boutons des slides", () => {
  it("« Descendre » échange la slide avec la suivante et la garde ouverte ; « Monter » la remet", () => {
    render(<Harness />);
    expect((screen.getByLabelText("Monter la slide") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Descendre la slide"));
    expect(saved().slides.map((s: any) => s.title)).toEqual(["Deux", "Un", undefined]);
    expect(saved().v.map((s: any) => s.slide_number)).toEqual([1, 2, 3]);
    expect(screen.getByLabelText("Sélectionner la slide 2").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByLabelText("Monter la slide"));
    expect(saved().slides.map((s: any) => s.title)).toEqual(["Un", "Deux", undefined]);
  });
  it("« Supprimer » retire la slide ouverte (jamais sous 2 slides) ; Annuler la rend", () => {
    render(<Harness />);
    const before = saved();
    fireEvent.click(screen.getByLabelText("Sélectionner la slide 2"));
    fireEvent.click(buttonText("Supprimer"));
    expect(saved().slides.map((s: any) => s.title)).toEqual(["Un", undefined]);
    expect(buttonText("Supprimer").disabled).toBe(true);
    undo();
    expect(saved()).toEqual(before);
  });
  it("« Verrouiller » verrouille la slide ouverte et désactive ses réglages", () => {
    render(<Harness />);
    fireEvent.click(buttonText("Verrouiller"));
    expect(saved().slides[0].editor_locked).toBe(true);
    expect(screen.getByText("Slide verrouillée : déverrouille-la pour la modifier.")).toBeTruthy();
    expect(buttonText("Déverrouiller")).toBeTruthy();
  });
});

describe("calques : masquer, retirer, remettre", () => {
  it("« Masquer » cache l'élément sans le retirer ; « Afficher » le rend", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Masquer le calque Premier"));
    expect(savedEl(0, idOf(0, "body"))!.style.display).toBe("none");
    fireEvent.click(screen.getByLabelText("Afficher le calque Premier"));
    expect(savedEl(0, idOf(0, "body"))!.style.display).toBe("");
  });
  it("« Retirer » range l'élément dans « Éléments retirés », « Remettre » le rend", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Retirer le calque Premier"));
    expect(savedEl(0, idOf(0, "body"))).toBeNull();
    expect(screen.getByText("Éléments retirés (1)")).toBeTruthy();
    fireEvent.click(buttonText("Remettre"));
    expect(savedEl(0, idOf(0, "body"))!.textContent).toBe("Premier");
    expect(screen.queryByText(/Éléments retirés/)).toBeNull();
  });
});

describe("onglet Slide et réglages de la photo", () => {
  it("« Fond de la slide » change le fond de la slide ouverte seulement", () => {
    render(<Harness />);
    const before = saved();
    fireEvent.change(screen.getByLabelText("Fond de la slide"), { target: { value: "#ffe561" } });
    expect(slideDoc(0).body.firstElementChild!.getAttribute("style")).toMatch(/background-color:\s*(#ffe561|rgb\(255, 229, 97\))/);
    expect(saved().v[1].html).toBe(before.v[1].html);
  });
  it("« Texte sur la photo » place le texte en haut de la slide photo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Sélectionner la slide 3"));
    fireEvent.change(screen.getByLabelText("Texte sur la photo"), { target: { value: "top_left" } });
    const layout = slideDoc(2).querySelector<HTMLElement>("[data-photo-text-layout]")!;
    expect(layout.dataset.photoTextLayout).toBe("top_left");
    expect(layout.style.justifyContent).toBe("flex-start");
  });
  it("« Intensité du voile » règle le voile choisi dans les calques", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Sélectionner la slide 3"));
    const before = saved().v[2].html;
    fireEvent.click(screen.getByLabelText("Choisir le calque Voile sur la photo"));
    const slider = screen.getAllByLabelText("Intensité du voile").find((el) => (el as HTMLInputElement).type === "range")!;
    fireEvent.change(slider, { target: { value: "0.4" } });
    expect(saved().v[2].html).not.toBe(before);
    const veil = getEditorElements(saved().v[2].html).find((e) => e.role === "veil")!;
    expect(veilAlpha(savedEl(2, veil.id)!.getAttribute("style") || "")).toBeCloseTo(0.4);
  });
});

describe("aperçu Instagram", () => {
  it("le bouton ouvre l'aperçu du carrousel", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByLabelText("Aperçu Instagram"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
