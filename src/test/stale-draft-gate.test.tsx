import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import StaleDraftGate from "@/features/creer/StaleDraftGate";
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId } from "@/hooks/use-flow-persistence";

const db = vi.hoisted(() => ({ rows: new Set<string>(), fail: false }));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: "owner" } } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "owner" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  let id = "";
  const q: any = { select: () => q, eq: (_c: string, v: string) => { id = v; return q; },
    maybeSingle: async () => db.fail ? { data: null, error: { message: "offline" } } : { data: db.rows.has(id) ? { id } : null, error: null } };
  return q;
} } }));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); db.rows = new Set(); db.fail = false;
  setFlowUserId("owner"); setFlowWorkspaceId("owner");
});

/** Nouvel onglet : la copie de l'onglet fermé vient des copies de secours. */
function nouvelOnglet() {
  sessionStorage.clear();
  for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith("creer_flow_presence")) localStorage.removeItem(k); }
}
const page = () => render(<StaleDraftGate><p>Page Créer</p></StaleDraftGate>);

it("oublie le brouillon dont la fiche n'existe plus", async () => {
  saveFlowState({ step: "format", ideaText: "Le parquet d'origine", editingIdeaId: "gone" });
  nouvelOnglet();
  page();
  expect(await screen.findByText("Page Créer")).toBeInTheDocument();
  expect(loadFlowState()).toBeNull();
});

it("garde le brouillon dont la fiche existe", async () => {
  db.rows.add("here");
  saveFlowState({ step: "format", ideaText: "Les portes", editingIdeaId: "here" });
  nouvelOnglet();
  page();
  expect(await screen.findByText("Page Créer")).toBeInTheDocument();
  expect(loadFlowState()?.ideaText).toBe("Les portes");
});

it("ne supprime rien si la base ne répond pas", async () => {
  db.fail = true;
  saveFlowState({ step: "format", ideaText: "Les cheminées", editingIdeaId: "unknown" });
  nouvelOnglet();
  page();
  expect(await screen.findByText("Page Créer")).toBeInTheDocument();
  expect(loadFlowState()?.ideaText).toBe("Les cheminées");
});

it("rechargement du même onglet : rien à vérifier", async () => {
  saveFlowState({ step: "format", ideaText: "Les moulures", editingIdeaId: "gone" });
  page();
  expect(await screen.findByText("Page Créer")).toBeInTheDocument();
  expect(loadFlowState()?.ideaText).toBe("Les moulures");
});

it("oublie toutes les copies orphelines, pas seulement la première", async () => {
  saveFlowState({ step: "format", ideaText: "Le parquet", editingIdeaId: "gone-1" });
  // Deuxième onglet fermé : une autre copie de secours, sur une autre fiche supprimée.
  const key = Object.keys(localStorage).find((k) => k.includes("_backup:owner") && k.includes(":tab:"))!;
  const copy = JSON.parse(localStorage.getItem(key)!);
  localStorage.setItem(key.replace(/:tab:.*/, ":tab:autre-onglet"), JSON.stringify({ ...copy, ideaText: "Les portes", editingIdeaId: "gone-2", ts: copy.ts - 1000 }));
  nouvelOnglet();
  page();
  expect(await screen.findByText("Page Créer")).toBeInTheDocument();
  expect(loadFlowState()).toBeNull();
  nouvelOnglet();
  expect(loadFlowState()).toBeNull();
});
