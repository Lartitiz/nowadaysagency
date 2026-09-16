import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomeCreatePanel from "@/components/dashboard/HomeCreatePanel";

const state = vi.hoisted(() => ({
  channels: ["instagram", "linkedin"], loading: false, error: null as string | null,
  reload: vi.fn(), pending: false, checking: false,
}));
vi.mock("@/hooks/use-active-channels", () => ({ useActiveChannels: () => state }));
vi.mock("@/hooks/use-pending-brand-review", () => ({ usePendingBrandReview: () => state }));
const create = vi.fn();
function panel(incompleteBrand = false) {
  return <MemoryRouter><HomeCreatePanel onCreate={create} incompleteBrand={incompleteBrand} /></MemoryRouter>;
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { channels: ["instagram", "linkedin"], loading: false, error: null, pending: false, checking: false });
});
afterEach(cleanup);

describe("Accueil : commencer sans perdre le contexte", () => {
  it("transmet le canal et la nouvelle intention au garde-fou existant", () => {
    render(panel());
    fireEvent.click(screen.getByRole("button", { name: /LinkedIn/ }));
    expect(create).toHaveBeenCalledWith("/creer?canal=linkedin&new=1");
    expect(screen.getByRole("button", { name: /Pinterest/ })).toBeVisible();
  });
  it("conserve la création Pinterest indépendamment du hub spécialisé masqué", () => {
    state.channels = ["pinterest"];
    render(panel());
    fireEvent.click(screen.getByRole("button", { name: /Pinterest/ }));
    expect(create).toHaveBeenCalledWith("/creer?canal=pinterest&new=1");
  });
  it("ne bloque pas une identité simplement incomplète", () => {
    render(panel(true));
    expect(screen.getByText(/compléter ton identité plus tard/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Instagram/ }));
    expect(create).toHaveBeenCalled();
  });
  it("fait relire une fiche importée avant de continuer la création", () => {
    state.pending = true;
    render(panel(true));
    expect(screen.getByRole("link", { name: /Relire ma fiche/ })).toHaveAttribute("href", "/branding?from=onboarding&next=creer");
    expect(screen.queryByRole("button", { name: /Instagram/ })).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
  it("garde les quatre capacités accessibles sans préférences ou si leur lecture échoue", () => {
    state.channels = ["site"]; state.error = "lecture impossible";
    const view = render(panel());
    for (const canal of ["Instagram", "LinkedIn", "Newsletter", "Pinterest"]) {
      expect(screen.getByRole("button", { name: new RegExp(canal) })).toBeVisible();
    }
    state.loading = true; state.channels = [];
    view.rerender(panel());
    fireEvent.click(screen.getByRole("button", { name: /Newsletter/ }));
    expect(create).toHaveBeenCalledWith("/creer?canal=newsletter&new=1");
  });
  it("attend la vérification de la fiche du nouvel espace avant de créer", () => {
    const view = render(panel());
    state.checking = true;
    view.rerender(panel());
    expect(screen.getByRole("status")).toHaveTextContent("Chargement de ton espace");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    state.checking = false; state.pending = true;
    view.rerender(panel());
    expect(screen.getByRole("link", { name: /Relire ma fiche/ })).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    state.pending = false;
    view.rerender(panel());
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});
