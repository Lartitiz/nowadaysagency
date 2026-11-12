// Chantier 4 (12/11/2026) : les gestes du carrousel, pour les stories.
// Un test par geste : ajouter, dupliquer, changer l'ordre, taille du texte
// (aperçu ET export), refaire une story. Chaque geste passe par onStoriesUpdate
// pour être enregistré comme les autres éditions.
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";

const mocks = vi.hoisted(() => ({ exportPng: vi.fn(), invoke: vi.fn() }));
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock("@/hooks/use-user-photos", () => {
  const data: unknown[] = [];
  return { useUserPhotos: () => ({ data }) };
});
vi.mock("@/hooks/use-open-in-canva", () => ({ useOpenInCanva: () => ({ openInCanva: vi.fn(), openingCanva: false }) }));
vi.mock("@/lib/story-photos", () => ({ resolveLibraryPhotoUrls: async () => new Map(), urlToDataUrl: async (url: string) => url }));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: async () => new Map() }));
vi.mock("@/lib/export-carousel-png", () => ({ exportStoryPng: mocks.exportPng }));
vi.mock("@/lib/export-story-pptx", () => ({ exportStoryPptx: vi.fn() }));
vi.mock("@/components/RedFlagsChecker", () => ({ default: () => null, fixRedFlags: (text: string) => text }));
vi.mock("@/components/creer/formatRenderers/StoryPhotoSuggestions", () => ({ default: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: () => null }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const story = (text: string, visual = {}): any => ({
  text, face_cam: false, visual: { gabarit: "fond_pills", background: "fond_couleur", body_pill: text, ...visual },
});
const three = () => ({ stories: [story("Première"), story("Deuxième"), story("Troisième")] });
const texts = (list: any[]) => list.map((s) => s.text);
const goTo = (n: number) => fireEvent.click(screen.getByRole("button", { name: `Voir la story ${n}` }));
const currentStoryNumber = () => screen.getByRole("button", { current: "step" }).textContent;

describe("Stories : gestes de séquence", () => {
  it("ajoute une story vierge juste après la story affichée et l'ouvre", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={three()} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une story après la story 1" }));
    const updated = onStoriesUpdate.mock.lastCall![0];
    expect(texts(updated)).toEqual(["Première", "", "Deuxième", "Troisième"]);
    expect(updated[1].visual.background).toBe("fond_couleur");
    expect(currentStoryNumber()).toBe("2");
    expect(screen.getByLabelText("Texte complet de la story 2")).toHaveValue("");
  });

  it("duplique une story (copie juste après, indépendante de l'originale)", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={three()} onStoriesUpdate={onStoriesUpdate} />);
    goTo(2);
    fireEvent.click(screen.getByRole("button", { name: "Dupliquer la story 2" }));
    expect(texts(onStoriesUpdate.mock.lastCall![0])).toEqual(["Première", "Deuxième", "Deuxième", "Troisième"]);
    expect(currentStoryNumber()).toBe("3");
    fireEvent.change(screen.getByLabelText("Texte complet de la story 3"), { target: { value: "Copie modifiée" } });
    expect(texts(onStoriesUpdate.mock.lastCall![0])).toEqual(["Première", "Deuxième", "Copie modifiée", "Troisième"]);
  });

  it("change l'ordre : la story suit le geste et garde son texte", () => {
    const onStoriesUpdate = vi.fn();
    render(<StoryResult result={three()} onStoriesUpdate={onStoriesUpdate} />);
    expect(screen.getByRole("button", { name: "Placer la story 1 avant la story 0" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Placer la story 1 après la story 2" }));
    expect(texts(onStoriesUpdate.mock.lastCall![0])).toEqual(["Deuxième", "Première", "Troisième"]);
    expect(currentStoryNumber()).toBe("2");
    expect(screen.getByLabelText("Texte complet de la story 2")).toHaveValue("Première");
    fireEvent.click(screen.getByRole("button", { name: "Placer la story 2 avant la story 1" }));
    expect(texts(onStoriesUpdate.mock.lastCall![0])).toEqual(["Première", "Deuxième", "Troisième"]);
  });

  it("une story déplacée garde sa photo attachée à la création", () => {
    const onStoriesUpdate = vi.fn();
    const photo = (s: string) => ({ preview: `data:image/png;base64,${s}` });
    const result = { stories: [
      story("Avec A", { background: "photo", gabarit: "photo_pills" }),
      story("Avec B", { background: "photo", gabarit: "photo_pills" }),
    ] };
    render(<StoryResult result={result} photos={[photo("AAAA"), photo("BBBB")]} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Placer la story 1 après la story 2" }));
    expect(screen.getByTitle("Aperçu story 2").getAttribute("srcdoc")).toContain("AAAA");
    goTo(1);
    expect(screen.getByTitle("Aperçu story 1").getAttribute("srcdoc")).toContain("BBBB");
  });

  it("règle la taille du texte : l'aperçu et l'export PNG grossissent", async () => {
    const onStoriesUpdate = vi.fn();
    let actions: any = null;
    render(<StoryResult result={{ stories: [story("Un texte court")] }} onStoriesUpdate={onStoriesUpdate} onExportActionsChange={(a) => { actions = a; }} />);
    const size = () => Number(/font-size:(\d+)px/.exec(screen.getByTitle("Aperçu story 1").getAttribute("srcdoc")!.split("data-story-pptx")[1])![1]);
    const before = size();
    expect(screen.getByRole("button", { name: "Moyen" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Grand" }));
    expect(onStoriesUpdate.mock.lastCall![0][0].visual.text_size).toBe("grand");
    expect(size()).toBeGreaterThan(before);
    await act(async () => { await actions.exportPng(); });
    const exported = mocks.exportPng.mock.lastCall![0][0].html as string;
    expect(Number(/data-story-pptx="body"[^>]*font-size:(\d+)px/.exec(exported)![1])).toBe(size());
  });

  it("refait une seule story (1 crédit via ai-text-action) et ne touche qu'à son texte", async () => {
    const onStoriesUpdate = vi.fn();
    mocks.invoke.mockResolvedValue({ data: { result: "« Nouvelle version de la deuxième »" }, error: null });
    render(<StoryResult result={three()} onStoriesUpdate={onStoriesUpdate} />);
    goTo(2);
    fireEvent.click(screen.getByRole("button", { name: "Refaire cette story (story 2)" }));
    fireEvent.change(screen.getByLabelText(/Dis ce que tu veux changer/), { target: { value: "plus court" } });
    fireEvent.click(screen.getByRole("button", { name: "Refaire cette story · 1 crédit" }));
    await waitFor(() => expect(screen.getByTestId("story-redo-proposal")).toHaveTextContent("Nouvelle version de la deuxième"));

    const [fn, { body }] = mocks.invoke.mock.lastCall!;
    expect(fn).toBe("ai-text-action");
    expect(body.selected_text).toBe("Deuxième");
    expect(body.workspace_id).toBe("ws-1");
    expect(body.action_prompt).toContain("story 2 sur 3");
    expect(body.action_prompt).toContain("plus court");
    expect(body.action_prompt).toContain("Première");
    expect(body.action_prompt.length).toBeLessThanOrEqual(1000);
    expect(onStoriesUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Garder la nouvelle" }));
    expect(texts(onStoriesUpdate.mock.lastCall![0])).toEqual(["Première", "Nouvelle version de la deuxième", "Troisième"]);
  });

  it("« Garder la mienne » ne change rien, et une erreur annonce que rien n'a été débité", async () => {
    const onStoriesUpdate = vi.fn();
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: "Tu as utilisé tous tes crédits ce mois-ci." } });
    render(<StoryResult result={three()} onStoriesUpdate={onStoriesUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Refaire cette story (story 1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Refaire cette story · 1 crédit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tu as utilisé tous tes crédits ce mois-ci.");

    mocks.invoke.mockResolvedValueOnce({ data: { result: "Autre chose" }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Refaire cette story · 1 crédit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Garder la mienne" }));
    expect(onStoriesUpdate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue("Première");
  });

  it("quand le parent renvoie la séquence (enregistrement auto), la carte n'est pas recréée", () => {
    function Parent() {
      const [result, setResult] = useState<any>(three());
      return <StoryResult result={result} onStoriesUpdate={(stories) => setResult({ ...result, stories })} />;
    }
    render(<Parent />);
    const field = screen.getByLabelText("Texte complet de la story 1");
    const frame = screen.getByTitle("Aperçu story 1");
    fireEvent.change(field, { target: { value: "Première, retouchée" } });
    expect(screen.getByLabelText("Texte complet de la story 1")).toBe(field);
    expect(screen.getByTitle("Aperçu story 1")).toBe(frame);
    fireEvent.click(screen.getByRole("button", { name: "Placer la story 1 après la story 2" }));
    expect(screen.getByLabelText("Texte complet de la story 2")).toHaveValue("Première, retouchée");
    expect(screen.getByLabelText("Texte complet de la story 2")).toBe(field);
  });
});
