import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PostPhotoEditor from "@/components/creer/PostPhotoEditor";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
const mocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), save: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("@/lib/story-photos", () => ({ urlToDataUrl: async () => null }));
vi.mock("@/components/creer/PhotoEditDialog", () => ({ PhotoEditDialog: ({ onApply, onOpenChange }: any) => <><button onClick={() => onApply("data:image/png;base64,new")}>Appliquer décor</button><button onClick={() => onOpenChange(false)}>Annuler décor</button></> }));
vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: ({ onSelect }: any) => <button onClick={() => onSelect({ name: "Autre photo", base64: "data:image/jpeg;base64,other", preview: "data:image/jpeg;base64,other" })}>Choisir autre photo</button> }));
const original: PhotoItem = { name: "Bijou", base64: "data:image/jpeg;base64,original", preview: "data:image/jpeg;base64,original", mimeType: "image/jpeg" };
function Harness() {
  const [photo, setPhoto] = useState(original);
  return <><p>Ma légende inchangée</p><img alt="Résultat" src={photo.preview}/><PostPhotoEditor photo={photo} onChange={async next => { await mocks.save(next); setPhoto(next); }} /></>;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("applique puis annule une retouche sans perdre la photo originale ni la légende", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Retoucher la photo" }));
  fireEvent.click(await screen.findByText("Appliquer décor"));
  await waitFor(() => expect(screen.getByAltText("Résultat")).toHaveAttribute("src", "data:image/png;base64,new"));
  expect(mocks.save.mock.lastCall?.[0].originalBase64).toBe(original.base64);
  fireEvent.click(screen.getByText("Revenir à l’originale"));
  await waitFor(() => expect(screen.getByAltText("Résultat")).toHaveAttribute("src", original.preview));
  expect(screen.getByText("Ma légende inchangée")).toBeVisible();
});
it("remplace une photo avec possibilité de revenir à l’originale", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Remplacer la photo"));
  fireEvent.click(screen.getByText("Choisir autre photo"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  expect(mocks.save.mock.lastCall?.[0].originalBase64).toBe(original.base64);
  expect(await screen.findByText("Revenir à l’originale")).toBeVisible();
});
it("conserve le résultat précédent si l’enregistrement échoue", async () => {
  mocks.save.mockRejectedValueOnce(new Error("upload indisponible"));
  render(<Harness />);
  fireEvent.click(screen.getByText("Retoucher la photo"));
  fireEvent.click(await screen.findByText("Appliquer décor"));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("upload indisponible"));
  expect(screen.getByAltText("Résultat")).toHaveAttribute("src", original.preview);
  expect(mocks.success).not.toHaveBeenCalled();
});
it("annuler la fenêtre ne change aucune donnée", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Retoucher la photo"));
  fireEvent.click(await screen.findByText("Annuler décor"));
  expect(mocks.save).not.toHaveBeenCalled();
});
