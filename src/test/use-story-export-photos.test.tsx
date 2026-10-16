// Exports de stories hors atelier (calendrier, idées) : photos manquantes
// signalées, URL de bibliothèque redemandées au moment de l'export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useStoryExport } from "@/hooks/use-story-export";

const mocks = vi.hoisted(() => ({
  warning: vi.fn(),
  exportPng: vi.fn(async (_frames: { photoUrl?: string | null }[], _name?: string) => undefined),
  resolve: vi.fn(async () => new Map<string, string>()),
  convert: vi.fn(async (url: string): Promise<string | null> => `data:${url}`),
}));
vi.mock("sonner", () => ({ toast: { warning: mocks.warning, error: vi.fn() } }));
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock("@/hooks/use-open-in-canva", () => ({ useOpenInCanva: () => ({ openInCanva: vi.fn(), openingCanva: false }) }));
vi.mock("@/lib/story-photos", () => ({ resolveLibraryPhotoUrls: mocks.resolve, urlToDataUrl: mocks.convert }));
vi.mock("@/lib/export-carousel-png", () => ({ exportStoryPng: mocks.exportPng }));
vi.mock("@/lib/export-story-pptx", () => ({ exportStoryPptx: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockReset().mockImplementation(async () => new Map<string, string>());
  mocks.convert.mockReset().mockImplementation(async (url: string) => `data:${url}`);
});

const photoStory = (text: string, visual: Record<string, unknown>) => ({
  text, face_cam: false, visual: { gabarit: "photo_pills", background: "photo", body_pill: text, ...visual },
});

describe("useStoryExport : photos des stories", () => {
  it("prévient quand des photos n'ont pas pu être chargées, et exporte quand même", async () => {
    mocks.convert.mockResolvedValue(null);
    const stories = [
      photoStory("Un", { photo_url: "https://example.invalid/1.jpg" }),
      { text: "Deux", face_cam: false, visual: { gabarit: "fond_pills", background: "fond_couleur", body_pill: "Deux" } },
      photoStory("Trois", { photo_url: "https://example.invalid/3.jpg" }),
    ];
    const { result } = renderHook(() => useStoryExport(stories, "seq"));
    await act(async () => { await result.current.exportPng(); });
    expect(mocks.exportPng).toHaveBeenCalledTimes(1);
    expect(mocks.exportPng.mock.calls[0][0]).toHaveLength(3);
    expect(mocks.warning).toHaveBeenCalledTimes(1);
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining("stories 1 et 3"));
  });

  it("ne prévient pas quand toutes les photos sont chargées", async () => {
    const stories = [photoStory("Un", { photo_url: "https://example.invalid/1.jpg" })];
    const { result } = renderHook(() => useStoryExport(stories, "seq"));
    await act(async () => { await result.current.exportPng(); });
    expect(mocks.exportPng).toHaveBeenCalledTimes(1);
    expect(mocks.warning).not.toHaveBeenCalled();
  });

  it("redemande l'URL de bibliothèque au moment de l'export (celle de l'affichage peut avoir expiré)", async () => {
    mocks.resolve
      .mockResolvedValueOnce(new Map([["lib-1", "https://example.invalid/expiree.jpg"]]))
      .mockResolvedValue(new Map([["lib-1", "https://example.invalid/fraiche.jpg"]]));
    const stories = [photoStory("Un", { photo_id: "lib-1" })];
    const { result } = renderHook(() => useStoryExport(stories, "seq"));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.exportPng(); });
    expect(mocks.convert).toHaveBeenCalledWith("https://example.invalid/fraiche.jpg");
    expect(mocks.exportPng.mock.calls[0][0][0].photoUrl).toBe("data:https://example.invalid/fraiche.jpg");
    expect(mocks.warning).not.toHaveBeenCalled();
  });

  it("prévient quand la photo de bibliothèque est introuvable", async () => {
    const stories = [photoStory("Un", { photo_id: "supprimee" })];
    const { result } = renderHook(() => useStoryExport(stories, "seq"));
    await act(async () => { await result.current.exportPng(); });
    expect(mocks.exportPng).toHaveBeenCalledTimes(1);
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining("story 1"));
  });
});
