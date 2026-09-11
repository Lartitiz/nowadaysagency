import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug audit 11/09 : quand la signature batch des URLs échoue (session
// invalide, réseau), getSignedPhotoUrls rend une Map VIDE en silence (retry
// interne épuisé, cf. photo-storage.ts) — le picker affichait alors 49
// vignettes cassées sans aucune explication ni moyen de réessayer. Ce test
// verrouille le nouvel état explicite + le bouton "Réessayer".

const mocks = vi.hoisted(() => ({
  photos: [
    { id: "p1", storage_path: "u1/p1.jpg", status: "ready", name: "Photo 1" },
    { id: "p2", storage_path: "u1/p2.jpg", status: "ready", name: "Photo 2" },
  ],
  getSignedPhotoUrls: vi.fn(),
}));

vi.mock("@/hooks/use-user-photos", () => ({
  useUserPhotos: () => ({ data: mocks.photos, isLoading: false }),
  useUploadLibraryPhotos: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/photo-storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/photo-storage")>("@/lib/photo-storage");
  return { ...actual, getSignedPhotoUrls: mocks.getSignedPhotoUrls };
});

vi.mock("@/components/photos/SitePhotoImportDialog", () => ({
  SitePhotoImportDialog: () => null,
}));

import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";

beforeEach(() => {
  mocks.getSignedPhotoUrls.mockReset();
});

describe("PhotoLibraryPickerDialog — échec de signature des URLs", () => {
  it("affiche un message explicite + Réessayer quand TOUTES les vignettes échouent à se signer", async () => {
    mocks.getSignedPhotoUrls.mockResolvedValue(new Map());

    render(
      <PhotoLibraryPickerDialog open maxSelectable={3} onOpenChange={() => {}} onConfirm={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/on n'arrive pas à charger tes photos/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
    // Pas de confusion avec l'état "bibliothèque vide" (texte différent).
    expect(screen.queryByText(/tu n'as encore aucune photo/i)).not.toBeInTheDocument();
  });

  it("Réessayer relance la signature", async () => {
    mocks.getSignedPhotoUrls.mockResolvedValueOnce(new Map());
    render(
      <PhotoLibraryPickerDialog open maxSelectable={3} onOpenChange={() => {}} onConfirm={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
    });

    mocks.getSignedPhotoUrls.mockResolvedValueOnce(
      new Map([
        ["u1/p1.jpg", "https://signed/p1.jpg"],
        ["u1/p2.jpg", "https://signed/p2.jpg"],
      ]),
    );
    await userEvent.click(screen.getByRole("button", { name: /réessayer/i }));

    await waitFor(() => {
      expect(mocks.getSignedPhotoUrls).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByText(/on n'arrive pas à charger tes photos/i)).not.toBeInTheDocument();
    });
  });

  it("un rejet réel de la promesse (pas seulement une Map vide résolue) finit aussi par afficher l'état d'échec", async () => {
    mocks.getSignedPhotoUrls.mockRejectedValue(new Error("network timeout"));

    render(
      <PhotoLibraryPickerDialog open maxSelectable={3} onOpenChange={() => {}} onConfirm={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/on n'arrive pas à charger tes photos/i)).toBeInTheDocument();
    });
  });
});
