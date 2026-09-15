import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
}));

vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock("@/hooks/use-user-photos", () => ({
  useUserPhotos: () => state.query,
  useRetryPhotoRetouch: () => ({ retry: vi.fn(), isRetrying: null }),
  useUploadLibraryPhotos: () => ({ mutate: vi.fn(), progress: null, pendingUploads: [] }),
}));
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ activeWorkspace: { id: "audit-space" }, loading: false }),
}));
vi.mock("@/lib/photo-storage", () => ({ deletePhotoCompletely: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn().mockResolvedValue({ data: null, error: null }) }));
vi.mock("@/components/photos/PhotoShootEmptyState", () => ({
  PhotoShootEmptyState: () => <div>INITIAL_PHOTO_STATE</div>,
}));
vi.mock("@/components/photos/PhotoCard", () => ({
  PhotoCard: ({ photo }: any) => <div>PHOTO_{photo.id}</div>,
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

import PhotosPage from "@/pages/PhotosPage";

beforeEach(() => {
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

it("control: a confirmed empty library displays the first-visit state", () => {
  state.query.data = [];
  render(<PhotosPage />);
  expect(screen.getByText("INITIAL_PHOTO_STATE")).toBeInTheDocument();
});

it("G4: a failed first read is not presented as an empty library and can be retried", () => {
  state.query.isError = true;
  state.query.error = new Error("Network unavailable");
  render(<PhotosPage />);

  expect(screen.queryByText("INITIAL_PHOTO_STATE")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("Tes photos n'ont pas disparu");
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(state.query.refetch).toHaveBeenCalledTimes(1);
});

it("G4: loading remains distinct from a confirmed empty library", () => {
  state.query.isLoading = true;
  render(<PhotosPage />);

  expect(screen.queryByText("INITIAL_PHOTO_STATE")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("G4: a refresh error preserves already loaded photos with a warning", () => {
  state.query.data = [{
    id: "cached-photo",
    status: "ready",
    kind: "portrait",
    description: "Portrait déjà chargé",
    tags: [],
  }];
  state.query.isError = true;
  state.query.error = new Error("Refresh unavailable");
  render(<PhotosPage />);

  expect(screen.getByText("PHOTO_cached-photo")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Les photos déjà chargées restent affichées");
  expect(screen.queryByText("INITIAL_PHOTO_STATE")).toBeNull();
});
