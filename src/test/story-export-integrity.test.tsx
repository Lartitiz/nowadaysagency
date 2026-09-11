// Regression tests from the launch audit. No remote requests or paid services.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";
const mocks = vi.hoisted(() => ({ exportPng: vi.fn(), exportPptx: vi.fn(), convert: vi.fn(), resolve: vi.fn(async () => new Map()), error: vi.fn(), photos: [] }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock("@/hooks/use-user-photos", () => ({ useUserPhotos: () => ({ data: mocks.photos }) }));
vi.mock("@/hooks/use-open-in-canva", () => ({ useOpenInCanva: () => ({ openInCanva: vi.fn(), openingCanva: false }) }));
vi.mock("@/lib/story-photos", () => ({ resolveLibraryPhotoUrls: mocks.resolve, urlToDataUrl: mocks.convert }));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: async () => new Map() }));
vi.mock("@/lib/export-carousel-png", () => ({ exportStoryPng: mocks.exportPng }));
vi.mock("@/lib/export-story-pptx", () => ({ exportStoryPptx: mocks.exportPptx }));
vi.mock("@/components/creer/formatRenderers/StoryPhotoSuggestions", () => ({ default: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Stories : intégrité édition / export", () => {
  it("propage la correction robot au récit, au visuel et à la sauvegarde", () => {
    const text = "Dans un monde où chaque bijou raconte une histoire.";
    const save = vi.fn();
    render(<StoryResult result={{ stories: [{ text, visual: { gabarit: "fond_pills", background: "fond_couleur", body_pill: text } }] }} onStoriesUpdate={save} />);
    fireEvent.click(screen.getByRole("button", { name: /Corriger automatiquement/ }));
    expect(screen.getByText(/expression corrigée/)).toBeVisible();
    expect(screen.getByLabelText("Texte complet de la story 1")).toHaveValue(" chaque bijou raconte une histoire.");
    expect(screen.getByTitle("Aperçu story 1").getAttribute("srcdoc")).not.toContain("Dans un monde où");
    expect(save.mock.lastCall?.[0][0].text).toBe(" chaque bijou raconte une histoire.");
    expect(save.mock.lastCall?.[0][0].visual.body_pill).toBe(" chaque bijou raconte une histoire.");
  });
  it.each(["exportPng", "exportPptx"])("refuse %s si la conversion photo échoue", async (action) => {
    mocks.convert.mockResolvedValue(null); // real urlToDataUrl returns null on HTTP/network errors
    let actions: any;
    const photo = "https://example.invalid/audit-bijou.jpg";
    render(<StoryResult result={{ stories: [{ text: "Un bijou", visual: { gabarit: "photo_pills", background: "photo", body_pill: "Un bijou", photo_url: photo } }] }} onExportActionsChange={a => { actions = a; }} />);
    expect(screen.getByTitle("Aperçu story 1").getAttribute("srcdoc")).toContain(photo);
    await act(async () => { await actions[action](); });
    expect(mocks.convert).toHaveBeenCalledWith(photo);
    expect(mocks.exportPng).not.toHaveBeenCalled();
    expect(mocks.exportPptx).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("story 1 est indisponible"));
    expect(actions.exporting).toBe(false);
    expect(actions.exportingPptx).toBe(false);
  });
  it("renouvelle l’URL bibliothèque à l’export sans persister l’URL signée", async () => {
    mocks.resolve.mockResolvedValue(new Map([["photo-id", "https://example.invalid/fresh.jpg"]]));
    mocks.convert.mockResolvedValue("data:image/png;base64,audit");
    const save = vi.fn();
    let actions: any;
    render(<StoryResult result={{ stories: [{ text: "Bijou", visual: { gabarit: "photo_pills", background: "photo", photo_id: "photo-id" } }] }} onStoriesUpdate={save} onExportActionsChange={a => { actions = a; }} />);
    await act(async () => { await actions.exportPng(); });
    expect(mocks.convert).toHaveBeenCalledWith("https://example.invalid/fresh.jpg");
    expect(mocks.exportPng.mock.lastCall?.[0][0].photoUrl).toBe("data:image/png;base64,audit");
    expect(save).not.toHaveBeenCalled();
  });
  it("ne remplace pas une photo_id introuvable par une autre photo attachée", async () => {
    mocks.resolve.mockResolvedValue(new Map());
    let actions: any;
    render(<StoryResult photos={[{ preview: "data:image/png;base64,other" }]} result={{ stories: [{ text: "Bijou", visual: { gabarit: "photo_pills", background: "photo", photo_id: "missing" } }] }} onExportActionsChange={a => { actions = a; }} />);
    await act(async () => { await actions.exportPng(); });
    expect(mocks.exportPng).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
  });
  it("exporte encore une story sur fond couleur sans photo", async () => {
    let actions: any;
    render(<StoryResult result={{ stories: [{ text: "Bonjour", visual: { gabarit: "fond_pills", background: "fond_couleur" } }] }} onExportActionsChange={a => { actions = a; }} />);
    await act(async () => { await actions.exportPng(); });
    expect(mocks.exportPng).toHaveBeenCalledOnce();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
