import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import InstagramProfile from "@/pages/InstagramProfile";
const m = vi.hoisted(() => ({ scope: "A", ready: true, owner: "owner-A", ownerLoading: false, ownerError: false, reads: [] as any[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "manager" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: m.scope }), useWorkspaceReady: () => m.ready,
 useProfileOwner: () => ({ userId: m.owner, loading: m.ownerLoading, error: m.ownerError, reload: vi.fn() }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/SubPageHeader", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
 const filters: any[] = []; const pending = new Promise(resolve => m.reads.push({ table, filters, resolve }));
 const q: any = { select: () => q, eq: (...args: any[]) => { filters.push(args); return q; }, is: (...args: any[]) => { filters.push(args); return q; }, order: () => q, limit: () => q, maybeSingle: () => pending, then: pending.then.bind(pending) }; return q;
} } }));
const ui = () => <MemoryRouter><InstagramProfile /></MemoryRouter>;
async function answer(start: number, label: string, error = false) {
 await act(async () => { for (let n = start; n < start + 3; n++) { const read = m.reads[n]; read.resolve({ data: read.table === "profiles" ? { instagram_bio: label } : read.table === "audit_validations" ? [] : null, error: error ? new Error("offline") : null }); } });
}
beforeEach(() => { m.scope = "A"; m.ready = true; m.owner = "owner-A"; m.ownerLoading = false; m.ownerError = false; m.reads = []; });
it("waits for a resolved owner and reads profiles by user, audits by workspace", async () => {
 m.ownerLoading = true; const view = render(ui()); expect(m.reads).toHaveLength(0);
 m.ownerLoading = false; view.rerender(ui()); await answer(0, "Bio A");
 expect(m.reads.find(r => r.table === "profiles").filters).toEqual([["user_id", "owner-A"]]);
 expect(m.reads.find(r => r.table === "instagram_audit").filters).toEqual([["workspace_id", "A"]]);
 expect(m.reads.find(r => r.table === "audit_validations").filters).toEqual([["user_id", "manager"]]);
 expect(screen.getByText(/Bio A/)).toBeInTheDocument();
});
it("ignores late profile data across A→B→A", async () => {
 const view = render(ui()); m.scope = "B"; m.owner = "owner-B"; view.rerender(ui()); m.scope = "A"; m.owner = "owner-A"; view.rerender(ui());
 await answer(6, "Bio actuelle"); await answer(3, "Bio B ancienne"); await answer(0, "Bio A ancienne");
 expect(screen.getByText(/Bio actuelle/)).toBeInTheDocument(); expect(screen.queryByText(/ancienne/)).not.toBeInTheDocument();
});
it("reports failed reads instead of inventing an empty profile; retry keeps old routes", async () => {
 render(ui()); await answer(0, "", true); expect(screen.getByRole("alert")).toBeInTheDocument();
 expect(screen.queryByText("Pas fait")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Réessayer" })); await answer(3, "Bio retrouvée");
 expect(screen.getByRole("link", { name: /Ma bio/ })).toHaveAttribute("href", "/instagram/profil/bio");
});
