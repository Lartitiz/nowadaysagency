import { MemoryRouter } from "react-router-dom";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {
    data: [] as any,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as any,
    refetch: vi.fn(),
  },
  upload: vi.fn(),
  progress: null as any,
}));

vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/hooks/use-user-photos", () => ({
  useUserPhotos: () => state.query,
  useRetryPhotoRetouch: () => ({ retry: vi.fn(), isRetrying: null }),
  useUploadLibraryPhotos: () => ({ mutate: state.upload, progress: state.progress, pendingUploads: [] }),
}));
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ activeWorkspace: { id: "space-a" }, loading: false }),
}));
vi.mock("@/lib/photo-storage", () => ({ deletePhotoCompletely: vi.fn(), removePhotoFromLibrary: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn().mockResolvedValue({ data: null, error: null }) }));
vi.mock("@/components/photos/PhotoShootEmptyState", () => ({ PhotoShootEmptyState: () => <div>INITIAL_PHOTO_STATE</div> }));
vi.mock("@/components/photos/PhotoCard", () => ({ PhotoCard: () => null }));
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
vi.mock("@/components/photos/PhotoPreparationDialog", () => ({ default: () => null }));

import PhotosPage from "@/pages/PhotosPage";

function imageFile(name: string) {
  return new File(["x"], name, { type: "image/jpeg" });
}

function dropData(files: File[]) {
  return { dataTransfer: { files, items: files.map(() => ({ kind: "file" })), types: ["Files"] } };
}

beforeEach(() => {
  state.upload = vi.fn().mockResolvedValue({ uploaded: 2, failed: 0 });
  state.progress = null;
  state.query = { data: [], isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() };
});
afterEach(cleanup);

it("shows the drop hint and uploads dropped images", async () => {
  render(<MemoryRouter><PhotosPage /></MemoryRouter>);
  const main = document.getElementById("main-content")!;
  const files = [imageFile("a.jpg"), imageFile("b.jpg")];

  fireEvent.dragEnter(main, dropData(files));
  expect(await screen.findByText("Lâche tes photos ici")).toBeTruthy();

  fireEvent.drop(main, dropData(files));
  await waitFor(() => expect(state.upload).toHaveBeenCalledTimes(1));
  expect(state.upload.mock.calls[0][0]).toHaveLength(2);
  await waitFor(() => expect(screen.queryByText("Lâche tes photos ici")).toBeNull());
});

it("ignores drops while an upload is already running", async () => {
  state.progress = { done: 1, total: 3 };
  render(<MemoryRouter><PhotosPage /></MemoryRouter>);
  const main = document.getElementById("main-content")!;

  fireEvent.dragEnter(main, dropData([imageFile("a.jpg")]));
  expect(screen.queryByText("Lâche tes photos ici")).toBeNull();

  fireEvent.drop(main, dropData([imageFile("a.jpg")]));
  await waitFor(() => expect(state.upload).not.toHaveBeenCalled());
});
