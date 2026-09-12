import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureServeHandler, installFetchMock, setTestEnv, authedRequest, anthropicToolSuccess, TEST_SUPABASE_URL } from "../_shared/test-edge-harness.ts";
setTestEnv();
const handlers = {
  voice_guides: await captureServeHandler(new URL("../generate-voice-guide/index.ts", import.meta.url).href),
  branding_mirror_results: await captureServeHandler(new URL("./index.ts", import.meta.url).href),
};
const output = {
  coherence_score: 75, summary: "Mirror", alignments: [], gaps: [], quick_wins: [],
  voice_summary: "Guide", tone_keywords: [], do_say: [], dont_say: [], words_to_use: [], words_to_avoid: [],
};
function fixture(table: keyof typeof handlers, role: string | null = "manager", failSave = false, missingOwner = false) {
  const mock = installFetchMock({ anthropic: () => anthropicToolSuccess(table === "voice_guides" ? "rendre_guide_voix" : "rendre_miroir", output) });
  const inner = globalThis.fetch;
  const writes: any[] = []; const reads: URL[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init?.method || "GET";
    const json = (value: any, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.origin === TEST_SUPABASE_URL) {
      if (url.pathname === "/auth/v1/user") return json({ id: `actor-${table}`, aud: "authenticated", role: "authenticated" });
      if (url.pathname === "/rest/v1/workspace_members") {
        if (url.searchParams.get("role") === "eq.owner") {
          const owner = role === "owner" ? `actor-${table}` : url.searchParams.get("workspace_id") === "eq.A" ? "owner-A" : "owner-B";
          return json(missingOwner ? null : { user_id: owner });
        }
        return json(role ? [{ role }] : []);
      }
      if (url.pathname === `/rest/v1/${table}` && method === "POST") {
        if (failSave) return json({ message: "denied", code: "42501" }, 403);
        writes.push(JSON.parse(init.body)); return json(null, 201);
      }
      if (url.pathname.startsWith("/rest/v1/") && !url.pathname.includes("/rpc/") && method === "GET") {
        reads.push(url);
        if (url.pathname === "/rest/v1/brand_profile") return json([{ voice_description: "Declared tone", tone_register: "direct" }]);
      }
    }
    return inner(input, init);
  }) as typeof fetch;
  return { mock, writes, reads, restore: () => { globalThis.fetch = inner; mock.restore(); } };
}
for (const table of Object.keys(handlers) as (keyof typeof handlers)[]) {
  for (const role of ["owner", "manager"]) {
    Deno.test(`${table}: ${role} generates in A then B using each owner; versions append`, async () => {
      const f = fixture(table, role);
      try {
        for (const workspace_id of ["A", "B", "A"]) {
          const res = await handlers[table](authedRequest(`${TEST_SUPABASE_URL}/functions/v1/test`, { workspace_id }));
          assertEquals(res.status, 200); assertEquals((await res.json()).saved, true);
        }
        assertEquals(f.writes.map(w => [w.user_id, w.workspace_id]), [[role === "owner" ? `actor-${table}` : "owner-A", "A"], [role === "owner" ? `actor-${table}` : "owner-B", "B"], [role === "owner" ? `actor-${table}` : "owner-A", "A"]]);
        assertEquals(f.mock.aiUsageInserts.map(w => w.workspace_id), ["A", "B", "A"]);
        assert(f.reads.filter(u => ["/rest/v1/brand_profile", "/rest/v1/branding_audits", "/rest/v1/calendar_posts"].includes(u.pathname)).every(u => ["eq.A", "eq.B"].includes(u.searchParams.get("workspace_id")!)));
      } finally { f.restore(); }
    });
  }
  for (const scenario of ["nonmember", "viewer", "missing-owner"]) {
    Deno.test(`${table}: ${scenario} denied before AI or save/usage`, async () => {
      const f = fixture(table, scenario === "nonmember" ? null : scenario === "viewer" ? "viewer" : "manager", false, scenario === "missing-owner");
      try {
        const res = await handlers[table](authedRequest(`${TEST_SUPABASE_URL}/functions/v1/test`, { workspace_id: "A" }));
        assertEquals(res.status, 403); await res.text();
        assertEquals(f.mock.anthropicCallCount, 0); assertEquals(f.mock.aiUsageInserts.length, 0); assertEquals(f.writes.length, 0);
      } finally { f.restore(); }
    });
  }
  Deno.test(`${table}: save failure has no success receipt or quota usage`, async () => {
    const f = fixture(table, "manager", true);
    try {
      const res = await handlers[table](authedRequest(`${TEST_SUPABASE_URL}/functions/v1/test`, { workspace_id: "A" }));
      assertEquals(res.status, 500); const body = await res.json();
      assertEquals(body.saved, undefined); assert(body.error.includes("enregistré"));
      assertEquals(f.mock.anthropicCallCount, 1); assertEquals(f.mock.aiUsageInserts.length, 0);
    } finally { f.restore(); }
  });
  Deno.test(`${table}: legacy request retains null workspace and authenticated owner`, async () => {
    const f = fixture(table);
    try {
      const res = await handlers[table](authedRequest(`${TEST_SUPABASE_URL}/functions/v1/test`, {}));
      assertEquals(res.status, 200); await res.text();
      assertEquals(f.writes[0].user_id, `actor-${table}`); assertEquals(f.writes[0].workspace_id, null);
    } finally { f.restore(); }
  });
}
