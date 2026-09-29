import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), savedVersions: vi.fn(), photos: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Photo ${i}`, status: "ready", kind: "other", storage_path: `p${i}.jpg` })) }));
vi.mock("@/hooks/use-user-photos", () => ({ useUserPhotos: () => ({ data: mocks.photos, refetch: vi.fn() }), useUploadLibraryPhotos: () => ({ mutate: mocks.upload }) }));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: async () => new Map() }));
vi.mock("@/features/studio-video/library-sources", () => ({ savedStudioVersions: mocks.savedVersions }));
vi.mock("@/features/studio-video/api", () => ({
  listStudioVideoSources: async () => ({ sources: [{ kind: "studio_version", id: "v1", name: "Mon décor", previewUrl: "https://example.com/photo.jpg" }] }),
}));
import { VideoImagePicker } from "@/features/studio-video/VideoImagePicker";
import type { VideoReference } from "@/features/studio-video/sources";
const clients: QueryClient[] = [];
function mount(images: VideoReference[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const confirm = vi.fn(), close = vi.fn();
  render(<QueryClientProvider client={client}><VideoImagePicker workspaceId="workspace" initialImages={images} onConfirm={confirm} onClose={close} /></QueryClientProvider>);
  return { confirm, close };
}
beforeEach(() => { mocks.savedVersions.mockResolvedValue(new Map()); });
afterEach(async () => { await act(async () => { cleanup(); }); clients.forEach(c => c.clear()); clients.length = 0; mocks.upload.mockReset(); mocks.savedVersions.mockReset(); mocks.photos.forEach(p => { p.kind = "other"; }); });
it("pré-sélectionne les références, conserve leurs rôles et applique la limite aux quatre images", async () => {
  const { confirm } = mount([{ kind: "photo", id: "p0", name: "Photo 0", role: "product" }]);
  expect(screen.getByRole("button", { name: "Photo 0" })).toHaveAttribute("aria-pressed", "true");
  for (const i of [1, 2, 3]) fireEvent.click(screen.getByRole("button", { name: `Photo ${i}` }));
  expect(screen.getByRole("button", { name: "Photo 4" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Ajouter ces images (4)" }));
  expect(confirm.mock.calls[0][0]).toHaveLength(4);
  expect(confirm.mock.calls[0][0][0].role).toBe("product");
  await waitFor(() => expect(screen.getByText("4 / 4 images sélectionnées")).toBeInTheDocument());
});
it("combine bibliothèque et version Photo sans perdre la première sélection", async () => {
  const { confirm } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Photo 0" }));
  fireEvent.click(await screen.findByRole("button", { name: "Mon décor" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter ces images (2)" }));
  expect(confirm.mock.calls[0][0].map((r: VideoReference) => [r.kind, r.id])).toEqual([["photo", "p0"], ["studio_version", "v1"]]);
});
it("permet de sélectionner les portraits de la bibliothèque, avec ou sans version Studio", async () => {
  mocks.photos[0].kind = "portrait";
  mocks.photos[1].kind = "portrait";
  mocks.savedVersions.mockResolvedValue(new Map([["p0", { id: "p0", library_photo_id: "p0" }]]));
  const { confirm } = mount();
  await waitFor(() => expect(screen.getByRole("button", { name: "Photo 0" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "Photo 1" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Photo 0" }));
  fireEvent.click(screen.getByRole("button", { name: "Photo 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter ces images (2)" }));
  expect(confirm.mock.calls[0][0][0]).toMatchObject({ kind: "studio_version", id: "p0" });
  expect(confirm.mock.calls[0][0][1]).toMatchObject({ kind: "photo", id: "p1" });
});
it("annuler ne modifie pas les références du compositeur", async () => {
  const images: VideoReference[] = [{ kind: "photo", id: "p0", name: "Photo 0", role: "product" }];
  const { confirm, close } = mount(images);
  fireEvent.click(screen.getByRole("button", { name: "Photo 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(images).toHaveLength(1); expect(confirm).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
});
it("refuse un import qui dépasse la capacité avant tout envoi", async () => {
  mount([{ kind: "photo", id: "p0", name: "Photo 0", role: "product" }]);
  fireEvent.change(screen.getByLabelText("Importer des photos"), { target: { files: Array.from({length:4}, (_,i) => new File(["x"], `photo${i}.png`, {type:"image/png"})) } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Il reste 3 places");
  expect(mocks.upload).not.toHaveBeenCalled();
});
