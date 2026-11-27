// Volet téléphone des stories (27/11/2026), le même que celui du carrousel
// (src/hooks/use-phone-sheet.ts) : sur téléphone, ouvrir un onglet du panneau ou toucher une
// case met la story en petit en haut et cache les vignettes ; « Terminé » rend sa taille à la
// story. Sur ordinateur, rien ne change.
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";
import { setCarouselSheet, useCarouselSheet } from "@/lib/carousel-editor-shown";

vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock("@/hooks/use-user-photos", () => {
  const data: unknown[] = [];
  return { useUserPhotos: () => ({ data }) };
});
vi.mock("@/hooks/use-open-in-canva", () => ({ useOpenInCanva: () => ({ openInCanva: vi.fn(), openingCanva: false }) }));
vi.mock("@/lib/story-photos", () => ({ resolveLibraryPhotoUrls: async () => new Map(), urlToDataUrl: async (url: string) => url }));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: async () => new Map() }));
vi.mock("@/lib/export-carousel-png", () => ({ exportStoryPng: vi.fn() }));
vi.mock("@/lib/export-story-pptx", () => ({ exportStoryPptx: vi.fn() }));
vi.mock("@/components/RedFlagsChecker", () => ({ default: () => null, fixRedFlags: (text: string) => text }));
vi.mock("@/components/creer/formatRenderers/StoryPhotoSuggestions", () => ({ default: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: () => null }));

beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
const width = window.innerWidth;
afterEach(() => {
  cleanup();
  act(() => setCarouselSheet(false));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
});

const stories = ["Première story", "Deuxième story"].map((text) => ({
  text, face_cam: false, visual: { gabarit: "fond_pills", background: "fond_couleur", body_pill: text },
}));
function Harness() {
  const [list, setList] = useState<any[]>(stories);
  const sheet = useCarouselSheet();
  return (<><output data-testid="sheet">{String(sheet)}</output>
    <StoryResult result={{ stories: list }} onStoriesUpdate={setList} /></>);
}
const onPhone = () => Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
const sheet = () => screen.getByTestId("sheet").textContent;
const panel = () => within(document.querySelector('[data-story-panel="1"]') as HTMLElement);
const preview = () => document.querySelector('[data-story-direct-controls="1"]') as HTMLElement;

describe("volet de réglages des stories sur téléphone", () => {
  it("un onglet ouvre le volet : story en petit, vignettes cachées ; « Terminé » le referme", () => {
    onPhone();
    render(<Harness />);
    expect(sheet()).toBe("false");
    expect(screen.queryByRole("button", { name: "Terminé" })).toBeNull();
    const big = preview().style.width;
    fireEvent.click(panel().getByRole("tab", { name: "Texte" }));
    expect(sheet()).toBe("true");
    expect(document.querySelector("[data-story-strip]")).toBeNull();
    expect(parseInt(preview().style.width)).toBeLessThan(parseInt(big));
    fireEvent.click(panel().getByRole("button", { name: "Terminé" }));
    expect(sheet()).toBe("false");
    expect(document.querySelector("[data-story-strip]")).not.toBeNull();
    expect(preview().style.width).toBe(big);
  });

  it("toucher une case de texte ouvre le volet, et la frappe reste enregistrée", () => {
    onPhone();
    render(<Harness />);
    const field = panel().getByLabelText("Texte complet de la story 1");
    fireEvent.focus(field);
    expect(sheet()).toBe("true");
    fireEvent.change(panel().getByLabelText("Texte complet de la story 1"), { target: { value: "Texte changé" } });
    expect((panel().getByLabelText("Texte complet de la story 1") as HTMLTextAreaElement).value).toBe("Texte changé");
  });

  it("l'onglet « Demander à l'IA » ouvre le volet avec le champ et le bouton « Refaire cette story »", () => {
    onPhone();
    render(<Harness />);
    expect(panel().getByPlaceholderText(/Facultatif/)).not.toBeVisible();
    fireEvent.click(panel().getByRole("tab", { name: "Demander à l’IA" }));
    expect(sheet()).toBe("true");
    expect(panel().getByText("Demander un changement à l'IA")).toBeVisible();
    expect(panel().getByRole("button", { name: /Refaire cette story/ })).toBeVisible();
    // Les réglages de texte laissent la place à la demande.
    expect(panel().getByLabelText("Texte complet de la story 1")).not.toBeVisible();
    fireEvent.click(panel().getByRole("tab", { name: "Texte" }));
    expect(panel().getByLabelText("Texte complet de la story 1")).toBeVisible();
  });

  it("quitter l'écran referme le volet (les barres du bas reviennent)", () => {
    onPhone();
    const view = render(<Harness />);
    fireEvent.click(panel().getByRole("tab", { name: "Texte" }));
    expect(sheet()).toBe("true");
    view.unmount();
    let open = true;
    function Probe() { open = useCarouselSheet(); return null; }
    render(<Probe />);
    expect(open).toBe(false);
  });

  it("ordinateur : un onglet ou une case n'ouvre pas de volet", () => {
    render(<Harness />);
    fireEvent.click(panel().getByRole("tab", { name: "Texte" }));
    fireEvent.focus(panel().getByLabelText("Texte complet de la story 1"));
    expect(sheet()).toBe("false");
    expect(screen.queryByRole("button", { name: "Terminé" })).toBeNull();
    expect(document.querySelector("[data-story-strip]")).not.toBeNull();
    // Ordinateur : pas d'onglet IA, la demande reste collée en bas du panneau.
    expect(panel().queryByRole("tab", { name: "Demander à l’IA" })).toBeNull();
    expect(panel().getByRole("button", { name: /Refaire cette story/ })).toBeInTheDocument();
  });
});
