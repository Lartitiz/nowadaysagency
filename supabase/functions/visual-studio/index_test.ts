import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleStudioRequest } from "./index.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  space = id(2),
  sessionId = id(3),
  proposalId = id(4);
const base = { session_id: sessionId, workspace_id: space };
function fixture(role = "owner", replay = false) {
  const saved = globalThis.fetch,
    env = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY",
      "PHOTOROOM_API_KEY",
    ].map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("SUPABASE_URL", "https://studio.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
  Deno.env.set("SUPABASE_ANON_KEY", "anon");
  Deno.env.set("PHOTOROOM_API_KEY", "test-only");
  const requests: string[] = [];
  const session = {
    id: sessionId,
    workspace_id: space,
    user_id: actor,
    source_photo_id: id(5),
    source_ready: true,
    source_path: "original",
    name: "Photo",
    revision: 0,
    messages: [],
    proposal: {
      id: proposalId,
      operation: "background",
      summary: "Fond crème",
      background_prompt: "cream",
      cost: 1,
    },
  };
  const version = {
    id: proposalId,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    status: "processing",
    proposal: session.proposal,
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    requests.push(url.pathname);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname === "/auth/v1/user")
      return json({ id: actor, aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/workspace_members") return json({ role });
    if (url.pathname === "/rest/v1/visual_studio_sessions")
      return json(session);
    if (url.pathname === "/rest/v1/visual_studio_versions")
      return json(replay ? [version] : []);
    if (url.pathname === "/rest/v1/rpc/has_role") return json(true);
    if (url.pathname.startsWith("/storage/v1/object/sign/"))
      return json({ signedURL: "/signed-original" });
    throw new Error(
      "Unexpected network request " + url.pathname + " " + init?.method,
    );
  };
  return {
    requests,
    restore: () => {
      globalThis.fetch = saved;
      for (const [k, v] of env) {
        if (v === undefined) Deno.env.delete(k);
        else Deno.env.set(k, v);
      }
    },
  };
}
const request = (body: unknown, auth = true) =>
  new Request("https://studio.test/functions/v1/visual-studio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer test" } : {}),
    },
    body: JSON.stringify(body),
  });
Deno.test("Studio requires authentication before accessing media", async () => {
  const f = fixture();
  try {
    assertEquals(
      (await handleStudioRequest(request({ ...base, action: "read" }, false)))
        .status,
      401,
    );
    assertEquals(f.requests.length, 0);
  } finally {
    f.restore();
  }
});
Deno.test(
  "viewer cannot ask the interpreter, generate, create or save",
  async () => {
    const f = fixture("viewer");
    try {
      for (const action of ["message", "generate", "create", "save"])
        assertEquals(
          (await handleStudioRequest(request({ ...base, action }))).status,
          403,
        );
      assertEquals(
        f.requests.some((p) => p.includes("studio_confirm")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);
Deno.test(
  "replaying an accepted confirmation returns job state with no provider request or second claim",
  async () => {
    const f = fixture("owner", true);
    try {
      const res = await handleStudioRequest(
        request({ ...base, action: "generate", proposal_id: proposalId }),
      );
      assertEquals(res.status, 200);
      assertEquals((await res.json()).versions[0].id, proposalId);
      assertEquals(
        f.requests.some((p) => p.includes("studio_confirm")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);
Deno.test(
  "stale conversation revision fails before paying the interpreter",
  async () => {
    const f = fixture();
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Crème",
          request_id: id(6),
          revision: 2,
        }),
      );
      assertEquals(res.status, 409);
      assertEquals((await res.json()).code, "refresh_request");
      assertEquals(
        f.requests.some((p) => p.includes("studio_reserve")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);
Deno.test(
  "invalid source identifiers and oversized messages fail schema validation",
  async () => {
    const f = fixture();
    try {
      for (const body of [
        { ...base, action: "create", photo_id: "outside-storage/path" },
        { ...base, action: "message", message: "x".repeat(1001) },
      ])
        assertEquals((await handleStudioRequest(request(body))).status, 400);
    } finally {
      f.restore();
    }
  },
);
