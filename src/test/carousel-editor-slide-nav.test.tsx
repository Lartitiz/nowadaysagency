// Retour d'une cliente en rendez-vous (19/11/2026) : difficile de passer d'une
// slide à l'autre dans l'éditeur. Flèches ‹ › dans l'en-tête, et ← → au clavier
// quand rien n'est choisi sur la slide.
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { readCarouselDocument } from "@/lib/carousel-editor";

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
  // Éditeur facile (20/11/2026) : les flèches sont à côté de la slide (plus dans la ligne du
  // haut), le compteur dit « Slide 1 sur 3 », et le téléphone a un point par slide.
  it("les flèches à côté de la slide avancent et reculent, bornées aux extrémités ; le compteur suit", () => {
    render(<Harness />);
    const header = screen.getByRole("group", { name: "Personnaliser mon carrousel" });
    expect(within(header).queryByRole("button", { name: "Slide précédente" })).toBeNull();
    expect(opened()).toBe(1);
    expect(screen.getByTestId("slide-count").textContent).toBe("Slide 1 sur 3");
    fireEvent.click(screen.getByRole("button", { name: "Slide suivante" }));
    fireEvent.click(screen.getByRole("button", { name: "Slide suivante" }));
    expect(opened()).toBe(3);
    expect(screen.queryByRole("button", { name: "Slide suivante" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Slide précédente" }));
    expect(opened()).toBe(2);
    expect(screen.getByTestId("slide-count").textContent).toBe("Slide 2 sur 3");
  });

  it("téléphone : un point par slide, « Toutes » ouvre les vignettes et un choix les referme", () => {
    render(<Harness />);
    const dots = within(screen.getByTestId("slide-dots")).getAllByRole("button");
    expect(dots).toHaveLength(3);
    expect(dots[0].getAttribute("aria-current")).toBe("true");
    fireEvent.click(dots[2]);
    expect(opened()).toBe(3);
    // Le « + » n'est pas dans la liste des slides (les robots de la visite y comptent les vignettes).
    expect(screen.getByLabelText("Slides du carrousel").querySelectorAll(":scope > button")).toHaveLength(3);
    const strip = screen.getByLabelText("Slides du carrousel").parentElement!;
    expect(strip.className).toContain("hidden");
    const toggle = screen.getByTestId("all-slides-toggle");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(strip.className).not.toMatch(/(^| )hidden( |$)/);
    fireEvent.click(screen.getByRole("button", { name: "Sélectionner la slide 1" }));
    expect(opened()).toBe(1);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
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

  // Éditeur facile (20/11/2026) : sur téléphone, un doigt qui glisse sur la slide passe à la
  // voisine tant que rien n'est choisi ; un simple toucher choisit toujours l'élément.
  it("téléphone : glisser le doigt sur la slide change de slide, toucher un texte le choisit", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
    render(<Harness />);
    const bind = (n: number) => {
      const iframe = screen.getByTitle(`Éditeur de la slide ${n}`) as HTMLIFrameElement;
      iframe.contentDocument!.body.innerHTML = readCarouselDocument(raw, [1, 2, 3].map(slide)).slides[n - 1].html;
      fireEvent.load(iframe);
      const h1 = iframe.contentDocument!.querySelector<HTMLElement>("h1")!;
      h1.getBoundingClientRect = () => ({ left: 100, top: 500, width: 800, height: 200, right: 900, bottom: 700, x: 100, y: 500, toJSON: () => ({}) }) as DOMRect;
      return h1;
    };
    // jsdom n'a pas de PointerEvent : un évènement simple, avec les champs lus par l'éditeur.
    const send = (el: HTMLElement, type: string, clientX: number, clientY: number) =>
      act(() => { el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType: "touch", button: 0, clientX, clientY })); });
    const touch = (el: HTMLElement, from: number, to: number, dy = 0) => {
      send(el, "pointerdown", from, 600);
      if (to !== from || dy) send(el, "pointermove", to, 600 + dy);
      send(el, "pointerup", to, 600 + dy);
    };
    // Vers la gauche : slide suivante. Le texte sous le doigt ne bouge pas, rien n'est choisi.
    let title = bind(1);
    touch(title, 800, 400);
    expect(opened()).toBe(2);
    expect(screen.queryByLabelText("Texte sélectionné")).toBeNull();
    // Vers la droite : slide précédente.
    title = bind(2);
    touch(title, 300, 700);
    expect(opened()).toBe(1);
    // Trop court, ou surtout vertical : rien ne change.
    title = bind(1);
    touch(title, 500, 440);
    touch(title, 500, 300, 400);
    expect(opened()).toBe(1);
    // Un toucher sans glisser choisit le texte ; ensuite le doigt le déplace (plus de changement de slide).
    touch(title, 500, 500);
    expect(screen.getByLabelText("Texte sélectionné")).toBeTruthy();
    touch(bind(1), 800, 400);
    expect(opened()).toBe(1);
    width.mockRestore();
  });
});
