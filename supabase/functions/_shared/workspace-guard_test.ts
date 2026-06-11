import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertWorkspaceMembership,
  workspaceDeniedResponse,
} from "./workspace-guard.ts";

// Minimal mock builder for the supabase-js query chain:
// sb.from(table).select(cols).eq(col, val).eq(col, val).maybeSingle()
function mockSb(
  expected: { workspaceId: string; userId: string },
  response: { data: any; error: any },
) {
  const filters: Record<string, unknown> = {};
  const chain: any = {
    select: (_cols: string) => chain,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    },
    maybeSingle: async () => {
      assertEquals(filters["workspace_id"], expected.workspaceId);
      assertEquals(filters["user_id"], expected.userId);
      return response;
    },
  };
  return {
    from: (table: string) => {
      assertEquals(table, "workspace_members");
      return chain;
    },
  };
}

Deno.test("legacy mode: returns ok when workspaceId is null", async () => {
  const sb = { from: () => { throw new Error("should not query"); } };
  const r = await assertWorkspaceMembership(sb, "user-1", null);
  assertEquals(r, { ok: true, role: "legacy" });
});

Deno.test("legacy mode: returns ok when workspaceId is undefined", async () => {
  const sb = { from: () => { throw new Error("should not query"); } };
  const r = await assertWorkspaceMembership(sb, "user-1", undefined);
  assertEquals(r, { ok: true, role: "legacy" });
});

Deno.test("member found: returns ok with role from DB", async () => {
  const sb = mockSb(
    { workspaceId: "ws-1", userId: "user-1" },
    { data: { role: "owner" }, error: null },
  );
  const r = await assertWorkspaceMembership(sb, "user-1", "ws-1");
  assertEquals(r, { ok: true, role: "owner" });
});

Deno.test("non-member: returns 403 when no row", async () => {
  const sb = mockSb(
    { workspaceId: "ws-1", userId: "intruder" },
    { data: null, error: null },
  );
  const r = await assertWorkspaceMembership(sb, "intruder", "ws-1");
  assertEquals(r, { ok: false, status: 403 });
});

Deno.test("db error: returns 403 (fail-closed)", async () => {
  const sb = mockSb(
    { workspaceId: "ws-1", userId: "user-1" },
    { data: null, error: { message: "boom" } },
  );
  const r = await assertWorkspaceMembership(sb, "user-1", "ws-1");
  assertEquals(r, { ok: false, status: 403 });
});

Deno.test("workspaceDeniedResponse: 403 + error body + cors merged", async () => {
  const cors = { "access-control-allow-origin": "*" };
  const res = workspaceDeniedResponse(cors);
  assertStrictEquals(res.status, 403);
  assertEquals(res.headers.get("content-type"), "application/json");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  const body = await res.json();
  assertEquals(body.error, "workspace_access_denied");
  assertEquals(typeof body.message, "string");
});
