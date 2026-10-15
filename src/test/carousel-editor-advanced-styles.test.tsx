// Lot E2 (14/10/2026) : on fige le comportement de l'éditeur avant son découpage.
// Réglages avancés du panneau « Élément » : rotation, retouche photo (filtres),
// ombre portée, ombre du texte et choix de police (Google Fonts).
import React, { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
// Sections repliées par défaut : ces tests les ouvrent.
beforeEach(() => {
  window.localStorage.setItem("carousel-editor:mode", "complet"); // panneau complet (« Plus d'outils »), chantier D
  for (const title of ["Calques", "Typographie avancée", "Retouche de la photo", "Toutes les slides"])
    window.localStorage.setItem(`carousel-panel:${title}`, "1");
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.document.head.querySelectorAll("link[data-font-preview]").forEach((l) => l.remove());
});

const raw = { slides: [{ slide_number: 1, title: "Titre", body: "Corps" }, { slide_number: 2, title: "Suite", body: "Fin" }], caption: { body: "L" } };
const visuals = [
  {
    slide_number: 1,
    html:
      '<div style="position:relative;width:1080px;height:1350px">' +
      '<div data-pptx-photo="1" style="position:absolute;left:0;top:0;width:540px;height:1350px;background-image:url(&quot;https://example.com/p.jpg&quot;);background-size:cover"></div>' +
      '<h1 data-slide-text="title" data-pptx-editable="title" style="position:absolute;left:600px;top:100px">Titre</h1>' +
      '<p data-slide-text="body" data-pptx-editable="body" style="position:absolute;left:600px;top:400px;transform:translateX(10px)">Corps</p></div>',
  },
  { slide_number: 2, html: '<div><h1 data-slide-text="title" data-pptx-editable="title">Suite</h1><p data-slide-text="body" data-pptx-editable="body">Fin</p></div>' },
];
function Harness({ lockSecond = false }: { lockSecond?: boolean }) {
  const start = lockSecond ? { ...raw, slides: [raw.slides[0], { ...raw.slides[1], editor_locked: true }] } : raw;
  const [r, setR] = useState<any>(start), [v, setV] = useState(visuals);
  return (
    <>
      <output data-testid="saved">{JSON.stringify(v)}</output>
      <CarouselEditor result={r} visualSlides={v} onChange={(a, b) => { setR(a); setV(b); }} />
    </>
  );
}
const saved = (n = 0) => new DOMParser().parseFromString(JSON.parse(screen.getByTestId("saved").textContent!)[n].html, "text/html");
const title = (n = 0) => saved(n).querySelector<HTMLElement>('[data-slide-text="title"]')!;
const photo = () => saved().querySelector<HTMLElement>("[data-pptx-photo]")!;
const chooseLayer = (name: RegExp) => fireEvent.click(screen.getByLabelText(name));
// Chaque réglage a un curseur et une case chiffrée : on vise le curseur.
const slider = (label: string) => window.document.querySelector<HTMLInputElement>(`input[type="range"][aria-label="${label}"]`)!;
const setRange = (label: string, value: number) => fireEvent.change(slider(label), { target: { value: String(value) } });
const undo = () => fireEvent.click(screen.getByLabelText("Annuler la modification"));
const redo = () => fireEvent.click(screen.getByLabelText("Rétablir la modification"));
const button = (text: string) => screen.getByText(text).closest("button")!;
const fontOptions = () => Array.from(screen.getByLabelText("Polices").querySelectorAll<HTMLElement>('[role="option"]'));

describe("rotation", () => {
  it("tourne un texte, remplace l'angle au lieu de l'additionner et revient à droit à 0", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Titre/);
    setRange("Rotation", 15);
    expect(title().style.transform).toBe("rotate(15deg)");
    expect(title().style.getPropertyValue("--editor-rotate")).toBe("15deg");
    expect(screen.getByText(/dans l’export PowerPoint, un texte tourné reste droit/)).toBeTruthy();
    setRange("Rotation", -30);
    expect(title().style.transform).toBe("rotate(-30deg)");
    setRange("Rotation", 0);
    expect(title().style.transform).toBe("none");
    expect(screen.queryByText(/un texte tourné reste droit/)).toBeNull();
  });
  it("garde une transformation existante sous la rotation, et la rend intacte à 0", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Corps/);
    const body = () => saved().querySelector<HTMLElement>('[data-slide-text="body"]')!;
    setRange("Rotation", 20);
    expect(body().style.transform).toBe("translateX(10px) rotate(20deg)");
    expect(body().style.getPropertyValue("--editor-base-transform")).toBe("translateX(10px)");
    setRange("Rotation", 5);
    expect(body().style.transform).toBe("translateX(10px) rotate(5deg)");
    setRange("Rotation", 0);
    expect(body().style.transform).toBe("translateX(10px)");
  });
  it("des réglages de rotation rapprochés s'annulent en une seule fois, puis se rétablissent", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Titre/);
    setRange("Rotation", 10);
    setRange("Rotation", 20);
    setRange("Rotation", 45);
    undo();
    expect(title().style.transform).toBe("");
    redo();
    expect(title().style.transform).toBe("rotate(45deg)");
  });
});

describe("retouche de la photo (filtres)", () => {
  it("luminosité, contraste et saturation s'écrivent ensemble dans un seul filtre", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Photo/);
    setRange("Luminosité", 1.2);
    expect(photo().style.filter).toBe("brightness(1.2) contrast(1) saturate(1)");
    setRange("Contraste", 0.8);
    expect(photo().style.filter).toBe("brightness(1.2) contrast(0.8) saturate(1)");
  });
  it("« Noir et blanc » met la saturation à 0, un second clic la remet ; « Photo d’origine » efface tout", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Photo/);
    fireEvent.click(button("Noir et blanc"));
    expect(photo().style.filter).toBe("brightness(1) contrast(1) saturate(0)");
    expect(button("Noir et blanc").getAttribute("aria-pressed")).toBe("true");
    setRange("Luminosité", 1.1);
    fireEvent.click(button("Noir et blanc"));
    expect(photo().style.filter).toBe("brightness(1.1) contrast(1) saturate(1)");
    fireEvent.click(button("Photo d’origine"));
    expect(photo().style.filter).toBe("");
  });
  it("revenir aux valeurs neutres retire le filtre (pas de « brightness(1) » inutile)", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Photo/);
    setRange("Luminosité", 1.3);
    setRange("Luminosité", 1);
    expect(photo().style.filter).toBe("");
  });
  it("la photo garde son image et son numéro d'export après retouche", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Photo/);
    setRange("Saturation", 1.5);
    expect(photo().getAttribute("data-pptx-photo")).toBe("1");
    expect(photo().style.backgroundImage).toContain("example.com/p.jpg");
  });
});

describe("ombres", () => {
  it("ombre portée d'un bloc : aucune, douce, marquée", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Titre/);
    const select = screen.getByLabelText("Ombre portée") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "douce" } });
    expect(title().style.boxShadow).toMatch(/0(px)? 8px 24px rgba\(0, ?0, ?0, ?0\.18\)/);
    expect((screen.getByLabelText("Ombre portée") as HTMLSelectElement).value).toBe("douce");
    fireEvent.change(select, { target: { value: "marquee" } });
    expect(title().style.boxShadow).toMatch(/0(px)? 16px 40px rgba\(0, ?0, ?0, ?0\.35\)/);
    expect((screen.getByLabelText("Ombre portée") as HTMLSelectElement).value).toBe("marquee");
    fireEvent.change(select, { target: { value: "none" } });
    expect(title().style.boxShadow).toBe("none");
  });
  it("ombre du texte : case à cocher, s'active et se retire", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Titre/);
    fireEvent.click(screen.getByLabelText("Ombre du texte"));
    expect(title().style.textShadow).toMatch(/0(px)? 2px 10px rgba\(0, ?0, ?0, ?0\.45\)/);
    expect((screen.getByLabelText("Ombre du texte") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Ombre du texte"));
    expect(title().style.textShadow).toBe("none");
  });
});

describe("choix de police (Google Fonts)", () => {
  const pick = (label: string) => {
    if (!screen.queryByLabelText("Polices")) fireEvent.click(screen.getByLabelText("Choisir une police"));
    fireEvent.click(fontOptions().find((o) => o.textContent!.startsWith(label))!);
  };
  it("ouvrir la liste charge l'aperçu des polices une seule fois dans la page", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Titre/);
    fireEvent.click(screen.getByLabelText("Choisir une police"));
    expect(window.document.head.querySelectorAll("link[data-font-preview]")).toHaveLength(1);
    fireEvent.keyDown(window.document.activeElement || window.document.body, { key: "Escape" });
    fireEvent.click(screen.getByLabelText("Choisir une police"));
    expect(window.document.head.querySelectorAll("link[data-font-preview]")).toHaveLength(1);
  });
  it("la recherche filtre la liste", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Titre/);
    fireEvent.click(screen.getByLabelText("Choisir une police"));
    fireEvent.change(screen.getByLabelText("Chercher une police"), { target: { value: "playf" } });
    expect(fontOptions().map((o) => o.textContent)).toEqual(["Playfair DisplaySerif"]);
  });
  it("une police Google s'écrit sur le texte et sa feuille de style est ajoutée à la slide, une seule fois", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Titre/);
    pick("Playfair Display");
    expect(title().style.fontFamily).toMatch(/^["']Playfair Display["'], serif$/);
    expect(saved().querySelectorAll('link[href*="Playfair+Display"]')).toHaveLength(1);
    expect(screen.getByLabelText("Choisir une police").textContent).toContain("Playfair Display");
    pick("Playfair Display");
    expect(saved().querySelectorAll('link[href*="Playfair+Display"]')).toHaveLength(1);
    // L'autre slide n'est pas touchée.
    expect(saved(1).querySelectorAll('link[href*="Playfair+Display"]')).toHaveLength(0);
  });
  it("une police classique ne charge rien", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Titre/);
    pick("Georgia");
    expect(title().style.fontFamily).toMatch(/Georgia/);
    expect(saved().querySelectorAll("link")).toHaveLength(0);
  });
  it("« Police et couleur sur toutes les slides » emporte la police Google sur chaque slide", () => {
    render(<Harness />);
    chooseLayer(/Choisir le calque Titre/);
    pick("Playfair Display");
    fireEvent.click(button("Police et couleur sur toutes les slides"));
    expect(title(1).style.fontFamily).toMatch(/Playfair Display/);
    expect(saved(1).querySelectorAll('link[href*="Playfair+Display"]')).toHaveLength(1);
    expect(saved().querySelectorAll('link[href*="Playfair+Display"]')).toHaveLength(1);
    undo();
    expect(title(1).style.fontFamily).not.toMatch(/Playfair/);
    expect(saved(1).querySelectorAll('link[href*="Playfair+Display"]')).toHaveLength(0);
  });
  it("une slide verrouillée ne reçoit pas le lien de la police Google (corrigé après le lot E2)", () => {
    render(<Harness lockSecond />);
    chooseLayer(/Choisir le calque Titre/);
    pick("Playfair Display");
    const lockedBefore = saved(1).body.innerHTML;
    fireEvent.click(button("Police et couleur sur toutes les slides"));
    expect(title(1).style.fontFamily).not.toMatch(/Playfair/);
    expect(saved(1).querySelectorAll('link[href*="Playfair+Display"]')).toHaveLength(0);
    expect(saved(1).body.innerHTML).toBe(lockedBefore);
    // La slide non verrouillée, elle, a bien sa police.
    expect(saved(0).querySelectorAll('link[href*="Playfair+Display"]')).toHaveLength(1);
  });
});
