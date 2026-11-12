import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }), refreshSession: async () => ({ data: {}, error: null }) } } }));
vi.mock("@/lib/generation-telemetry", () => ({ reportGenerationFailure: vi.fn() }));
import { streamContentCoaching } from "@/lib/content-coaching-stream";

const ndjson = (chunks: string[]) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); chunks.forEach(x => c.enqueue(e.encode(x))); c.close(); } }), { headers: { "Content-Type": "application/x-ndjson" } });
beforeEach(() => vi.unstubAllGlobals());

describe("streamContentCoaching", () => {
  it("delivers each event as it arrives, even split across chunks, and returns the final answer", async () => {
    const fetch = vi.fn(async () => ndjson(['{"type":"stage","stage":"preparation"}\n{"type":"idea","idea":{"subject":"A"},"re', 'ady":1,"total":4}\n', '{"type":"done","version":2,"ideas":[{"subject":"A"}]}']));
    vi.stubGlobal("fetch", fetch);
    const events: any[] = [];
    const final = await streamContentCoaching({ answers: {} }, e => events.push(e));
    expect(events.map(e => e.type)).toEqual(["stage", "idea"]);
    expect(final).toMatchObject({ version: 2, ideas: [{ subject: "A" }] });
    expect(JSON.parse((fetch.mock.calls[0] as any)[1].body).stream).toBe(true);
  });
  it("turns a server error event or a cut connection into an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjson(['{"type":"error","error":"Les idées reçues sont incomplètes."}\n'])));
    await expect(streamContentCoaching({}, () => {})).rejects.toThrow("incomplètes");
    vi.stubGlobal("fetch", vi.fn(async () => ndjson(['{"type":"stage","stage":"writing"}\n'])));
    await expect(streamContentCoaching({}, () => {})).rejects.toThrow("coupée");
  });
  it("accepts a plain JSON answer (quota reached, missing activity)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ needs_activity: true }), { headers: { "Content-Type": "application/json" } })));
    expect(await streamContentCoaching({}, () => {})).toEqual({ needs_activity: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Quota atteint" }), { status: 429, headers: { "Content-Type": "application/json" } })));
    await expect(streamContentCoaching({}, () => {})).rejects.toThrow("Quota atteint");
  });
});
