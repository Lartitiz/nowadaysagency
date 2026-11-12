/**
 * Point 3 du 12/11/2026 : « Fond blanc » et « Mon portrait sur un fond de
 * marque » gardent l'échec à l'écran avec un bouton « Réessayer » (avant :
 * un toast qui disparaissait). Même principe que la mise en scène (#1847).
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
import { PortraitProDialog } from "@/components/photos/PortraitProDialog";
import { MiseEnSceneDialog } from "@/components/photos/MiseEnSceneDialog";
import * as storage from "@/lib/photo-storage";

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

it("fond blanc : l'échec reste affiché et « Réessayer le fond blanc » renvoie la même demande", async () => {
  m.invoke.mockResolvedValueOnce({ data: null, error: { message: "Le service d'images n'a pas réussi cette fois." } });
  wrap(<PackshotDialog photo={photo()} open onOpenChange={vi.fn()} />);
  const go = await screen.findByRole("button", { name: /Générer le packshot/ });
  await waitFor(() => expect(go).toBeEnabled());
  fireEvent.click(go);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("La photo sur fond blanc n'a pas abouti");
  expect(alert).toHaveTextContent("Le service d'images n'a pas réussi cette fois.");
  m.invoke.mockResolvedValueOnce({ data: { image_base64: "data:image/jpeg;base64,BBBB" }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Réessayer le fond blanc" }));
  expect(await screen.findByText("Déjà rangé dans Mes photos")).toBeVisible();
  expect(m.invoke).toHaveBeenCalledTimes(2);
  expect(m.invoke.mock.calls[1][1]).toEqual(m.invoke.mock.calls[0][1]);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("portrait : l'échec reste affiché et « Réessayer mon portrait » relance avec le même fond", async () => {
  m.generatePortrait.mockRejectedValueOnce(new Error("Le service d'images n'a pas réussi cette fois."));
  wrap(<PortraitProDialog photo={photo({ kind: "portrait" })} open onOpenChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Générer mon portrait/ }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Ton portrait n'a pas abouti");
  m.generatePortrait.mockResolvedValueOnce({ photoId: "gen-1" });
  fireEvent.click(screen.getByRole("button", { name: "Réessayer mon portrait" }));
  expect(await screen.findByText("Déjà rangé dans Mes photos")).toBeVisible();
  expect(m.generatePortrait).toHaveBeenCalledTimes(2);
  expect(m.generatePortrait.mock.calls[1][0]).toEqual(m.generatePortrait.mock.calls[0][0]);
  expect(m.generatePortrait.mock.calls[0][0]).toMatchObject({ backgroundPrompt: "atelier lumineux" });
});

it("portrait : plus de crédits = pas de bouton Réessayer (ça ne servirait à rien)", async () => {
  m.generatePortrait.mockRejectedValueOnce(new Error("limit_reached"));
  wrap(<PortraitProDialog photo={photo({ kind: "portrait" })} open onOpenChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Générer mon portrait/ }));
  await waitFor(() => expect(m.generatePortrait).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole("button", { name: "Réessayer mon portrait" })).not.toBeInTheDocument();
});

it.each([
  ["fond blanc", (p: any) => <PackshotDialog photo={p} open onOpenChange={vi.fn()} />, /Générer le packshot/],
  ["mise en scène", (p: any) => <MiseEnSceneDialog photo={p} open onOpenChange={vi.fn()} />, /Créer la mise en scène|Générer/],
])("%s : une photo qui ne s'ouvre pas propose « Recharger la photo » au lieu d'un bouton grisé sans issue", async (_name, ui, go) => {
  vi.mocked(storage.userPhotoToRawBase64).mockRejectedValueOnce(new Error("Réseau indisponible"));
  wrap(ui(photo()));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Ta photo n'a pas pu être ouverte");
  expect(alert).toHaveTextContent("Réseau indisponible");
  expect(screen.getAllByRole("button", { name: go }).at(-1)).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Recharger la photo" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getAllByRole("button", { name: go }).at(-1)).toBeEnabled());
  expect(storage.userPhotoToRawBase64).toHaveBeenCalledTimes(2);
});
