// The endpoint now calls one transactional RPC. Workspace/channel/legacy/rights
// behavior is exercised against PostgreSQL by supabase/tests/calendar-share.sql.
// These tests exercise the REAL handler + Supabase SDK transport, ensuring no
// direct post writes bypass the RPC and no failed/empty RPC becomes a success.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("ALLOWED_ORIGIN", "https://nowadays-assistant.fr");
let handler: (req: Request) => Promise<Response>;
const originalServe = Deno.serve;
try {
  // Deno.serve's server return type is irrelevant: capture without opening a socket.
  Deno.serve = ((callback: typeof handler) => {
    handler = callback;
    return { finished: Promise.resolve(), shutdown: async () => {} };
  }) as typeof Deno.serve;
  await import("./index.ts");
} finally { Deno.serve = originalServe; }
const originalFetch = globalThis.fetch;

interface RpcCall { method: string; path: string; authorization: string | null; body: Record<string, unknown> }
function mockRpc(result: unknown, status = 200) {
  const calls: RpcCall[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    // Reject any old direct read/PATCH/insert path: all write checks must be atomic.
    calls.push({ method: request.method, path, authorization: request.headers.get("authorization"), body: await request.json() });
    assertEquals(path, "/rest/v1/rpc/public_calendar_write");
    assertEquals(request.method, "POST");
    return new Response(JSON.stringify(result), { status, headers: { "content-type": "application/json" } });
  };
  return calls;
}
function request(body: Record<string, unknown> = {}) {
  return new Request("https://edge.local/public-calendar-edit", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "tok-1", post_id: "post-1", field: "status", value: "ready", ...body }),
  });
}

Deno.test("public-calendar-edit: one service-role RPC carries token, target, action and expected version", async () => {
  const calls = mockRpc({ success: true, updated_at: "2026-09-14T12:00:00Z" });
  try {
    const response = await handler(request({ expected_updated_at: "2026-09-14T11:00:00Z", author_name: "Guest" }));
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { success: true, updated_at: "2026-09-14T12:00:00Z" });
    assertEquals(calls.length, 1);
    assertEquals(calls[0].authorization, "Bearer service-role-test");
    assertEquals(calls[0].body, { p_token: "tok-1", p_post_id: "post-1", p_action: "status", p_value: "ready", p_author: "Guest", p_request_id: null, p_expected_updated_at: "2026-09-14T11:00:00Z" });
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("public-calendar-edit: preserves RPC scope, revocation, permission, conflict and quota refusals", async () => {
  for (const [error, status] of [["post_not_found",404],["invalid_token",404],["expired",404],["permission_denied",403],["conflict",409],["structured_content_required",409],["rate_limit",429]] as const) {
    const calls = mockRpc({ error, status });
    try {
      const response = await handler(request());
      assertEquals(response.status, status);
      assertEquals(await response.json(), { error });
      assertEquals(calls.length, 1);
    } finally { globalThis.fetch = originalFetch; }
  }
});

Deno.test("public-calendar-edit: historic clients may omit version and receipt; RPC retains scope decisions", async () => {
  const calls = mockRpc({ success: true });
  try {
    const response = await handler(request({ token: "historical-token" }));
    assertEquals(response.status, 200);
    assertEquals((await response.json()).success, true);
    assertEquals(calls[0].body.p_token, "historical-token");
    assertEquals(calls[0].body.p_expected_updated_at, null);
    assertEquals(calls[0].body.p_request_id, null);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("public-calendar-edit: database failure or empty receipt never becomes success", async () => {
  for (const [result, status] of [[{message:"database failure"},500],[null,200]] as const) {
    const calls=mockRpc(result,status);
    try {
      const response = await handler(request());
      assertEquals(response.status,500);
      assertEquals(await response.json(),{error:"write_failed"});
      assertEquals(calls.length,1);
      assertEquals(calls[0].path,"/rest/v1/rpc/public_calendar_write");
    } finally { globalThis.fetch = originalFetch; }
  }
});

Deno.test("public-calendar-edit: wording JSON and receipt reach the same transaction without truncation", async () => {
  const calls = mockRpc({ success: true });
  const value = JSON.stringify([{ title:"New wording", image:"preserved.jpg", id:"same-id" }]);
  try {
    const response = await handler(request({ field:"wording",value,request_id:"receipt-1" }));
    assertEquals(response.status,200);
    assertEquals(calls.length,1);
    assertEquals(calls[0].body.p_action,"wording");
    assertEquals(calls[0].body.p_value,value);
    assertEquals(calls[0].body.p_request_id,"receipt-1");
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("public-calendar-edit: null/invalid actions and non-text values stop before database access", async () => {
  for (const body of [{field:null},{field:"notes"},{value:null},{value:42},{token:null},{post_id:null}]) {
    const calls=mockRpc({success:true});
    try {
      const response=await handler(request(body));
      assertEquals(response.status,400);
      assertEquals(calls.length,0);
    } finally { globalThis.fetch=originalFetch; }
  }
});
