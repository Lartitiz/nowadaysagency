import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("@/components/RedFlagsChecker", () => ({ default: () => null }));
vi.mock("@/components/creer/formatRenderers/StoryPhotoSuggestions", () => ({ default: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: () => null }));

afterEach(cleanup);

function sequence(text: string, visual = {}) {
  return { stories: [{ text, face_cam: false, visual: {
    gabarit: "fond_pills", background: "fond_couleur", body_pill: text, ...visual,
  } }] };
}

function editNarration(text: string) {
  const editor = document.querySelector('[contenteditable="true"]')!;
  editor.textContent = text;
  fireEvent.blur(editor);
}

function previewHtml() {
  return screen.getByTitle("Aperçu story 1").getAttribute("srcdoc")!;
}

describe("Stories : édition et remplacement du résultat", () => {
  it("garde le texte saisi sous une citation au-delà de 80 caractères", () => {
    const onStoriesUpdate = vi.fn();
    const text = "Alors je vais fouiller dans les avis 1 étoile. Et je tombe sur cet avis. Rien à voir avec la machine.";
    render(<StoryResult result={sequence("Le récit", { gabarit: "citation", quote: "Une grosse différence de goût", body_pill: "Avis client" })} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.change(screen.getByLabelText("Qui l'a dit"), { target: { value: text } });
    expect(text.length).toBeGreaterThan(80);
    expect(previewHtml()).toContain(text);
    expect(previewHtml()).toContain("Une grosse différence de goût");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].visual.body_pill_edited).toBe(true);
  });

  it("déplace le groupe titre et texte, et conserve la position à la réouverture", () => {
    const onStoriesUpdate = vi.fn();
    const { unmount } = render(<StoryResult result={sequence("La doublure", { title_pill: "Le détail" })} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Haut" }));
    expect(previewHtml()).toContain("justify-content:flex-start");
    expect(previewHtml()).toContain("Le détail");
    fireEvent.click(screen.getByRole("button", { name: "Bas" }));
    const saved = onStoriesUpdate.mock.lastCall?.[0];
    unmount();
    render(<StoryResult result={{ stories: saved }} />);
    expect(previewHtml()).toContain("justify-content:flex-end");
    expect(screen.getByRole("button", { name: "Bas" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Milieu" }));
    expect(previewHtml()).toContain("justify-content:center");
  });

  it("affiche une nouvelle séquence même si le nombre de stories ne change pas", () => {
    const { rerender } = render(<StoryResult result={sequence("Les boutons en nacre")} />);
    rerender(<StoryResult result={sequence("La doublure en coton")} />);
    expect(previewHtml()).toContain("La doublure en coton");
    expect(previewHtml()).not.toContain("Les boutons en nacre");
  });

  it("répercute le texte corrigé dans le visuel et les données sauvegardées", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={sequence("Les boutons en nacre")} onStoriesUpdate={onStoriesUpdate} />);
    editNarration("Les boutons en bois");
    expect(previewHtml()).toContain("Les boutons en bois");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].visual.body_pill).toBe("Les boutons en bois");
  });

  it("répercute la pastille corrigée dans le texte quand ils sont identiques", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={sequence("Les boutons en nacre")} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.change(screen.getByLabelText("Pastille texte"), { target: { value: "Les boutons en bois" } });
    expect(document.querySelector('[contenteditable="true"]')?.textContent).toBe("Les boutons en bois");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].text).toBe("Les boutons en bois");
  });

  it("conserve une pastille personnalisée distincte du texte", () => {
    render(<StoryResult result={sequence("Les boutons en nacre", { body_pill: "Un détail choisi à la main" })} />);
    editNarration("Les boutons en bois");
    expect(previewHtml()).toContain("Un détail choisi à la main");
  });

  it("ne remplace pas l’attribution d’une citation par le texte narratif", () => {
    render(<StoryResult result={sequence("Camille", { gabarit: "citation", quote: "Le col tombe parfaitement" })} />);
    editNarration("Camille a essayé la chemise");
    expect(screen.getByLabelText("Qui l'a dit")).toHaveValue("Camille");
  });

  it("garde une édition locale quand le parent renvoie le même contenu", () => {
    const initial = sequence("Les boutons en nacre");
    const { rerender } = render(<StoryResult result={initial} />);
    fireEvent.change(screen.getByLabelText("Pastille texte"), { target: { value: "Les boutons en bois" } });
    rerender(<StoryResult result={JSON.parse(JSON.stringify(initial))} />);
    expect(previewHtml()).toContain("Les boutons en bois");
  });
});
