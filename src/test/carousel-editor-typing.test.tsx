// Chantier T (18/10/2026) : un mot tapé directement sur la slide est enregistré
// sans avoir à cliquer ailleurs. Avant, il ne partait qu'à la fin de la saisie :
// un rechargement le perdait alors que l'encadré affichait « Tout est enregistré ».
// Ici on rend le vrai éditeur, on tape dans la slide et on relit sa sortie.
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import CarouselEditor from "@/components/creer/CarouselEditor";
import CarouselSaveStatus from "@/components/creer/CarouselSaveStatus";
import { TYPING_PAUSE_MS } from "@/components/creer/CarouselEditorParts/inline-typing";
import { readCarouselDocument } from "@/lib/carousel-editor";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
beforeAll(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
let width: { mockRestore: () => void };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
});
afterEach(() => {
  cleanup();
  width.mockRestore();
  vi.useRealTimers();
});

const raw = {
  slides: [
    { slide_number: 1, title: "Mon atelier", body: "Une idée simple." },
    { slide_number: 2, title: "La suite", body: "Une autre idée" },
  ],
  caption: { body: "Une légende" },
};
const visuals = [
  {
    slide_number: 1,
    html: '<div style="position:relative;width:1080px;height:1350px"><h1 data-slide-text="title">Mon <em>atelier</em></h1><p data-slide-text="body">Une idée simple.</p></div>',
  },
  { slide_number: 2, html: '<div><h1 data-slide-text="title">La suite</h1><p data-slide-text="body">Une autre idée</p></div>' },
];
// L'encadré de sauvegarde tel qu'affiché quand le compte a tout reçu.
const saved = { enabled: true, status: "saved", history: [], flush: async () => true, restore: async () => {}, saveCopy: () => {} };

function Harness() {
  const [r, setR] = useState<unknown>(raw),
    [v, setV] = useState(visuals);
  return (
    <MemoryRouter>
      <output data-testid="saved">{JSON.stringify({ r, v })}</output>
      <CarouselSaveStatus save={saved as never} />
      <CarouselEditor
        result={r}
        visualSlides={v}
        onChange={(next, vs) => {
          setR(next);
          setV(vs);
        }}
      />
    </MemoryRouter>
  );
}
const output = () => JSON.parse(screen.getByTestId("saved").textContent!) as { r: typeof raw; v: { html: string }[] };
const status = () => screen.getByLabelText("Sauvegarde automatique").textContent;

/** Ouvre la slide 1 dans l'aperçu et double-clique sur son titre. */
function startTyping() {
  render(<Harness />);
  const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
  const doc = iframe.contentDocument!;
  // jsdom ne charge pas srcdoc : on y pose la slide telle qu'affichée.
  doc.body.innerHTML = readCarouselDocument(raw, visuals).slides[0].html;
  fireEvent.load(iframe);
  const title = doc.querySelector<HTMLElement>('[data-slide-text="title"]')!;
  fireEvent.dblClick(title, { clientX: 10, clientY: 10 });
  return { doc, title };
}
/** Tape `text` à la fin du titre, comme le clavier : texte ajouté puis événement input. */
function type(doc: Document, title: HTMLElement, text: string) {
  title.append(doc.createTextNode(text));
  fireEvent.input(title, { data: text.slice(-1), inputType: "insertText" });
}

describe("texte tapé sur la slide", () => {
  it("place le curseur sans tout sélectionner au double-clic", () => {
    const { doc, title } = startTyping();
    expect(title.getAttribute("contenteditable")).toMatch(/plaintext-only|true/);
    const sel = doc.defaultView!.getSelection()!;
    expect(sel.isCollapsed).toBe(true);
    expect(title.contains(sel.anchorNode)).toBe(true);
  });

  it("enregistre le mot après une pause, sans cliquer ailleurs, et l'encadré ne ment pas", () => {
    const { doc, title } = startTyping();
    expect(status()).toContain("Tout est enregistré");
    type(doc, title, " DANSLASLIDE");
    // Pendant la frappe : rien n'est encore parti, l'encadré le dit.
    expect(output().r.slides[0].title).toBe("Mon atelier");
    expect(status()).toContain("Enregistrement en cours");
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS + 10));
    // La sortie de l'éditeur (ce que la sauvegarde envoie au compte) a le mot.
    expect(output().r.slides[0].title).toBe("Mon atelier DANSLASLIDE");
    expect(output().v[0].html).toContain("<em>atelier</em> DANSLASLIDE");
    expect(status()).toContain("Tout est enregistré");
    // La saisie continue : le titre est toujours modifiable.
    expect(title.getAttribute("contenteditable")).toMatch(/plaintext-only|true/);
  });

  it("enregistre aussitôt à la fin d'un mot, et avant de quitter la page", () => {
    const { doc, title } = startTyping();
    type(doc, title, " un ");
    act(() => vi.advanceTimersByTime(0));
    expect(output().r.slides[0].title).toBe("Mon atelier un ");
    type(doc, title, "mot");
    const leave = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(leave);
    });
    expect(output().r.slides[0].title).toBe("Mon atelier un mot");
    // Le navigateur demande « Quitter le site ? » le temps que la sauvegarde parte.
    expect(leave.defaultPrevented).toBe(true);
  });

  it("une saisie se défait en une fois avec Annuler, sans étape vide à la fin", () => {
    const { doc, title } = startTyping();
    type(doc, title, " premier ");
    act(() => vi.advanceTimersByTime(0));
    type(doc, title, "second");
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS + 10));
    expect(output().r.slides[0].title).toBe("Mon atelier premier second");
    // Fin de la saisie (Échap) : le texte est déjà enregistré, rien ne change.
    fireEvent.keyDown(doc, { key: "Escape" });
    expect(title.hasAttribute("contenteditable")).toBe(false);
    expect(output().r.slides[0].title).toBe("Mon atelier premier second");
    fireEvent.click(screen.getByLabelText("Annuler la modification"));
    expect(output().r.slides[0].title).toBe("Mon atelier");
  });

  it("un titre vidé revient à son texte d'origine", () => {
    const { doc, title } = startTyping();
    type(doc, title, " brouillon");
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS + 10));
    expect(output().r.slides[0].title).toBe("Mon atelier brouillon");
    title.innerHTML = "";
    fireEvent.input(title, { inputType: "deleteContentBackward" });
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS + 10));
    fireEvent.keyDown(doc, { key: "Escape" });
    expect(output().r.slides[0].title).toBe("Mon atelier");
    expect(title.innerHTML).toBe("Mon <em>atelier</em>");
  });
});
