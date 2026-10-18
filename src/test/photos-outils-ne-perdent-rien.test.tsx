/**
 * P4 (18/10/2026) : les outils de « Mes photos » ne perdent plus une image payée.
 * Choix de Laetitia : rangement automatique dans la bibliothèque (pas de
 * question à la fermeture). Et les outils produit se voient sans le repli
 * quand la photo vient d'un outil produit ou que son classement est incertain.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  invoke: vi.fn(),
  save: vi.fn(),
  discard: vi.fn(),
  refresh: vi.fn(),
  generatePortrait: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: m.invoke }));
vi.mock("@/lib/photo-storage", () => ({
  discardPhotoAttempt: m.discard,
  downloadPhoto: vi.fn(),
  getSignedPhotoUrl: vi.fn().mockResolvedValue("https://img/x.jpg"),
  userPhotoToRawBase64: vi.fn().mockResolvedValue("data:image/jpeg;base64,AAAA"),
}));
vi.mock("@/lib/photo-auto-save", async (orig) => ({
  ...(await orig<typeof import("@/lib/photo-auto-save")>()),
  saveGeneratedPhoto: m.save,
}));
vi.mock("@/hooks/use-user-photos", () => ({
  useRefreshUserPhotos: () => m.refresh,
  useGeneratePortraitPro: () => ({ mutate: m.generatePortrait, isPending: false }),
  useRetouchExistingPhoto: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-portrait-ambiances", () => ({
  usePortraitAmbiances: () => ({
    ambiances: [{ title: "Atelier", description: "Lumière douce", prompt: "atelier lumineux" }],
    isLoading: false, isError: false, regenerate: vi.fn(), isRegenerating: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain, eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: { id: "gen-1", storage_path: "u1/gen-1.jpg", name: "Portrait" } }),
    then: (r: any) => Promise.resolve({ data: null }).then(r),
  };
  return { supabase: { from: () => chain } };
});

import { PackshotDialog } from "@/components/photos/PackshotDialog";
import { MiseEnSceneDialog } from "@/components/photos/MiseEnSceneDialog";
import { PortraitProDialog } from "@/components/photos/PortraitProDialog";
import { PhotoDetailDialog } from "@/components/photos/PhotoDetailDialog";

const photo = (over: Record<string, unknown> = {}) => ({
  id: "src", user_id: "u1", workspace_id: "w1", name: "Tasse", kind: "produit", status: "ready",
  storage_path: "u1/src.jpg", original_storage_path: "u1/src.jpg", description: "Une tasse", tags: [],
  background_prompt: null, background_preset_key: null, ...over,
}) as any;

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  m.save.mockResolvedValue("gen-1");
  m.discard.mockResolvedValue(undefined);
});
afterEach(cleanup);

it("fond blanc : l'image payée est rangée dès qu'elle arrive et Échap ne la jette pas", async () => {
  m.invoke.mockResolvedValue({ data: { image_base64: "data:image/jpeg;base64,BBBB" }, error: null });
  const onOpenChange = vi.fn();
  wrap(<PackshotDialog photo={photo()} open onOpenChange={onOpenChange} />);
  const go = await screen.findByRole("button", { name: /Générer le packshot/ });
  await waitFor(() => expect(go).toBeEnabled());
  fireEvent.click(go);
  expect(await screen.findByText("Déjà rangé dans Mes photos")).toBeVisible();
  expect(m.save).toHaveBeenCalledTimes(1);
  expect(m.save.mock.calls[0][0]).toMatchObject({ dataUrl: "data:image/jpeg;base64,BBBB", userId: "u1" });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(m.discard).not.toHaveBeenCalled();
});

it("fond blanc : « Retirer cet essai » enlève l'image de Mes photos", async () => {
  m.invoke.mockResolvedValue({ data: { image_base64: "data:image/jpeg;base64,BBBB" }, error: null });
  wrap(<PackshotDialog photo={photo()} open onOpenChange={vi.fn()} />);
  const go = await screen.findByRole("button", { name: /Générer le packshot/ });
  await waitFor(() => expect(go).toBeEnabled());
  fireEvent.click(go);
  fireEvent.click(await screen.findByRole("button", { name: /Retirer cet essai/ }));
  await waitFor(() => expect(m.discard).toHaveBeenCalledWith("gen-1"));
});

it("mise en scène : chaque proposition est rangée et la fermeture ne demande rien", async () => {
  m.invoke.mockResolvedValue({ data: { images: ["data:image/jpeg;base64,CCCC"] }, error: null });
  const confirm = vi.spyOn(window, "confirm");
  const onOpenChange = vi.fn();
  wrap(<MiseEnSceneDialog photo={photo()} open onOpenChange={onOpenChange} />);
  const go = await screen.findByRole("button", { name: /Générer la mise en scène/ });
  await waitFor(() => expect(go).toBeEnabled());
  fireEvent.click(go);
  expect(await screen.findByText("Déjà rangée dans Mes photos")).toBeVisible();
  expect(m.save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "C'est fidèle, terminer" })).toBeVisible();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(confirm).not.toHaveBeenCalled();
});

it("mise en scène : si le rangement échoue, l'image reste là et la fermeture prévient", async () => {
  m.invoke.mockResolvedValue({ data: { images: ["data:image/jpeg;base64,CCCC"] }, error: null });
  m.save.mockRejectedValue(new Error("réseau"));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onOpenChange = vi.fn();
  wrap(<MiseEnSceneDialog photo={photo()} open onOpenChange={onOpenChange} />);
  const go = await screen.findByRole("button", { name: /Générer la mise en scène/ });
  await waitFor(() => expect(go).toBeEnabled());
  fireEvent.click(go);
  expect(await screen.findByRole("button", { name: "Ranger dans Mes photos" })).toBeVisible();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(confirm).toHaveBeenCalled());
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});

it("portrait : fermer la fenêtre garde l'essai payé (plus d'effacement à la fermeture)", async () => {
  m.generatePortrait.mockResolvedValue({ photoId: "gen-1" });
  const onOpenChange = vi.fn();
  wrap(<PortraitProDialog photo={photo({ kind: "portrait" })} open onOpenChange={onOpenChange} />);
  fireEvent.click(await screen.findByRole("button", { name: /Générer mon portrait/ }));
  expect(await screen.findByText("Déjà rangé dans Mes photos")).toBeVisible();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(m.discard).not.toHaveBeenCalled();
});

function openTools(p: any) {
  wrap(<PhotoDetailDialog photo={p} open onOpenChange={vi.fn()} onPackshot={vi.fn()} onMiseEnScene={vi.fn()} onRetouche={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Préparer \/ modifier/ }));
}

it.each([
  ["un fond blanc classé « autre » par l'IA", { kind: "autre", tags: ["packshot"], background_preset_key: "packshot" }],
  ["une mise en scène classée « ambiance »", { kind: "ambiance", tags: ["mise-en-scene"], background_preset_key: "mise_en_scene" }],
  ["une photo au classement incertain (« autre »)", { kind: "autre" }],
])("outils produit visibles sans le repli pour %s", (_l, over) => {
  openTools(photo(over));
  expect(screen.queryByText(/Voir aussi les outils produit/)).toBeNull();
  expect(screen.getByRole("button", { name: /Une photo pour mon e-commerce/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /Mon produit porté ou en situation/ })).toBeVisible();
});

it("une photo d'ambiance garde les outils produit sous le repli", () => {
  openTools(photo({ kind: "ambiance" }));
  expect(screen.getByText(/Voir aussi les outils produit/)).toBeInTheDocument();
});
