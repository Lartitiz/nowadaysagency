import React, { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";

const fixture = vi.hoisted(() => ({
  user: "owner", workspace: "A" as string | null, own: true, ready: true,
  rows: [] as any[], requests: [] as any[], readError: null as any,
  invoke: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: fixture.user } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceFilter: () => ({ column: fixture.workspace ? "workspace_id" : "user_id", value: fixture.workspace || fixture.user }),
  useWorkspaceReady: () => fixture.ready, useIsOwnSpace: () => fixture.own,
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/SubPageHeader", () => ({ default: () => null }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: (...args: any[]) => fixture.invoke(...args) }));
vi.mock("sonner", () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const filters: any[] = []; const orders: string[] = []; let limit = Infinity;
  const query = {
    select: () => query, order: (key: string) => { orders.push(key); return query; },
    eq: (key: string, val: any) => { filters.push([key, val]); return query; },
    is: (key: string, val: any) => { filters.push([key, val]); return query; },
    limit: (n: number) => { limit = n; return query; },
    maybeSingle: async () => {
      fixture.requests.push({ table, filters });
      const rows = fixture.rows.filter(r => r.table === table && filters.every(([k, v]) => r[k] === v))
        .sort((a, b) => { for (const k of orders) { const cmp = String(b[k] || "").localeCompare(String(a[k] || "")); if (cmp) return cmp; } return 0; }).slice(0, limit);
      return { data: rows[0] || null, error: fixture.readError };
    },
  }; return query;
} } }));

import VoiceGuidePage from "@/pages/VoiceGuidePage";
import { useBrandingMirror } from "@/hooks/use-branding-mirror";
import { loadGeneratedBranding } from "@/lib/branding-generated";
const guide = (name: string) => ({ brand_name: name, voice_summary: name, tone_keywords: [], do_say: [], dont_say: [], words_to_use: [], words_to_avoid: [], emotions_to_create: [] });
const row = (table: string, id: string, workspace_id: string | null, user_id = "owner") => ({ table, id, user_id, workspace_id, created_at: id, updated_at: id, guide_data: guide(id), summary: id });
function deferred() { let resolve!: (v: any) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { cleanup(); vi.clearAllMocks(); Object.assign(fixture, { user: "owner", workspace: "A", own: true, ready: true, rows: [], requests: [], readError: null }); });

describe("Generated branding reads", () => {
  it("chooses the newest scoped version while preserving legacy and other spaces", async () => {
    fixture.rows = [row("voice_guides", "1", "A"), row("voice_guides", "2", "A"), row("voice_guides", "3", "B"), row("voice_guides", "4", null)];
    expect((await loadGeneratedBranding("voice_guides", "owner", "A", true))?.id).toBe("2");
    expect(fixture.rows).toHaveLength(4);
  });
  it("only uses NULL legacy rows on the personal space, never the manager's legacy or B", async () => {
    fixture.rows = [row("voice_guides", "legacy", null), row("voice_guides", "B", "B")];
    expect((await loadGeneratedBranding("voice_guides", "owner", "A", true))?.id).toBe("legacy");
    expect(await loadGeneratedBranding("voice_guides", "owner", "C", false)).toBeNull();
    expect((await loadGeneratedBranding("voice_guides", "owner", null, true))?.id).toBe("legacy");
  });
  it("does not turn a denied read into an empty guide or fallback", async () => {
    fixture.readError = new Error("denied");
    await expect(loadGeneratedBranding("voice_guides", "owner", "A", true)).rejects.toThrow("denied");
    expect(fixture.requests).toHaveLength(1);
  });
});

describe("VoiceGuidePage", () => {
  it("waits for workspace resolution, reloads on A/B without unmounting the page, clears empty B", async () => {
    fixture.ready = false; fixture.rows = [row("voice_guides", "Guide A", "A")];
    const view = render(<VoiceGuidePage />);
    expect(fixture.requests).toHaveLength(0);
    fixture.ready = true; view.rerender(<VoiceGuidePage />);
    await screen.findAllByText("Guide A");
    fixture.workspace = "B"; fixture.own = false; view.rerender(<VoiceGuidePage />);
    await screen.findByText("Ton guide de voix personnalisé");
    expect(screen.queryByText("Guide A")).toBeNull();
  });
  it("generation then reload uses the saved workspace version", async () => {
    fixture.invoke.mockImplementation(async () => {
      fixture.rows.push(row("voice_guides", "New guide", "A"));
      return { data: { saved: true, guide: guide("New guide") } };
    });
    const view = render(<VoiceGuidePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Générer mon guide/ }));
    await screen.findAllByText("New guide"); view.unmount(); render(<VoiceGuidePage />);
    await screen.findAllByText("New guide");
    expect(fixture.invoke).toHaveBeenCalledTimes(1);
    expect(fixture.invoke.mock.calls[0][1].body.workspace_id).toBe("A");
  });
  it("a late A generation never replaces B or shows a success toast", async () => {
    const pending = deferred(); fixture.invoke.mockReturnValue(pending.promise);
    const view = render(<VoiceGuidePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Générer mon guide/ }));
    fixture.workspace = "B"; fixture.own = false; view.rerender(<VoiceGuidePage />);
    await act(async () => pending.resolve({ data: { saved: true, guide: guide("LATE A") } }));
    expect(screen.queryByText("LATE A")).toBeNull(); expect(fixture.success).not.toHaveBeenCalled();
  });
  it("save failure produces no guide/success, and read failure offers retry", async () => {
    fixture.invoke.mockResolvedValue({ data: { error: "Save failed" } });
    const view = render(<VoiceGuidePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Générer mon guide/ }));
    await waitFor(() => expect(fixture.error).toHaveBeenCalled());
    expect(fixture.success).not.toHaveBeenCalled(); view.unmount();
    fixture.readError = new Error("denied"); render(<VoiceGuidePage />);
    await screen.findByRole("alert"); expect(screen.queryByRole("button", { name: /Générer mon guide/ })).toBeNull();
  });
});

describe("Branding mirror lifecycle", () => {
  it("a manager reloads the owner's existing mirror and refresh explicitly generates once", async () => {
    fixture.user = "manager"; fixture.own = false; fixture.rows = [row("branding_mirror_results", "old", "A")];
    fixture.invoke.mockResolvedValue({ data: { saved: true, summary: "fresh" } });
    const { result } = renderHook(() => useBrandingMirror(), { wrapper: StrictMode });
    await act(() => result.current.runMirror());
    expect(result.current.mirrorData.summary).toBe("old"); expect(fixture.invoke).not.toHaveBeenCalled();
    await act(() => result.current.refreshMirror());
    expect(result.current.mirrorData.summary).toBe("fresh"); expect(fixture.invoke).toHaveBeenCalledTimes(1);
  });
  it("A -> B -> A drops the stale response and allows B to generate", async () => {
    const pending = deferred(); fixture.invoke.mockReturnValueOnce(pending.promise).mockResolvedValue({ data: { saved: true, summary: "B result" } });
    const { result, rerender } = renderHook(() => useBrandingMirror());
    let initial!: Promise<void>;
    act(() => { initial = result.current.runMirror(); });
    await waitFor(() => expect(fixture.invoke).toHaveBeenCalledTimes(1));
    fixture.workspace = "B"; fixture.own = false; rerender();
    expect(result.current.mirrorOpen).toBe(false); expect(result.current.mirrorData).toBeNull();
    await act(() => result.current.runMirror()); expect(result.current.mirrorData.summary).toBe("B result");
    fixture.workspace = "A"; rerender();
    await act(async () => { pending.resolve({ data: { saved: true, summary: "stale A" } }); await initial; });
    expect(result.current.mirrorData).toBeNull(); expect(result.current.mirrorLoading).toBe(false);
  });
  it("deduplicates clicks; save failure never becomes a cached success", async () => {
    fixture.invoke.mockResolvedValue({ data: { saved: false, summary: "unsaved" } });
    const { result } = renderHook(() => useBrandingMirror());
    await act(async () => { await Promise.all([result.current.runMirror(), result.current.runMirror()]); });
    expect(fixture.invoke).toHaveBeenCalledTimes(1); expect(fixture.error).toHaveBeenCalled();
    expect(result.current.mirrorData).toBeNull(); expect(result.current.mirrorOpen).toBe(false);
  });
});
