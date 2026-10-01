import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
vi.mock("@/lib/idea-brief-request", () => ({ withIdeaBrief: (_name: string, body: unknown) => body }));
import { invokeWithHeartbeat } from "@/lib/invoke-with-heartbeat";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("a failed session read never launches or retries a generation, and never shows the raw abort", async () => {
  mocks.getSession.mockRejectedValue(new DOMException("signal is aborted without reason", "AbortError"));
  const result = await invokeWithHeartbeat("carousel-ai");
  expect(result.error?.code).toBe("SESSION_UNAVAILABLE");
  expect(result.error?.message).toContain("vérifier ta connexion");
  expect(result.error?.message).not.toContain("aborted");
  expect(fetchMock).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it("a session read which never resolves releases the UI after 15 seconds, before any POST", async () => {
  mocks.getSession.mockImplementation(() => new Promise(() => {}));
  const pending = invokeWithHeartbeat("carousel-ai");
  await vi.advanceTimersByTimeAsync(15000);
  expect((await pending).error?.code).toBe("SESSION_UNAVAILABLE");
  expect(fetchMock).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it("an explicit session error cannot use the stale token returned alongside it", async () => {
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "stale" } }, error: new Error("offline") });
  expect((await invokeWithHeartbeat("carousel-ai")).error?.code).toBe("SESSION_UNAVAILABLE");
  expect(fetchMock).not.toHaveBeenCalled();
});

function events(lines: string, keepOpen = false, cancel = vi.fn()) {
  return new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(lines));
    if (!keepOpen) controller.close();
  }, cancel }), { headers: { "Content-Type": "text/event-stream" } });
}

it("a complete terminal event succeeds without waiting for the proxy to close the socket", async () => {
  const cancel = vi.fn();
  fetchMock.mockResolvedValue(events('data: {"type":"done","full":"{\\"content\\":\\"texte conservé\\"}"}\n', true, cancel));
  const result = await invokeWithHeartbeat("carousel-ai");
  expect(result).toEqual({ data: { content: "texte conservé" }, error: null });
  expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("a final event without trailing newline is not discarded", async () => {
  fetchMock.mockResolvedValue(events('data: {"type":"done","full":"{\\"content\\":\\"récit\\"}"}'));
  expect((await invokeWithHeartbeat("carousel-ai")).data).toEqual({ content: "récit" });
});

it("a stream read failure cleans up its timer without replaying the paid POST", async () => {
  fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(c) {
    c.error(new DOMException("signal is aborted without reason", "AbortError"));
  } }), { headers: { "Content-Type": "text/event-stream" } }));
  const result = await invokeWithHeartbeat("carousel-ai");
  expect(result.error?.code).toBe("NETWORK"); expect(result.error?.message).not.toContain("aborted");
  expect(fetchMock).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it("an abort reported by SSE is readable while an explicit quota keeps its data", async () => {
  fetchMock.mockResolvedValueOnce(events('data: {"type":"error","error":"signal is aborted without reason"}\n'));
  expect((await invokeWithHeartbeat("carousel-ai")).error?.message).toContain("connexion au service");
  const quota = { error: "limit_reached", quota: { limit: 5 }, message: "Limite atteinte." };
  fetchMock.mockResolvedValueOnce(events(`data: ${JSON.stringify({ type: "error", error: JSON.stringify(quota) })}\n`));
  const result = await invokeWithHeartbeat("carousel-ai");
  expect(result.data).toEqual(quota); expect(result.error?.isRateLimit).toBe(true);
});

it("a broken JSON response cannot be returned as a successful empty generation", async () => {
  fetchMock.mockResolvedValue(new Response('truncated{', { headers: { "Content-Type": "application/json" } }));
  const result = await invokeWithHeartbeat("carousel-ai");
  expect(result.data).toBeNull(); expect(result.error).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
