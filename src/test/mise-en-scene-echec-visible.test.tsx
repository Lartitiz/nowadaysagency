/**
 * 12/11/2026 : une mise en scène ratée ne laissait qu'un toast qui disparaît.
 * Pendant les 60 à 90 s d'attente, on regarde souvent ailleurs. L'échec reste
 * maintenant dans la fenêtre, avec « Réessayer la mise en scène ».
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

import { MiseEnSceneDialog } from "@/components/photos/MiseEnSceneDialog";

const photo = {
  id: "src", user_id: "u1", workspace_id: "w1", name: "Tasse", kind: "produit", status: "ready",
  storage_path: "u1/src.jpg", original_storage_path: "u1/src.jpg", description: "Une tasse", tags: [],
  background_prompt: null, background_preset_key: null,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  m.save.mockResolvedValue("gen-1");
});
afterEach(cleanup);

it("un échec reste affiché dans la fenêtre et « Réessayer » relance la même demande", async () => {
  m.invoke.mockResolvedValueOnce({ data: { error: "La création a échoué. Aucune image décomptée." }, error: null });
  render(<MemoryRouter><MiseEnSceneDialog photo={photo} open onOpenChange={vi.fn()} /></MemoryRouter>);
  const go = await screen.findByRole("button", { name: /Générer la mise en scène/ });
  await waitFor(() => expect(go).toBeEnabled());
  fireEvent.click(go);

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("La mise en scène n'a pas abouti");
  expect(alert).toHaveTextContent("La création a échoué. Aucune image décomptée.");

  m.invoke.mockResolvedValueOnce({ data: { images: ["data:image/jpeg;base64,CCCC"] }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Réessayer la mise en scène" }));
  expect(await screen.findByText("Déjà rangée dans Mes photos")).toBeVisible();
  expect(m.invoke).toHaveBeenCalledTimes(2);
  expect(m.invoke.mock.calls[1][1]).toEqual(m.invoke.mock.calls[0][1]);
  expect(screen.queryByRole("alert")).toBeNull();
});
