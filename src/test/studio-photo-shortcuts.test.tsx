/**
 * Studio ouvert sur une photo : ses outils dédiés sont rangés dans le menu
 * « Plus d'outils » (écran simplifié du 13/11/2026, plus de raccourcis dans
 * la conversation). L'outil qui convient au type de photo passe en premier.
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));
vi.mock("@/components/photos/PackshotDialog", () => ({ PackshotDialog: ({ open }: any) => open ? <p>fenêtre fond blanc</p> : null }));
vi.mock("@/components/photos/PortraitProDialog", () => ({ PortraitProDialog: ({ open }: any) => open ? <p>fenêtre portrait</p> : null }));
vi.mock("@/components/photos/MiseEnSceneDialog", () => ({ MiseEnSceneDialog: () => null }));
vi.mock("@/components/photos/PhotoRetouchDialog", () => ({ PhotoRetouchDialog: () => null }));

import { StudioPhotoMenuItems, StudioPhotoToolDialogs } from "@/features/visual-studio/StudioPhotoShortcuts";

const photo = (kind: string) => ({ id: "p1", workspace_id: "w1", status: "ready", kind, tags: [], background_preset_key: null }) as any;
function show(kind: string) {
  const onPrepare = vi.fn(), onTool = vi.fn();
  render(<DropdownMenu open>
    <DropdownMenuTrigger>Plus d’outils</DropdownMenuTrigger>
    <DropdownMenuContent>
      <StudioPhotoMenuItems photo={photo(kind)} disabled={false} onPrepare={onPrepare} onTool={onTool} />
    </DropdownMenuContent>
  </DropdownMenu>);
  return { onPrepare, onTool, labels: screen.getAllByRole("menuitem").map((el) => el.textContent) };
}
afterEach(cleanup);

it("format et lumière (sans crédit) pour toute photo, sans portrait si ce n'en est pas un", () => {
  const { onPrepare, labels } = show("ambiance");
  fireEvent.click(screen.getByRole("menuitem", { name: /Format et lumière/ }));
  expect(onPrepare).toHaveBeenCalled();
  expect(labels.some((l) => /portrait/.test(l || ""))).toBe(false);
});

it("un produit a le fond blanc juste après format et lumière", () => {
  const { onTool, labels } = show("produit");
  expect(labels[1]).toMatch(/Fond blanc pour ma boutique/);
  fireEvent.click(screen.getByRole("menuitem", { name: /Fond blanc pour ma boutique/ }));
  expect(onTool).toHaveBeenCalledWith("packshot");
});

it("un portrait a le fond de marque en premier outil", () => {
  const { onTool, labels } = show("portrait");
  expect(labels[1]).toMatch(/Mon portrait sur un fond de marque/);
  fireEvent.click(screen.getByRole("menuitem", { name: /Mon portrait sur un fond de marque/ }));
  expect(onTool).toHaveBeenCalledWith("portrait");
});

it("les fenêtres sont celles de Mes photos", () => {
  render(<StudioPhotoToolDialogs photo={photo("produit")} tool="packshot" onClose={() => {}} />);
  expect(screen.getByText("fenêtre fond blanc")).toBeInTheDocument();
});
