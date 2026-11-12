// Téléphone (12/11/2026) : les actions d'une story (Refaire, Avant, Après,
// Dupliquer, Ajouter, Supprimer) sont regroupées dans un menu « … » pour que
// l'aperçu reste sur le premier écran. Sur ordi, les boutons restent visibles
// (couvert par story-result-sequence-gestures et story-result-editing).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";

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
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));

const initialWidth = window.innerWidth;
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: initialWidth });
});

const story = (text: string): any => ({
  text, face_cam: false, visual: { gabarit: "fond_pills", background: "fond_couleur", body_pill: text },
});
const three = () => ({ stories: [story("Première"), story("Deuxième"), story("Troisième")] });
const texts = (list: any[]) => list.map((s) => s.text);

function openMenu(n: number) {
  const trigger = screen.getByRole("button", { name: `Actions sur la story ${n}` });
  act(() => {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  });
  // Selon la version de Radix, le menu s'ouvre au pointerdown ou au clavier.
  if (!screen.queryByRole("menu")) fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("menu");
}

describe("Stories sur téléphone : menu « … »", () => {
  it("cache les boutons d'action et les regroupe dans le menu", () => {
    render(<StoryResult result={three()} />);
    expect(screen.queryByRole("button", { name: "Dupliquer la story 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refaire cette story \(story 1\)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer la story" })).not.toBeInTheDocument();
    const menu = openMenu(1);
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent?.trim());
    expect(items).toEqual([
      "Refaire cette story", "Placer avant", "Placer après", "Dupliquer", "Ajouter une story après", "Supprimer la story",
    ]);
    expect(screen.getByRole("menuitem", { name: "Placer avant" })).toHaveAttribute("data-disabled");
  });

  it("déplace, duplique et ajoute depuis le menu", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={three()} onStoriesUpdate={onStoriesUpdate} />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Placer après" }));
    expect(texts(onStoriesUpdate.mock.lastCall![0])).toEqual(["Deuxième", "Première", "Troisième"]);
    openMenu(2);
    fireEvent.click(screen.getByRole("menuitem", { name: "Dupliquer" }));
    expect(texts(onStoriesUpdate.mock.lastCall![0])).toEqual(["Deuxième", "Première", "Première", "Troisième"]);
    openMenu(3);
    fireEvent.click(screen.getByRole("menuitem", { name: "Ajouter une story après" }));
    expect(texts(onStoriesUpdate.mock.lastCall![0])).toEqual(["Deuxième", "Première", "Première", "", "Troisième"]);
  });

  it("ouvre la fenêtre Refaire et la confirmation de suppression hors du menu", () => {
    render(<StoryResult result={three()} />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Refaire cette story" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByTestId("story-redo-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Supprimer la story" }));
    expect(screen.getByText("Supprimer la story 1 ?")).toBeInTheDocument();
  });
});
