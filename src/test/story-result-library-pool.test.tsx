// Vivier de la bibliothèque (bande de vignettes des stories) : une erreur en
// signant les URL ne doit pas laisser de promesse rejetée sans traitement.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import StoryResult from "@/components/creer/formatRenderers/StoryResult";

const mocks = vi.hoisted(() => ({
  photos: [{ id: "p1", status: "ready", storage_path: "u/p1.jpg", description: "Un livre", tags: [] }],
  sign: vi.fn(),
}));
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock("@/hooks/use-user-photos", () => ({ useUserPhotos: () => ({ data: mocks.photos }) }));
vi.mock("@/hooks/use-open-in-canva", () => ({ useOpenInCanva: () => ({ openInCanva: vi.fn(), openingCanva: false }) }));
vi.mock("@/lib/story-photos", () => ({ resolveLibraryPhotoUrls: async () => new Map(), urlToDataUrl: async (url: string) => url }));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: mocks.sign }));
vi.mock("@/lib/export-carousel-png", () => ({ exportStoryPng: vi.fn() }));
vi.mock("@/lib/export-story-pptx", () => ({ exportStoryPptx: vi.fn() }));
vi.mock("@/components/RedFlagsChecker", () => ({ default: () => null }));
vi.mock("@/components/creer/formatRenderers/StoryPhotoSuggestions", () => ({ default: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: () => null }));

afterEach(() => cleanup());

describe("Stories : vivier de la bibliothèque", () => {
  it("une erreur en signant les URL du vivier est rattrapée (aucune promesse rejetée sans traitement)", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      mocks.sign.mockRejectedValue(new Error("stockage indisponible"));
      render(<StoryResult result={{ stories: [{ text: "Un livre ouvert", face_cam: false }] }} />);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(mocks.sign).toHaveBeenCalledWith(["u/p1.jpg"]);
      expect(unhandled).toEqual([]);
      expect(screen.getByTitle("Aperçu story 1")).toBeInTheDocument();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
