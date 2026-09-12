import React, { StrictMode, useLayoutEffect } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ userId: "user-test" as string | null, workspace: "A", ready: true, invoke: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: m.userId ? { id: m.userId } : null }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => m.workspace, useWorkspaceReady: () => m.ready }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: m.invoke } } }));
import { useSocialConnections } from "@/hooks/use-social-connections";
const response = (connected = true, expiresAt = "2030-01-01T00:00:00Z") => ({ data: { connections: [{ platform: "instagram", connected, expiresAt }] }, error: null });
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => { m.userId = "user-test"; m.workspace = "A"; m.ready = true; m.invoke.mockReset(); });
afterEach(cleanup);

describe("social connections — current account, workspace visit and request", () => {
  it("audit regression: A connected → B error leaves B unknown with no A status or expiry", async () => {
    m.invoke.mockResolvedValueOnce(response());
    const seen: boolean[] = [];
    const { result, rerender } = renderHook(() => {
      const social = useSocialConnections();
      useLayoutEffect(() => { if (m.workspace === "B") seen.push(social.known); });
      return social;
    });
    await waitFor(() => expect(result.current.known).toBe(true));
    m.workspace = "B";
    m.invoke.mockResolvedValueOnce({ data: null, error: { message: "indisponible" } });
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(seen.every((known) => !known)).toBe(true);
    expect(result.current.known).toBe(false);
    expect(result.current.connected).toEqual({});
    expect(result.current.isConnected("instagram")).toBe(false);
    expect(result.current.getTokenExpiry("instagram")).toBeNull();
  });

  it("audit regression: a late A response cannot overwrite B", async () => {
    const a = deferred();
    m.invoke.mockReturnValueOnce(a.promise).mockResolvedValueOnce(response(false));
    const { result, rerender } = renderHook(() => useSocialConnections());
    m.workspace = "B"; rerender();
    await waitFor(() => expect(result.current.known).toBe(true));
    await act(async () => a.resolve(response()));
    expect(result.current.isConnected("instagram")).toBe(false);
  });

  it("A → B → A ignores both earlier visits, even with the same scope id", async () => {
    const a1 = deferred(), b = deferred(), a2 = deferred();
    m.invoke.mockReturnValueOnce(a1.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(a2.promise);
    const { result, rerender } = renderHook(() => useSocialConnections());
    const oldRefresh = result.current.refresh;
    m.workspace = "B"; rerender();
    m.workspace = "A"; rerender();
    await act(async () => { a1.resolve(response()); b.reject(new Error("old B")); await oldRefresh(); });
    expect(m.invoke).toHaveBeenCalledTimes(3);
    expect(result.current.loading).toBe(true);
    expect(result.current.known).toBe(false);
    await act(async () => a2.resolve(response(false, "2031-01-01T00:00:00Z")));
    expect(result.current.isConnected("instagram")).toBe(false);
    expect(result.current.getTokenExpiry("instagram")).toBe("2031-01-01T00:00:00Z");
  });

  it("concurrent refreshes: newest request wins and an old finally cannot stop loading", async () => {
    m.invoke.mockResolvedValueOnce(response());
    const { result } = renderHook(() => useSocialConnections());
    await waitFor(() => expect(result.current.known).toBe(true));
    const old = deferred(), latest = deferred();
    m.invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    act(() => { void result.current.refresh(); void result.current.refresh(); });
    expect(result.current.known).toBe(false);
    await act(async () => old.resolve(response()));
    expect(result.current.loading).toBe(true);
    await act(async () => latest.resolve({ data: { connections: [] }, error: null }));
    expect(result.current.loading).toBe(false);
    expect(result.current.known).toBe(true);
    expect(result.current.isConnected("instagram")).toBe(false);
    expect(result.current.getTokenExpiry("instagram")).toBeNull();
  });

  it.each([
    { data: null, error: { message: "401" } },
    { data: { error: "expired session", connections: [] }, error: null },
    { data: {}, error: null },
    { data: { connections: [{ platform: "canva", connected: "false" }] }, error: null },
  ])("failed/malformed refresh clears a formerly known connection", async (bad) => {
    m.invoke.mockResolvedValueOnce(response()).mockResolvedValueOnce(bad).mockResolvedValueOnce(response(false));
    const { result } = renderHook(() => useSocialConnections());
    await waitFor(() => expect(result.current.known).toBe(true));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.known).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.connected).toEqual({});
    await act(async () => { await result.current.refresh(); });
    expect(result.current.known).toBe(true);
    expect(result.current.isConnected("instagram")).toBe(false);
  });

  it("logout immediately clears data and invalidates pending replies; another user reloads", async () => {
    m.invoke.mockResolvedValueOnce(response());
    const { result, rerender } = renderHook(() => useSocialConnections());
    await waitFor(() => expect(result.current.known).toBe(true));
    const pending = deferred(); m.invoke.mockReturnValueOnce(pending.promise);
    act(() => { void result.current.refresh(); });
    m.userId = null; rerender();
    expect(result.current.connected).toEqual({});
    expect(result.current.loading).toBe(false);
    await act(async () => pending.resolve(response()));
    expect(result.current.known).toBe(false);
    m.userId = "other-user"; m.invoke.mockResolvedValueOnce(response(false)); rerender();
    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.isConnected("instagram")).toBe(false);
  });

  it("changes user even when workspace id stays the same", async () => {
    const first = deferred();
    m.invoke.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(false));
    const { result, rerender } = renderHook(() => useSocialConnections());
    m.userId = "other-user"; rerender();
    await waitFor(() => expect(result.current.known).toBe(true));
    await act(async () => first.resolve(response()));
    expect(result.current.isConnected("instagram")).toBe(false);
  });

  it("waits for workspace resolution and preserves legacy personal request scoping", async () => {
    m.ready = false; m.workspace = m.userId!;
    m.invoke.mockResolvedValue(response());
    const { result, rerender } = renderHook(() => useSocialConnections());
    expect(result.current.loading).toBe(true);
    expect(m.invoke).not.toHaveBeenCalled();
    m.ready = true; rerender();
    await waitFor(() => expect(result.current.known).toBe(true));
    expect(m.invoke).toHaveBeenLastCalledWith("social-status", { body: { workspace_id: undefined } });
    m.workspace = "B"; rerender();
    await waitFor(() => expect(result.current.known).toBe(true));
    expect(m.invoke).toHaveBeenLastCalledWith("social-status", { body: { workspace_id: "B" } });
  });

  it("preserves expired token metadata for warnings without falsely disconnecting refreshable Canva", async () => {
    m.invoke.mockResolvedValue({ data: { connections: [
      { platform: "canva", connected: true, expiresAt: "2020-01-01T00:00:00Z" },
      { platform: "linkedin", connected: true, expiresAt: "invalid date" },
    ] }, error: null });
    const { result } = renderHook(() => useSocialConnections());
    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.isConnected("canva")).toBe(true);
    expect(result.current.getTokenExpiry("canva")).toBe("2020-01-01T00:00:00Z");
    expect(result.current.getTokenExpiry("linkedin")).toBeNull();
  });

  it("StrictMode replay and unmount invalidate earlier requests and refresh callbacks", async () => {
    const first = deferred();
    m.invoke.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(false));
    const { result, unmount } = renderHook(() => useSocialConnections(), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
    await waitFor(() => expect(result.current.known).toBe(true));
    await act(async () => first.resolve(response()));
    expect(result.current.isConnected("instagram")).toBe(false);
    const refresh = result.current.refresh;
    unmount();
    await refresh();
    expect(m.invoke).toHaveBeenCalledTimes(2);
  });
});

it("keeps Google property selection and LinkedIn analytics distinct, scoped and cleared on error", async () => {
  m.invoke.mockResolvedValueOnce({ data: { connections: [
    { platform: "google", connected: true, needsProperty: true },
    { platform: "linkedin_analytics", connected: true },
  ] }, error: null });
  const { result, rerender } = renderHook(() => useSocialConnections());
  await waitFor(() => expect(result.current.known).toBe(true));
  expect(result.current.isConnected("google")).toBe(true);
  expect(result.current.needsProperty.google).toBe(true);
  expect(result.current.isConnected("linkedin_analytics")).toBe(true);
  expect(result.current.isConnected("linkedin")).toBe(false);
  m.workspace = "B";
  m.invoke.mockRejectedValueOnce(new Error("offline"));
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.needsProperty).toEqual({});
  expect(result.current.isConnected("google")).toBe(false);
  expect(result.current.isConnected("linkedin_analytics")).toBe(false);
});
