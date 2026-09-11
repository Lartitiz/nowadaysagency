import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StoryPhotoSuggestions from "@/components/creer/formatRenderers/StoryPhotoSuggestions";

const mocks = vi.hoisted(() => ({
  searchStockPhotos: vi.fn(),
}));

vi.mock("@/lib/stock-photos", () => ({
  searchStockPhotos: mocks.searchStockPhotos,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceId: () => "workspace-1",
}));

vi.mock("@/hooks/use-photo-wishlist", () => ({
  usePhotoWishlistMutations: () => ({ addDirective: vi.fn() }),
}));

vi.mock("@/lib/invoke-with-timeout", () => ({
  invokeWithTimeout: vi.fn(),
}));

vi.mock("@/lib/photo-storage", () => ({
  uploadPhotoOriginal: vi.fn(),
}));

const stockPhoto = {
  id: "pexels-1",
  url: "https://images.example/photo-large.jpg",
  thumbnail: "https://images.example/photo-small.jpg",
  width: 1080,
  height: 1920,
  alt: "Une machine à café sur un plan de travail",
  photographer: "Alice Martin",
  photographer_url: "https://example.com/alice",
  source_url: "https://example.com/photo",
  avg_color: "#C8B49A",
};

function renderSuggestions(onApply = vi.fn()) {
  render(
    <StoryPhotoSuggestions
      storyIndex={0}
      directive={null}
      queryEn={null}
      appliedUrl={null}
      appliedPhotoId={null}
      autoApply={false}
      libraryStrip={[]}
      onApply={onApply}
      onApplyLibrary={vi.fn()}
      onOpenLibrary={vi.fn()}
    />,
  );
  return onApply;
}

describe("StoryPhotoSuggestions", () => {
  beforeEach(() => {
    mocks.searchStockPhotos.mockReset();
  });

  it("permet de chercher une photo libre de droit et de l'appliquer à la story", async () => {
    const user = userEvent.setup();
    const onApply = renderSuggestions();
    mocks.searchStockPhotos.mockResolvedValue([stockPhoto]);

    await user.click(screen.getByRole("button", { name: /libres de droits/i }));
    const input = screen.getByRole("searchbox", {
      name: "Rechercher une photo libre de droit pour la story 1",
    });
    await user.type(input, "machine à café");
    await user.click(screen.getByRole("button", { name: "Rechercher" }));

    await waitFor(() =>
      expect(mocks.searchStockPhotos).toHaveBeenCalledWith("machine à café", {
        perPage: 8,
        orientation: "portrait",
        locale: "fr-FR",
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Utiliser la photo de Alice Martin" }));
    expect(onApply).toHaveBeenCalledWith({
      url: stockPhoto.url,
      credit: {
        photographer: "Alice Martin",
        source_url: stockPhoto.source_url,
      },
    });
  });

  it("indique clairement quand la recherche ne renvoie aucune photo", async () => {
    const user = userEvent.setup();
    renderSuggestions();
    mocks.searchStockPhotos.mockResolvedValue([]);

    await user.click(screen.getByRole("button", { name: /libres de droits/i }));
    await user.type(screen.getByRole("searchbox"), "requête introuvable");
    await user.click(screen.getByRole("button", { name: "Rechercher" }));

    expect(await screen.findByText("Aucune photo trouvée. Essaie avec d'autres mots.")).toBeInTheDocument();
  });
});
