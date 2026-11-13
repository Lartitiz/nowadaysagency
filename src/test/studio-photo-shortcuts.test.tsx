/**
 * Option B de l'audit du 13/11/2026 : le Studio ouvert sur une photo propose
 * les retouches courantes en raccourcis, selon le type de photo.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const row = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: () => Promise.resolve({ data: row.current, error: null }) };
  return { supabase: { from: () => chain } };
});
vi.mock("@/components/photos/PackshotDialog", () => ({ PackshotDialog: ({ open }: any) => open ? <p>fenêtre fond blanc</p> : null }));
vi.mock("@/components/photos/PortraitProDialog", () => ({ PortraitProDialog: ({ open }: any) => open ? <p>fenêtre portrait</p> : null }));
vi.mock("@/components/photos/MiseEnSceneDialog", () => ({ MiseEnSceneDialog: () => null }));
vi.mock("@/components/photos/PhotoRetouchDialog", () => ({ PhotoRetouchDialog: () => null }));

import { StudioPhotoShortcuts, WRITE_STARTER } from "@/features/visual-studio/StudioPhotoShortcuts";

const photo = (kind: string) => ({ id: "p1", workspace_id: "w1", status: "ready", kind, tags: [], background_preset_key: null });
function show(kind: string) {
  row.current = photo(kind);
  const onPrepare = vi.fn(), onWrite = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}>
    <StudioPhotoShortcuts photoId="p1" workspaceId="w1" disabled={false} onPrepare={onPrepare} onWrite={onWrite} />
  </QueryClientProvider>);
  return { onPrepare, onWrite };
}
afterEach(cleanup);

it("format et lumière (sans crédit) et « avec mes mots » pour toute photo", async () => {
  const { onPrepare, onWrite } = show("ambiance");
  fireEvent.click(screen.getByRole("button", { name: /Format et lumière/ }));
  expect(onPrepare).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Ranger, éclaircir, retirer un objet/ }));
  expect(onWrite).toHaveBeenCalledWith(WRITE_STARTER);
  await screen.findByRole("button", { name: /Autres outils/ });
  expect(screen.queryByRole("button", { name: /Fond blanc pour ma boutique/ })).toBeNull();
});

it("un produit a son raccourci fond blanc, qui ouvre la même fenêtre que Mes photos", async () => {
  show("produit");
  fireEvent.click(await screen.findByRole("button", { name: /Fond blanc pour ma boutique/ }));
  expect(screen.getByText("fenêtre fond blanc")).toBeInTheDocument();
});

it("un portrait a son raccourci fond de marque", async () => {
  show("portrait");
  fireEvent.click(await screen.findByRole("button", { name: /Mon portrait sur un fond de marque/ }));
  expect(screen.getByText("fenêtre portrait")).toBeInTheDocument();
});
