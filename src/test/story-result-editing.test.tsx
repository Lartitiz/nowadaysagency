import { afterEach, describe, expect, it, vi } from "vitest";
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
const redFlags = vi.hoisted(() => ({ onFix: null as null | (() => void) }));
vi.mock("@/components/RedFlagsChecker", () => ({
  default: ({ onFix }: { onFix: () => void }) => { redFlags.onFix = onFix; return null; },
  fixRedFlags: (text: string) => text,
}));
vi.mock("@/components/creer/formatRenderers/StoryPhotoSuggestions", () => ({ default: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: () => null }));
// jsdom ne mesure rien : les boîtes des textes de l'aperçu sont données par le test.
const textBoxes = vi.hoisted(() => ({ list: [] as any[] }));
vi.mock("@/components/stories/story-text-hit", async (orig) => ({
  ...(await orig<typeof import("@/components/stories/story-text-hit")>()),
  storyTextBoxes: () => textBoxes.list,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  textBoxes.list = [];
});

/** Geste sur l'aperçu (300 px de large = échelle 300/1080). */
function pointer(target: Element, type: string, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { pointerId: { value: 1 }, clientX: { value: clientX }, clientY: { value: clientY }, pointerType: { value: "mouse" } });
  fireEvent(target, event);
}

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
  it("présente toute la séquence avec un seul horaire et la lit story par story", () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    const result = {
      publication_time: "soir",
      stories: [
        sequence("Première story").stories[0],
        { ...sequence("Deuxième story").stories[0], timing: "midi" },
      ],
    };
    render(<StoryResult result={result} />);

    expect(screen.getByText("Toute la séquence à la suite, le soir")).toBeVisible();
    expect(screen.queryByText("midi")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lire la séquence" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-story-sequence-reader");
    expect(screen.getByLabelText("Story 1 sur 2")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Suivante/ }));
    expect(screen.getByLabelText("Story 2 sur 2")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeVisible();
  });

  it("une story sauvegardée sans plan visuel (ni face cam) a quand même son aperçu, fond photo et texte complet", () => {
    const text = "Une ancienne story sans plan visuel, gardée telle quelle.";
    render(<StoryResult result={{ stories: [{ text, face_cam: false }] }} />);
    const html = previewHtml();
    expect(html).toContain(text);
    expect(screen.getByRole("button", { name: "📷 Photo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ajoute un détail réel de la personne au début de la story 1", () => {
    const onStoriesUpdate = vi.fn();
    const result = {
      ...sequence("Ça t'est déjà arrivé de scroller sur une machine à café ?"),
      personal_tip: "Ajoute ce que tu as vraiment pensé à ce moment-là.",
    };
    render(<StoryResult result={result} onStoriesUpdate={onStoriesUpdate} />);

    fireEvent.change(screen.getByLabelText("Ce que tu as vraiment pensé, vu ou dit"), {
      target: { value: "Là, je me suis dit : il y a un truc qui cloche" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à la story 1" }));

    expect(onStoriesUpdate.mock.lastCall?.[0][0].text).toBe(
      "Là, je me suis dit : il y a un truc qui cloche. Ça t'est déjà arrivé de scroller sur une machine à café ?",
    );
    expect(screen.getByLabelText("Ce que tu as vraiment pensé, vu ou dit")).toHaveValue("");
  });

  it("glisse le texte sur l’aperçu pour le déplacer, comme sur une slide", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={sequence("Déplace-moi")} onStoriesUpdate={onStoriesUpdate} />);
    // Texte au milieu de la story (boîte en px de la story 1080×1920).
    textBoxes.list = [{ role: "body", index: 0, x: 200, y: 900, w: 680, h: 120 }];
    const control = screen.getByRole("button", { name: "Déplacer le texte de la story 1" });
    Object.defineProperty(control, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(control, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 533.33, right: 300, bottom: 533.33, x: 0, y: 0, toJSON: () => ({}) }),
    });
    pointer(control, "pointerdown", 150, 266);
    pointer(control, "pointermove", 210, 133);
    pointer(control, "pointerup", 210, 133);
    const visual = onStoriesUpdate.mock.lastCall?.[0][0].visual;
    expect(visual.text_position_x).toBe(70);
    expect(Math.round(visual.text_position_y)).toBe(25);
    expect(visual.text_position_edited).toBe(true);
    expect(previewHtml()).toContain("left:70%");
    // Un glissé n'ouvre pas l'écriture.
    expect(document.querySelector("[data-story-inline-editor]")).toBeNull();
  });

  it("touche le texte sur l’aperçu pour l’écrire directement sur la story", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={sequence("Écris-moi", { title_pill: "UN TITRE" })} onStoriesUpdate={onStoriesUpdate} />);
    textBoxes.list = [
      { role: "title", index: 0, x: 300, y: 820, w: 480, h: 70 },
      { role: "body", index: 0, x: 200, y: 920, w: 680, h: 120 },
    ];
    const control = screen.getByRole("button", { name: "Déplacer le texte de la story 1" });
    Object.defineProperty(control, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 533.33, right: 300, bottom: 533.33, x: 0, y: 0, toJSON: () => ({}) }),
    });
    // Toucher le corps du texte (sans glisser).
    pointer(control, "pointerdown", 150, 270);
    pointer(control, "pointerup", 150, 270);
    const editor = screen.getByLabelText("Texte sur la story");
    expect(editor).toHaveValue("Écris-moi");
    fireEvent.change(editor, { target: { value: "Écrit sur la story" } });
    expect(onStoriesUpdate.mock.lastCall?.[0][0].text).toBe("Écrit sur la story");
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue("Écrit sur la story");
    expect(previewHtml()).toContain("Écrit sur la story");
    // Toucher le titre : la case passe au titre.
    pointer(control, "pointerdown", 150, 237);
    pointer(control, "pointerup", 150, 237);
    fireEvent.change(screen.getByLabelText("Titre sur la story"), { target: { value: "NOUVEAU TITRE" } });
    expect(onStoriesUpdate.mock.lastCall?.[0][0].visual.title_pill).toBe("NOUVEAU TITRE");
    // Toucher à côté du texte referme l'écriture.
    pointer(control, "pointerdown", 20, 20);
    pointer(control, "pointerup", 20, 20);
    expect(document.querySelector("[data-story-inline-editor]")).toBeNull();
  });

  it("Annuler et Rétablir défont et refont la dernière modification", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={sequence("Avant")} onStoriesUpdate={onStoriesUpdate} />);
    const undo = screen.getByRole("button", { name: "Annuler la modification" });
    expect(undo).toBeDisabled();
    editNarration("Après");
    fireEvent.click(screen.getByRole("button", { name: "Bas" }));
    fireEvent.click(undo);
    expect(onStoriesUpdate.mock.lastCall?.[0][0].visual.text_position).not.toBe("bottom");
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue("Après");
    fireEvent.click(undo);
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue("Avant");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].text).toBe("Avant");
    fireEvent.click(screen.getByRole("button", { name: "Rétablir la modification" }));
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue("Après");
  });

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

  it("n’affiche qu’un seul champ texte pour une story standard", () => {
    render(<StoryResult result={sequence("Les boutons en nacre")} />);
    expect(screen.queryByLabelText("Texte affiché")).toBeNull();
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
    editNarration("Les boutons en bois");
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
    expect(previewHtml()).toContain(full);
    expect(previewHtml()).not.toContain("Une perfection qui paraît suspecte");
  });

  it("garde modifiable une pastille personnalisée distincte", () => {
    render(<StoryResult result={sequence("Le texte complet de départ", { body_pill: "Mon raccourci", body_pill_edited: true })} />);
    fireEvent.change(screen.getByLabelText("Texte affiché"), { target: { value: "Mon raccourci 2" } });
    expect(previewHtml()).toContain("Mon raccourci 2");
  });

  it("supprime une story du milieu après confirmation et renumérote les suivantes", () => {
    const onStoriesUpdate = vi.fn();
    const result = {
      stories: [
        sequence("Première story").stories[0],
        sequence("Story à enlever").stories[0],
        sequence("Troisième story").stories[0],
      ],
    };
    render(<StoryResult result={result} onStoriesUpdate={onStoriesUpdate} />);

    // Une story à la fois (chantier D) : les 3 sont dans la page, on va sur la 2e puis on la supprime.
    // Un seul bouton, sous les vignettes, pour la story ouverte (comme « Supprimer la slide »).
    expect(screen.getAllByRole("button", { name: "Supprimer la story", hidden: true })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Voir la story 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer la story" }));

    expect(screen.getByText("Supprimer la story 2 ?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Supprimer cette story" }));

    const updated = onStoriesUpdate.mock.lastCall?.[0];
    expect(updated).toHaveLength(2);
    expect(updated.map((s: any) => s.text)).toEqual(["Première story", "Troisième story"]);
    expect(screen.getByText("Story 1")).toBeInTheDocument();
    expect(screen.getByText("Story 2")).toBeInTheDocument();
    expect(screen.queryByText("Story 3")).not.toBeInTheDocument();
    expect(screen.queryByText("Story à enlever")).not.toBeInTheDocument();
  });

  it("ne supprime rien si la confirmation est annulée", () => {
    const onStoriesUpdate = vi.fn();
    const result = {
      stories: [sequence("Première story").stories[0], sequence("Deuxième story").stories[0]],
    };
    render(<StoryResult result={result} onStoriesUpdate={onStoriesUpdate} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Supprimer la story" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Garder la story" }));

    expect(onStoriesUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("Première story")).toBeInTheDocument();
    expect(screen.getByText("Deuxième story")).toBeInTheDocument();
  });

  it("montre une story à la fois, choisie dans les vignettes (comme les slides)", () => {
    const result = { stories: [sequence("Première story").stories[0], sequence("Deuxième story").stories[0], sequence("Troisième story").stories[0]] };
    render(<StoryResult result={result} />);
    const visibleTexts = () => screen.getAllByRole("textbox", { name: /Texte complet de la story/ }).map((t) => (t as HTMLTextAreaElement).value);
    expect(visibleTexts()).toEqual(["Première story"]);
    expect(screen.getByRole("button", { name: "Voir la story 1" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByTitle("Vignette story 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voir la story 2" }));
    expect(visibleTexts()).toEqual(["Deuxième story"]);
    fireEvent.click(screen.getByRole("button", { name: "Voir la story 3" }));
    expect(visibleTexts()).toEqual(["Troisième story"]);
    // Les autres stories restent dans la page (export, lecture de la séquence).
    expect(screen.getByTitle("Aperçu story 1")).toBeInTheDocument();
  });

  it("montre et modifie le même texte que l'aperçu quand « text » est vide mais « texte » rempli", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={{ stories: [{ text: "", texte: "Bonjour", face_cam: false }] }} onStoriesUpdate={onStoriesUpdate} />);
    expect(previewHtml()).toContain("Bonjour");
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue("Bonjour");
    editNarration("Bonsoir");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].texte).toBe("Bonsoir");
    expect(previewHtml()).toContain("Bonsoir");
  });

  it("garde une saisie faite juste avant un changement de position ou une correction « robot » (gestionnaire d'un rendu précédent)", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={sequence("Les boutons en nacre")} onStoriesUpdate={onStoriesUpdate} />);
    // Gestionnaires du rendu d'avant la saisie, comme deux actions dans le même tour.
    const haut = screen.getByRole("button", { name: "Haut" });
    const propsKey = Object.keys(haut).find((k) => k.startsWith("__reactProps$"))!;
    const staleSetTop = (haut as any)[propsKey].onClick;
    const staleFix = redFlags.onFix!;

    editNarration("Les boutons en bois");
    act(() => staleSetTop());
    expect(onStoriesUpdate.mock.lastCall?.[0][0].text).toBe("Les boutons en bois");
    expect(onStoriesUpdate.mock.lastCall?.[0][0].visual.text_position).toBe("top");

    editNarration("Les boutons en corne");
    act(() => staleFix());
    expect(onStoriesUpdate.mock.lastCall?.[0][0].text).toBe("Les boutons en corne");
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue("Les boutons en corne");
  });

  it("ne propose pas de supprimer la dernière story restante", () => {
    render(<StoryResult result={sequence("Unique story")} />);
    expect(screen.queryByRole("button", { name: "Supprimer la story" })).not.toBeInTheDocument();
  });
});
