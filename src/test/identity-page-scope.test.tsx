import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BrandingPage from "@/pages/BrandingPage";
const m = vi.hoisted(() => ({ scope: "A", ready: true, reads: [] as any[], pending: null as any }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ loading: !m.ready }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: m.scope }), useWorkspaceId: () => m.scope, useWorkspaceReady: () => m.ready }));
vi.mock("@/lib/identity-overview", async original => ({ ...await original<typeof import("@/lib/identity-overview")>(), loadIdentityOverview: () => new Promise((resolve, reject) => m.reads.push({ resolve, reject })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
 const q: any = { select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q, maybeSingle: () => Promise.resolve({ data: table === "branding_autofill" ? m.pending : null, error: null }) }; return q;
} } }));
vi.mock("@/hooks/use-branding-mirror", () => ({ useBrandingMirror: () => ({ mirrorOpen: false, setMirrorOpen: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/branding/BrandingDangerZone", () => ({ default: () => null }));
vi.mock("@/components/branding/BrandingSynthesisSheet", () => ({ default: () => null }));
vi.mock("@/components/branding/BrandingImport", () => ({ default: () => <div>Import volontaire</div> }));
vi.mock("@/components/branding/BrandingReview", () => ({ default: ({ onDone }: any) => <button onClick={() => onDone(false)}>Relire plus tard</button> }));
vi.mock("@/components/CoachingFlow", () => ({ default: () => null }));
vi.mock("@/lib/posthog", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("framer-motion", () => ({ motion: { div: ({ children }: any) => <div>{children}</div> } }));
const data = (name = "") => ({ storytellingList: [], publics: [], persona: null, proposition: name ? { version_final: name } : null, brandProfile: null, strategy: null, offersList: [], charter: null });
const ui = () => <MemoryRouter><BrandingPage /></MemoryRouter>;
const answer = async (i: number, name = "") => { await act(async () => m.reads[i].resolve(data(name))); };
beforeEach(() => { m.scope = "A"; m.ready = true; m.reads = []; m.pending = null; });
describe("identity page state", () => {
 it("waits for the workspace and keeps import optional on a truly empty account", async () => {
  m.ready = false; const view = render(ui()); expect(m.reads).toHaveLength(0);
  m.ready = true; view.rerender(ui()); await answer(0);
  expect(screen.getByRole("link", { name: "Décrire mon activité" })).toBeInTheDocument();
  expect(screen.queryByText("Import volontaire")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Passer à la création" })).toHaveAttribute("href", "/creer");
 });
 it("isolates every A→B→A visit, including late reads from the first A", async () => {
  const view = render(ui()); m.scope = "B"; view.rerender(ui()); m.scope = "A"; view.rerender(ui());
  await answer(2, "A actuelle"); await answer(1, "B ancienne"); await answer(0, "A ancienne");
  expect(screen.getByText("A actuelle")).toBeInTheDocument(); expect(screen.queryByText(/ancienne/)).not.toBeInTheDocument();
 });
 it("keeps failed reads distinct from empty data and retries", async () => {
  render(ui()); await act(async () => m.reads[0].reject(new Error("unavailable")));
  expect(screen.queryByRole("link", { name: "Décrire mon activité" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" })); await answer(1, "Données retrouvées");
  expect(screen.getByText("Données retrouvées")).toBeInTheDocument();
 });
 it("keeps an imported review reopenable after postponement even with complete data", async () => {
  m.pending = { id: "review-A", analysis_result: { sources_used: [], reviewed_sections: [] } };
  render(ui()); await answer(0, "Présentation existante");
  fireEvent.click(screen.getByRole("button", { name: "Relire plus tard" }));
  await waitFor(() => expect(m.reads).toHaveLength(2)); await answer(1, "Présentation existante");
  expect(screen.getByText("Des propositions importées sont à relire.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Les ouvrir" }));
  expect(screen.getByRole("button", { name: "Relire plus tard" })).toBeInTheDocument();
 });
});
