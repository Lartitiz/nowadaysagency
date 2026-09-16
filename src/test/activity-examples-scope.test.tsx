import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useActivityExamples } from "@/hooks/use-activity-examples";
const m = vi.hoisted(() => ({ scope: "A", owner: "owner-A", loading: false, error: false, demo: false, reads: [] as any[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "manager" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: m.demo, demoActivity: "photographe" }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "workspace_id", value: m.scope }), useProfileOwner: () => ({ userId: m.owner, loading: m.loading, error: m.error }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
 const filters: any[] = []; const q: any = { select: () => q, eq: (...args: any[]) => { filters.push(args); return q; }, maybeSingle: () => new Promise(resolve => m.reads.push({ filters, resolve })) }; return q;
} } }));
beforeEach(() => { m.scope = "A"; m.owner = "owner-A"; m.loading = false; m.error = false; m.demo = false; m.reads = []; });
it("waits for owner resolution then reads the owner account", async () => {
 m.loading = true; const h = renderHook(useActivityExamples); expect(m.reads).toHaveLength(0);
 m.loading = false; h.rerender(); expect(m.reads[0].filters).toEqual([["user_id", "owner-A"]]);
 await act(async () => m.reads[0].resolve({ data: { activite: "conseil" }, error: null })); expect(h.result.current.activityText).toBe("conseil");
});
it("hides previous examples immediately and ignores old A→B→A responses", async () => {
 const h = renderHook(useActivityExamples); m.scope = "B"; m.owner = "owner-B"; h.rerender(); m.scope = "A"; m.owner = "owner-A"; h.rerender();
 await act(async () => m.reads[2].resolve({ data: { activite: "actuelle" } }));
 await act(async () => { m.reads[0].resolve({ data: { activite: "ancienne A" } }); m.reads[1].resolve({ data: { activite: "ancienne B" } }); });
 expect(h.result.current.activityText).toBe("actuelle"); m.scope = "B"; m.owner = "owner-B"; h.rerender(); expect(h.result.current.activityText).toBe("");
});
it("keeps neutral examples on error and avoids reads in demo", async () => {
 const h = renderHook(useActivityExamples); await act(async () => m.reads[0].resolve({ error: new Error("offline") })); expect(h.result.current.activityText).toBe("");
 m.demo = true; h.rerender(); expect(h.result.current.activityText).toBe("photographe"); expect(m.reads).toHaveLength(1);
});
