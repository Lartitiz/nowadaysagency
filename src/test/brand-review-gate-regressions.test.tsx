import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({ rows: [] as any[], workspace: "w1", failed: false }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: m.workspace }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const filters: [string, any][] = [];
  const q: any = { select: () => q, eq: (k: string, v: any) => { filters.push([k, v]); return q; }, limit: () => q,
    maybeSingle: async () => ({ data: m.rows.find(row => filters.every(([k, v]) => row[k] === v)) || null, error: m.failed ? { message: "Read failed" } : null }) };
  return q;
} } }));
import { usePendingBrandReview } from "@/hooks/use-pending-brand-review";
import BrandReviewGate from "@/components/branding/BrandReviewGate";
const Status = () => { const { pending, checking } = usePendingBrandReview(); return <p>{checking ? "checking" : pending ? "pending" : "available"}</p>; };
const Destination = () => { const location = useLocation(); return <output>{JSON.stringify({ search: location.search, state: location.state })}</output>; };
beforeEach(() => { m.rows = []; m.workspace = "w1"; m.failed = false; });
describe("Pending review is independent from completeness", () => {
  it.each([{ rows: [] }, { rows: [{ id: "done", workspace_id: "w1", autofill_status: "completed" }] }])("does not gate absent or completed imports", async ({ rows }) => {
    m.rows = rows;
    render(<QueryClientProvider client={new QueryClient()}><Status /></QueryClientProvider>);
    await screen.findByText("available");
  });
  it("keeps a partial review pending, ignores other workspaces, and resets on workspace switch", async () => {
    m.rows = [{ id: "pending", workspace_id: "w1", autofill_status: "pending_review", analysis_result: { reviewed_sections: ["story"] } }];
    const client = new QueryClient();
    const view = render(<QueryClientProvider client={client}><Status /></QueryClientProvider>);
    await screen.findByText("pending");
    m.workspace = "w2"; view.rerender(<QueryClientProvider client={client}><Status /></QueryClientProvider>);
    await screen.findByText("available");
  });
  it("does not block creation when the pending lookup fails", async () => {
    m.failed = true;
    render(<QueryClientProvider client={new QueryClient()}><Status /></QueryClientProvider>);
    await screen.findByText("available");
  });
  it("retains idea, channel, format and attachments in the return state", async () => {
    const draft = { idea: "Mon idée", platform: "linkedin", format: "carousel", photos: ["fixture-photo"], step: 2 };
    render(<MemoryRouter initialEntries={["/creer"]}><Routes>
      <Route path="/creer" element={<BrandReviewGate returnTo="/creer?canal=linkedin" returnState={draft} />} />
      <Route path="/branding" element={<Destination />} />
    </Routes></MemoryRouter>);
    fireEvent.click(screen.getByText(/Valider ma fiche de marque/));
    const output = JSON.parse((await screen.findByRole("status")).textContent || "{}");
    expect(output.state.creationReturnState).toEqual(draft);
    expect(new URLSearchParams(output.search).get("returnTo")).toBe("/creer?canal=linkedin");
  });
});
