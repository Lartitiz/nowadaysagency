import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
const mocks = vi.hoisted(() => ({ photos: [
  { id: "1", name: "Bol", description: "Céramique émaillée", tags: ["bleu"], kind: "produit", status: "ready", storage_path: "1.jpg" },
  { id: "2", name: "Atelier", description: "Tour de poterie", tags: ["fabrication"], kind: "coulisses", status: "ready", storage_path: "2.jpg" },
], limits: [] as number[], cache: new Map<number, unknown[]>() }));
vi.mock("@/hooks/use-user-photos", () => ({ useUserPhotos: (limit: number) => {
  mocks.limits.push(limit);
  if (!mocks.cache.has(limit)) mocks.cache.set(limit, mocks.photos.slice(0, limit));
  return { data: mocks.cache.get(limit), isLoading: false };
}, useUploadLibraryPhotos: () => ({ mutate: vi.fn() }) }));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: async (paths: string[]) => new Map(paths.map(path => [path, "https://example.invalid/" + path])) }));
vi.mock("@/components/photos/SitePhotoImportDialog", () => ({ SitePhotoImportDialog: () => null }));
afterEach(cleanup);
it("recherche sans accents, filtre par type et conserve les photos sélectionnées masquées", async () => {
  const confirm = vi.fn();
  render(<PhotoLibraryPickerDialog open onOpenChange={vi.fn()} onConfirm={confirm} maxSelectable={2} />);
  await screen.findByRole("img", { name: "Bol", exact: true });
  fireEvent.click(screen.getByRole("button", { name: "Bol", exact: true }));
  fireEvent.change(screen.getByLabelText("Rechercher dans mes photos"), { target: { value: "ceramique bleu" } });
  expect(screen.getByRole("button", { name: "Bol", exact: true })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Atelier", exact: true })).toBeNull();
  fireEvent.change(screen.getByLabelText("Rechercher dans mes photos"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Type de photo"), { target: { value: "coulisses" } });
  fireEvent.click(screen.getByRole("button", { name: "Atelier", exact: true }));
  fireEvent.click(screen.getByText("Utiliser ces photos"));
  expect(confirm.mock.lastCall?.[0].map((p: any) => p.id)).toEqual(["1", "2"]);
});
it("donne accès aux photos au-delà de la limite initiale", async () => {
  mocks.cache.clear();
  mocks.photos = Array.from({ length: 201 }, (_, i) => ({ id: String(i), name: `Photo ${i}`, description: "", tags: [], kind: "produit", status: "ready", storage_path: `${i}.jpg` }));
  render(<PhotoLibraryPickerDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} maxSelectable={1} />);
  await screen.findByRole("img", { name: "Photo 0", exact: true });
  fireEvent.click(screen.getByText("Afficher plus de photos"));
  await waitFor(() => expect(mocks.limits).toContain(400));
  expect(screen.getByRole("button", { name: "Photo 200", exact: true })).toBeVisible();
});
