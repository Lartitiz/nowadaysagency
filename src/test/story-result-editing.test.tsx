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

function sequence(text: string, visual = {}): any {
  return { stories: [{ text, face_cam: false, visual: {
    gabarit: "fond_pills", background: "fond_couleur", body_pill: text, ...visual,
  } }] };
}

function editNarration(text: string) {
  fireEvent.change(screen.getByLabelText("Texte complet de la story 1"), { target: { value: text } });
}

function previewHtml() {
  return screen.getByTitle("Aperçu story 1").getAttribute("srcdoc")!;
}

describe("Stories : édition et remplacement du résultat", () => {
  it("met à jour le contexte complet visible d’une citation", () => {
    const initial = "Alors tu vas voir les avis 1 étoile. Et là tu tombes sur : une vraie différence de goût. Tu ris.";
    render(<StoryResult result={sequence(initial, { gabarit: "citation", quote: "une vraie différence de goût", body_pill: "Avis client" })} />);
    expect(previewHtml()).toContain("Alors tu vas voir les avis 1 étoile");
    editNarration("Alors tu lis l'avis. Et là : une vraie différence de goût. Ça n'a rien à voir avec la machine.");
    expect(previewHtml()).toContain("Alors tu lis l'avis");
    expect(previewHtml()).toContain("Ça n'a rien à voir avec la machine");
  });

  it("garde le texte saisi sous une citation au-delà de 80 caractères", () => {
    const onStoriesUpdate = vi.fn();
    const text = "Alors je vais fouiller dans les avis 1 étoile. Et je tombe sur cet avis. Rien à voir avec la machine.";
    render(<StoryResult result={sequence("Le récit", { gabarit: "citation", quote: "Une grosse différence de goût", body_pill: "Avis client" })} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.change(screen.getByLabelText("Petit texte sous la citation"), { target: { value: text } });
    expect(text.length).toBeGreaterThan(80);
    expect(previewHtml()).toContain(text);
    expect(previewHtml()).toContain("Une grosse différence de goût");
    expect(previewHtml()).toContain("Le récit");
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
    fireEvent.change(screen.getByLabelText("Texte affiché"), { target: { value: "Les boutons en bois" } });
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue("Les boutons en bois");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].text).toBe("Les boutons en bois");
  });

  it("conserve une pastille personnalisée distincte du texte", () => {
    render(<StoryResult result={sequence("Les boutons en nacre", {
      body_pill: "Un détail choisi à la main",
      body_pill_edited: true,
    })} />);
    editNarration("Les boutons en bois");
    expect(previewHtml()).toContain("Un détail choisi à la main");
  });

  it("ne remplace pas l’attribution d’une citation par le texte narratif", () => {
    render(<StoryResult result={sequence("Camille", { gabarit: "citation", quote: "Le col tombe parfaitement" })} />);
    editNarration("Camille a essayé la chemise");
    expect(screen.getByLabelText("Petit texte sous la citation")).toHaveValue("Camille");
  });

  it("garde une édition locale quand le parent renvoie le même contenu", () => {
    const initial = sequence("Les boutons en nacre");
    const { rerender } = render(<StoryResult result={initial} />);
    fireEvent.change(screen.getByLabelText("Texte affiché"), { target: { value: "Les boutons en bois" } });
    rerender(<StoryResult result={JSON.parse(JSON.stringify(initial))} />);
    expect(previewHtml()).toContain("Les boutons en bois");
  });

  it("rend le texte complet clairement modifiable même quand il est vide", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={sequence("")} onStoriesUpdate={onStoriesUpdate} />);
    const field = screen.getByLabelText("Texte complet de la story 1");
    expect(field).toBeVisible();
    fireEvent.change(field, { target: { value: "Une nouvelle accroche parlée" } });
    expect(onStoriesUpdate.mock.lastCall?.[0][0].text).toBe("Une nouvelle accroche parlée");
    fireEvent.change(field, { target: { value: "" } });
    expect(field).toHaveValue("");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].text).toBe("");
  });

  it("répercute une citation modifiée dans le récit complet et garde le contexte", () => {
    const onStoriesUpdate = vi.fn();
    const initial = "Tu lis les avis. Et là : une vraie différence de goût. Tu ris.";
    render(<StoryResult result={sequence(initial, { gabarit: "citation", quote: "une vraie différence de goût", body_pill: "Avis client" })} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.change(screen.getByLabelText("Citation mise en avant"), { target: { value: "le café a un goût incroyable" } });
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue(
      "Tu lis les avis. Et là : le café a un goût incroyable. Tu ris.",
    );
    expect(previewHtml()).toContain("Tu lis les avis");
    expect(previewHtml()).toContain("le café a un goût incroyable");
    expect(previewHtml()).toContain("Tu ris");
  });

  it("permet de modifier chaque élément d’une liste", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={sequence("Trois détails", { gabarit: "liste", title_pill: "À regarder", list_pills: ["Le prix", "Les avis"] })} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.change(screen.getByLabelText("Élément 2 de la liste"), { target: { value: "Les avis récents" } });
    expect(previewHtml()).toContain("Les avis récents");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].visual.list_pills[1]).toBe("Les avis récents");
  });

  it("permet de modifier chaque option d’un sticker", () => {
    const onStoriesUpdate = vi.fn();
    const result = sequence("Tu aurais vérifié ?", { gabarit: "interaction" });
    result.stories[0].sticker = { type: "sondage", options: ["Oui", "Jamais"] };
    render(<StoryResult result={result} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.change(screen.getByLabelText("Option 2 du sticker de la story 1"), { target: { value: "Pas du tout" } });
    expect(previewHtml()).toContain("Pas du tout");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].sticker.options[1]).toBe("Pas du tout");
  });

  it("propose le texte complet dans le champ visuel quand l’IA l’a raccourci", () => {
    const full = "Sauf que ce petit avis inutile te rassure plus qu'il ne te fait fuir. Des études le montrent : ça sonne vrai.";
    render(<StoryResult result={sequence(full, { body_pill: "Une perfection qui paraît suspecte" })} />);
    expect(screen.getByLabelText("Texte affiché")).toHaveValue(full);
    expect(previewHtml()).toContain(full);
    expect(previewHtml()).not.toContain("Une perfection qui paraît suspecte");
  });

  it("garde la possibilité de raccourcir volontairement le texte du visuel", () => {
    render(<StoryResult result={sequence("Le texte complet de départ", { body_pill: "Résumé généré" })} />);
    fireEvent.change(screen.getByLabelText("Texte affiché"), { target: { value: "Mon raccourci" } });
    expect(previewHtml()).toContain("Mon raccourci");
    expect(previewHtml()).not.toContain("Le texte complet de départ");
  });
});
