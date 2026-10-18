import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// « Réagir à une actualité » (18/10/2026) : coûts écrits à la vérité, liste
// d'actus déjà payée gardée dans l'onglet, bouton principal en tête du départ.

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: invoke }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: async () => ({ error: null }) }) } }));

import NewsjackingPanel from "@/components/creer/NewsjackingPanel";

const ACTUS = [
  { titre: "Allergènes sur l'étiquette", resume: "R1", source: "ecomundo.eu", source_url: "https://ecomundo.eu/b", date_publication: "2026-10-10", type: "niche", force_pont: "fort", pertinence: "P1" },
  { titre: "Greenwashing", resume: "R2", source: "linfodurable.fr", source_url: "https://linfodurable.fr/a", type: "globale", force_pont: "moyen", pertinence: "P2" },
];

const panneau = () => render(<NewsjackingPanel onSelect={vi.fn()} onClose={vi.fn()} workspaceId="w1" />);

describe("Réagir à une actualité — fiable", () => {
  beforeEach(() => {
    sessionStorage.clear();
    invoke.mockReset();
    invoke.mockImplementation(async (fn: string) =>
      fn === "newsjacking-ai"
        ? { data: { actus: ACTUS }, error: null }
        : { data: { angles: [{ vehicule: "constat_decale", hook: "Accroche", description: "D", format_suggere: "post" }] }, error: null });
  });

  it("annonce 3 crédits pour la recherche et met « Lancer la recherche » avant les options", () => {
    panneau();
    expect(screen.getByText(/3 crédits pour lancer la recherche/)).toBeTruthy();
    expect(screen.queryByText(/1 crédit pour lancer/)).toBeNull();
    // Les types d'actu sont repliés : le bouton principal vient avant eux.
    expect(screen.queryByText("Actu choc à rebondir")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Préciser ce que je cherche/ }));
    expect(screen.getByText("Actu choc à rebondir")).toBeTruthy();
  });

  it("affiche la source datée et les prix sur Relancer et Voir 2 autres angles", async () => {
    panneau();
    fireEvent.click(screen.getByRole("button", { name: /Lancer la recherche/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Voir les angles/ }).length).toBe(2));
    expect(screen.getByText(/ecomundo\.eu · 10 oct\. 2026/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Relancer.*3 crédits/ }).length).toBe(2);
    fireEvent.click(screen.getAllByRole("button", { name: /Voir les angles/ })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: /Voir 2 autres angles · 1 crédit/ })).toBeTruthy());
  });

  it("garde la liste et les angles déjà payés quand le panneau revient (rechargement, Retour)", async () => {
    const premier = panneau();
    fireEvent.click(screen.getByRole("button", { name: /Lancer la recherche/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Voir les angles/ }).length).toBe(2));
    await waitFor(() => expect(invoke.mock.calls.filter(([fn]) => fn === "newsjacking-angles").length).toBe(2));
    premier.unmount();
    invoke.mockClear();

    panneau();
    expect(screen.queryByRole("button", { name: /Lancer la recherche/ })).toBeNull();
    expect(screen.getByText("Allergènes sur l'étiquette")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Voir les angles/ })[0]);
    expect(await screen.findByText(/Accroche/)).toBeTruthy();
    // Rien n'est repayé : ni recherche ni angle.
    expect(invoke).not.toHaveBeenCalled();
  });
});
