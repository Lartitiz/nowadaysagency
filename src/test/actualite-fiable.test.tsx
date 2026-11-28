import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// « Réagir à une actualité » (18/10/2026) : coûts écrits à la vérité, liste
// d'actus déjà payée gardée dans l'onglet, bouton principal en tête du départ.

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: invoke }));
// La recherche d'actus répond en flux (28/11/2026) : même faux serveur, appelé avec ses options.
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: invoke }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: async () => ({ error: null }) }) } }));

import NewsjackingPanel from "@/components/creer/NewsjackingPanel";

const ACTUS = [
  { titre: "Allergènes sur l'étiquette", resume: "R1", source: "ecomundo.eu", source_url: "https://ecomundo.eu/b", date_publication: "2026-10-10", type: "niche", force_pont: "fort", pertinence: "P1" },
  { titre: "Greenwashing", resume: "R2", source: "linfodurable.fr", source_url: "https://linfodurable.fr/a", type: "globale", force_pont: "moyen", pertinence: "P2" },
];

// Le 2e angle est préparé 600 ms après la liste : chaque test qui lance une recherche
// l'attend avant de finir, sinon cet appel tombe dans le test suivant (CI du 28/11/2026).
const deuxAnglesPrepares = () => waitFor(() => expect(invoke.mock.calls.filter(([fn]) => fn === "newsjacking-angles").length).toBe(2), { timeout: 3000 });

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
    await deuxAnglesPrepares();
  });

  it("garde la liste et les angles déjà payés quand le panneau revient (rechargement, Retour)", async () => {
    const premier = panneau();
    fireEvent.click(screen.getByRole("button", { name: /Lancer la recherche/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Voir les angles/ }).length).toBe(2));
    await deuxAnglesPrepares();
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

describe("Réagir à une actualité — ce qui s'affiche pendant la recherche", () => {
  beforeEach(() => { sessionStorage.clear(); invoke.mockReset(); });

  it("montre les sujets repérés, la recherche en cours, puis chaque actu prête, avant la liste finale", async () => {
    let finir: (v: unknown) => void = () => {};
    let suivre: (etape: string, d?: Record<string, unknown>) => void = () => {};
    invoke.mockImplementation((fn: string, opts: { onStatus?: typeof suivre }) => {
      if (fn !== "newsjacking-ai") return Promise.resolve({ data: { angles: [{ vehicule: "constat_decale", hook: "Accroche", description: "D", format_suggere: "post" }] }, error: null });
      suivre = opts.onStatus!;
      return new Promise((r) => { finir = r; });
    });
    panneau();
    fireEvent.click(screen.getByRole("button", { name: /Lancer la recherche/ }));
    await waitFor(() => expect(screen.getByText(/Les premières actus arrivent/)).toBeTruthy());

    act(() => suivre("pistes", { actus: [{ titre: "Le film dont tout le monde parle", source: "Télérama", date_publication: "2026-11-25" }] }));
    expect(screen.getByText("Ce dont on parle cette semaine")).toBeTruthy();
    expect(screen.getByText("Le film dont tout le monde parle")).toBeTruthy();

    act(() => suivre("recherche", { requete: "polémique de la semaine" }));
    expect(screen.getByText(/Je cherche : « polémique de la semaine »/)).toBeTruthy();

    act(() => suivre("actu", { actu: ACTUS[1] }));
    expect(screen.getByText("Greenwashing")).toBeTruthy();
    expect(screen.getByText(/1 actu prête/)).toBeTruthy();
    // Tant que la recherche tourne, rien à choisir : la liste finale fait foi.
    expect(screen.queryByRole("button", { name: /Voir les angles/ })).toBeNull();

    await act(async () => { finir({ data: { actus: ACTUS }, error: null }); });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Voir les angles/ }).length).toBe(2));
    expect(screen.queryByText("Ce dont on parle cette semaine")).toBeNull();
    await deuxAnglesPrepares();
  });
});

import { ideaCreateLink } from "@/lib/idea-create-link";

describe("Actu sauvegardée reprise depuis Mes idées ou l'accueil", () => {
  const idee = {
    id: "i1", titre: "📰 Allergènes sur l'étiquette", format: "actu", canal: "instagram", source_module: "newsjacking",
    angle: "actualité, Débat", notes: "R1",
    content_data: { ...ACTUS[0], faits_cles: ["80 allergènes à citer", "nouveaux produits dès le 31/07/2026"] },
  };

  it("envoie à /creer le résumé, la source, la date et les faits, sans le faux format « actu »", () => {
    const link = ideaCreateLink(idee);
    expect(new URL(link.to, "https://x").searchParams.get("format")).toBe("");
    const ctx = (link.state as any).context as string;
    expect(ctx).toContain("ACTUALITÉ : Allergènes sur l'étiquette");
    expect(ctx).toContain("Source : ecomundo.eu (https://ecomundo.eu/b)");
    expect(ctx).toContain("Date : 2026-10-10");
    expect(ctx).toContain("- 80 allergènes à citer");
  });

  it("ne change rien pour une idée qui n'est pas une actu", () => {
    const link = ideaCreateLink({ id: "i2", titre: "Mon sujet", format: "post", source_module: "diagnostic" });
    expect(new URL(link.to, "https://x").searchParams.get("format")).toBe("post");
    expect((link.state as any).context).toBeUndefined();
  });
});
