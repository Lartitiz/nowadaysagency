// Regression: image failure must not survive a fresh signed URL.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
const mocks = vi.hoisted(() => ({ photos: [{ id: "audit-photo", name: "Bijou audit", status: "ready", storage_path: "audit.jpg" }], sign: vi.fn() }));
vi.mock("@/hooks/use-user-photos", () => ({ useUserPhotos: () => ({ data: mocks.photos, isLoading: false }), useUploadLibraryPhotos: () => ({ mutate: vi.fn() }) }));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: mocks.sign }));
vi.mock("@/components/photos/SitePhotoImportDialog", () => ({ SitePhotoImportDialog: () => null }));
afterEach(cleanup);
it("réessaie la vignette après obtention d’une nouvelle URL", async () => {
  mocks.sign.mockResolvedValue(new Map([["audit.jpg", "https://example.invalid/old.jpg"]]));
  const props = { open: true, onOpenChange: vi.fn(), maxSelectable: 1, onConfirm: vi.fn() };
  const { rerender } = render(<PhotoLibraryPickerDialog {...props} />);
  fireEvent.error(await screen.findByRole("img", { name: "Bijou audit" }));
  expect(screen.getByText("Aperçu indisponible")).toBeVisible();
  mocks.sign.mockResolvedValue(new Map([["audit.jpg", "https://example.invalid/fresh.jpg"]]));
  mocks.photos = [...mocks.photos]; // Realtime/query refresh, same photo identity
  rerender(<PhotoLibraryPickerDialog {...props} />);
  await waitFor(() => expect(mocks.sign).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("img", { name: "Bijou audit" })).toHaveAttribute("src", "https://example.invalid/fresh.jpg");
  expect(screen.queryByText("Aperçu indisponible")).toBeNull();
});
