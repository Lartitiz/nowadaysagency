import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleStudioRequest } from "./index.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  space = id(2),
  sessionId = id(3),
  proposalId = id(4);
const base = { studio_version: 2, session_id: sessionId, workspace_id: space };
function fixture(role = "owner", replay = false) {
  const saved = globalThis.fetch,
    env = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY",
      "PHOTOROOM_API_KEY",
      "ANTHROPIC_API_KEY",
    ].map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("SUPABASE_URL", "https://studio.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
  Deno.env.set("SUPABASE_ANON_KEY", "anon");
  Deno.env.set("PHOTOROOM_API_KEY", "test-only");
  Deno.env.set("ANTHROPIC_API_KEY", "test-only");
  const requests: string[] = [];
  const payloads: Record<string, unknown>[] = [];
  let intent: Record<string, unknown> = {
    operation: "advise",
    summary: "Une illustration adaptée à ton offre.",
  };
  const session = {
    id: sessionId,
    workspace_id: space,
    user_id: actor,
    source_photo_id: id(5) as string | null,
    references: [] as unknown[],
    brief: "",
    source_metadata: {},
    source_ready: true,
    source_path: "original" as string | null,
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
    if (url.pathname === "/rest/v1/visual_studio_sessions") {
      if (init?.method === "PATCH")
        Object.assign(session, JSON.parse(String(init.body)));
      return json(session);
    }
    if (url.pathname === "/rest/v1/rpc/studio_reserve_interpretation")
      return json(true);
    if (url.pathname.startsWith("/rest/v1/brand_"))
      return json({ mission: "Ateliers artisanaux" });
    if (url.pathname === "/rest/v1/user_photos") return json([]);
    if (url.pathname === "/v1/messages") {
      payloads.push(JSON.parse(String(init?.body)));
      return json({
        content: [
          { type: "tool_use", name: "prepare_photo_request", input: intent },
        ],
        stop_reason: "tool_use",
      });
    }
    if (
      url.pathname.startsWith("/storage/v1/object/") &&
      !url.pathname.includes("/sign/")
    )
      return new Response(new Blob(["source"], { type: "image/jpeg" }));
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
    session,
    payloads,
    setIntent: (value: Record<string, unknown>) => {
      intent = value;
    },
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

Deno.test(
  "question without a photo loads the brand, advises and never claims generation",
  async () => {
    const f = fixture();
    f.session.source_photo_id = null;
    f.session.source_path = null;
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Quel visuel pour mon atelier ?",
          revision: 0,
          request_id: id(80),
        }),
      );
      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.session.proposal, null);
      assertEquals(data.session.source_url, null);
      assertEquals(data.session.messages.at(-1).operation, "advise");
      assertEquals(f.requests.includes("/rest/v1/brand_profile"), true);
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
  "model cannot stage a real product without a subject reference",
  async () => {
    const f = fixture();
    f.session.source_photo_id = null;
    f.session.source_path = null;
    f.setIntent({
      operation: "product",
      summary: "Ton bol sur une table",
      image_prompt: "A real cup on a table",
      requires_real_subject: true,
    });
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Mon bol sur une table",
          revision: 0,
          request_id: id(81),
        }),
      );
      const data = await res.json();
      assertEquals(res.status, 200);
      assertEquals(data.session.proposal, null);
      assertEquals(data.session.messages.at(-1).operation, "clarify");
    } finally {
      f.restore();
    }
  },
);
Deno.test(
  "a selected subject is actually inspected and snapshotted in the proposal",
  async () => {
    const f = fixture();
    const ref = {
      id: id(82),
      photo_id: id(5),
      path: "source-ref",
      role: "subject",
      name: "Bol",
    };
    f.session.references = [ref];
    f.setIntent({
      operation: "product",
      summary: "Ton bol sur une table",
      image_prompt: "A real cup on a table",
      requires_real_subject: true,
    });
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Mon bol sur une table",
          revision: 0,
          viewed_reference_id: ref.id,
          request_id: id(83),
        }),
      );
      const data = await res.json();
      assertEquals(res.status, 200);
      assertEquals(data.session.proposal.references[0].path, "source-ref");
      const payload = f.payloads[0] as {
        messages: { content: { type: string }[] }[];
      };
      assertEquals(
        payload.messages[0].content.some((b) => b.type === "image"),
        true,
      );
      assertEquals(data.session.proposal.original_path, "source-ref");
      assertEquals(data.session.proposal.cost, 1);
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
  "editing the second selected reference places it first without duplicating it",
  async () => {
    const f = fixture();
    const first = {
      id: id(84),
      photo_id: id(85),
      path: "first",
      role: "subject",
      name: "Premier",
    };
    const second = {
      id: id(86),
      photo_id: id(87),
      path: "second",
      role: "subject",
      name: "Second",
    };
    f.session.references = [first, second];
    f.setIntent({
      operation: "edit",
      summary: "Lumière plus douce",
      image_prompt: "Softer light on the selected second photo",
    });
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Lumière plus douce",
          revision: 0,
          viewed_reference_id: second.id,
          request_id: id(88),
        }),
      );
      const data = await res.json();
      assertEquals(res.status, 200);
      assertEquals(data.session.proposal.input_path, "second");
      assertEquals(
        data.session.proposal.references.map((r: { path: string }) => r.path),
        ["first"],
      );
      assertEquals(data.session.proposal.original_path, "second");
    } finally {
      f.restore();
    }
  },
);
