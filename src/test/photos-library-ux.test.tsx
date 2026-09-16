import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {
    data: undefined as any,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as any,
    refetch: vi.fn(),
  },
  invalidate: vi.fn(),
  space: "space-a",
  preparation: null as any,
}));

vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock("@/hooks/use-user-photos", () => ({
  useUserPhotos: () => state.query,
  useRetryPhotoRetouch: () => ({ retry: vi.fn(), isRetrying: null }),
  useUploadLibraryPhotos: () => ({ mutate: vi.fn(), progress: null, pendingUploads: [] }),
}));
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ activeWorkspace: { id: state.space }, loading: false }),
}));
vi.mock("@/lib/photo-storage", () => ({ deletePhotoCompletely: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn().mockResolvedValue({ data: null, error: null }) }));
vi.mock("@/components/photos/PhotoShootEmptyState", () => ({
  PhotoShootEmptyState: () => <div>INITIAL_PHOTO_STATE</div>,
}));
vi.mock("@/components/photos/PhotoCard", () => ({
  PhotoCard: ({ photo, onOpen }: any) => <button onClick={() => onOpen(photo)}>Ouvrir {photo.name}</button>,
}));
vi.mock("@/components/photos/PhotoUploadingCard", () => ({ PhotoUploadingCard: () => null }));
vi.mock("@/components/photos/PhotoRetouchDialog", () => ({ PhotoRetouchDialog: () => null }));
vi.mock("@/components/photos/CreateVisualDialog", () => ({ CreateVisualDialog: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({ PhotoLibraryPickerDialog: () => null }));
vi.mock("@/components/photos/PhotoDetailDialog", () => ({ PhotoDetailDialog: () => null }));
vi.mock("@/components/photos/PackshotDialog", () => ({ PackshotDialog: () => null }));
vi.mock("@/components/photos/MiseEnSceneDialog", () => ({ MiseEnSceneDialog: () => null }));
vi.mock("@/components/photos/PortraitProDialog", () => ({ PortraitProDialog: () => null }));
vi.mock("@/components/photos/OfferMockupDialog", () => ({ OfferMockupDialog: () => null }));
vi.mock("@/components/photos/AvantApresDialog", () => ({ AvantApresDialog: () => null }));
vi.mock("@/components/photos/PhotoWishlistPanel", () => ({ PhotoWishlistPanel: () => null }));
vi.mock("@/components/photos/SitePhotoImportDialog", () => ({ SitePhotoImportDialog: () => null }));

vi.mock("@/components/photos/PhotoPreparationDialog", () => ({ default: (props: any) => { state.preparation = props; return <p>PREPARATION</p>; } }));

import PhotosPage from "@/pages/PhotosPage";

beforeEach(() => {
  state.space = "space-a"; state.preparation = null;
  state.query = {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
});
afterEach(cleanup);


function photo(id: string, name: string, kind = "portrait") {
  return { id, name, kind, status: "ready", description: name, tags: [] };
}
it("keeps selected source IDs across filters and prepares only that selection", async () => {
  state.query.data = [photo("p1", "Portrait"), photo("p2", "Tasse", "produit"), photo("p3", "Atelier")];
  render(<PhotosPage />);
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner" }));
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir Portrait" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher une photo" }), { target: { value: "Tasse" } });
  expect(screen.getByText(/certaines masquées/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir Tasse" }));
  fireEvent.click(screen.getByRole("button", { name: "Harmoniser ces photos" }));
  await waitFor(() => expect(state.preparation?.sources.map((p: any) => p.photoId)).toEqual(["p1", "p2"]));
  expect(state.preparation.mode).toBe("collection");
});
it("clears selection, filters and dialogs when the workspace changes", () => {
  state.query.data = [photo("p1", "Portrait")];
  const view = render(<PhotosPage />);
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner" }));
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir Portrait" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher une photo" }), { target: { value: "Port" } });
  state.space = "space-b"; state.query.data = [photo("p2", "Atelier")];
  view.rerender(<PhotosPage />);
  expect(screen.getByRole("textbox", { name: "Rechercher une photo" })).toHaveValue("");
  expect(screen.queryByRole("button", { name: "Préparer cette photo" })).toBeNull();
  expect(screen.getByRole("button", { name: "Sélectionner" })).toHaveAttribute("aria-pressed", "false");
});
it("limits the batch to twelve ready sources", async () => {
  state.query.data = Array.from({length:13}, (_,i) => photo("p"+i, "Photo "+i));
  render(<PhotosPage />);
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner" }));
  for(let i=0;i<13;i++) fireEvent.click(screen.getByRole("button", { name: "Ouvrir Photo "+i }));
  fireEvent.click(screen.getByRole("button", { name: "Harmoniser ces photos" }));
  await waitFor(() => expect(state.preparation?.sources).toHaveLength(12));
});
