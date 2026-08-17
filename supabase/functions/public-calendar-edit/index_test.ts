// Tests de public-calendar-edit : un lien de calendrier partagé ne doit permettre
// de modifier QUE les posts du workspace du share (pas les autres espaces du même
// propriétaire), et success:true ne doit être renvoyé que si l'écriture a réussi.
//
// Le handler ne prend aucun client injectable : on capture le handler Deno.serve()
// et on mocke fetch pour /rest/v1/calendar_shares, /rest/v1/calendar_comments
// (rate limit + log) et /rest/v1/calendar_posts (lecture + PATCH). Aucune logique
// métier de index.ts n'est modifiée par ce fichier.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/public-calendar-edit/index_test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = "http://localhost:54321";
const OWNER_ID = "owner-1";
const SHARE_WORKSPACE_ID = "ws-share";
const POST_ID = "post-1";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("ALLOWED_ORIGIN", "https://nowadays-assistant.fr");

let capturedHandler: ((req: Request) => Promise<Response>) | null = null;
{
  const originalServe = Deno.serve;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (handler: any) => {
    capturedHandler = handler;
    // deno-lint-ignore no-explicit-any
    return { finished: Promise.resolve(), shutdown: async () => {} } as any;
  };
  await import("./index.ts");
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = originalServe;
}

function call(req: Request): Promise<Response> {
  return capturedHandler!(req);
}

const originalFetch = globalThis.fetch;

interface RestCall {
  url: string;
  method: string;
}

function makeShare(overrides: Record<string, unknown> = {}) {
  return {
    id: "share-1",
    user_id: OWNER_ID,
    is_active: true,
    expires_at: null,
    guest_can_edit_status: true,
    guest_can_edit_wording: true,
    guest_name: "Cliente Test",
    workspace_id: SHARE_WORKSPACE_ID,
    ...overrides,
  };
}

function installMockFetch(opts: {
  share?: Record<string, unknown> | null;
  postFound?: boolean;
  patchStatus?: number;
  patchRows?: Record<string, unknown>[];
}) {
  const calls: RestCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ url, method });

    if (url.includes("/rest/v1/calendar_shares")) {
      const share = opts.share === undefined ? makeShare() : opts.share;
      return new Response(JSON.stringify(share ? [share] : []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/rest/v1/calendar_comments")) {
      if (method === "POST") {
        return new Response(null, { status: 201 });
      }
      // Rate limit : count exact, head:true -> le SDK lit content-range
      return new Response(null, {
        status: 200,
        headers: { "content-type": "application/json", "content-range": "*/0" },
      });
    }

    if (url.includes("/rest/v1/calendar_posts")) {
      if (method === "PATCH") {
        const status = opts.patchStatus ?? 200;
        if (status >= 400) {
          return new Response(JSON.stringify({ message: "db error" }), {
            status,
            headers: { "content-type": "application/json" },
          });
        }
        const rows = opts.patchRows ?? [{ id: POST_ID }];
        return new Response(JSON.stringify(rows), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
      // Lecture du post (maybeSingle)
      const found = opts.postFound ?? true;
      const rows = found ? [{ id: POST_ID, status: "idea", content_draft: "avant" }] : [];
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unmocked fetch in public-calendar-edit test: ${method} ${url}`);
  }) as typeof fetch;
  return { calls };
}

function restore() {
  globalThis.fetch = originalFetch;
}

function editReq(body: Record<string, unknown>): Request {
  return new Request("https://edge.local/public-calendar-edit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "tok-1", post_id: POST_ID, field: "status", value: "ready", ...body }),
  });
}

Deno.test("public-calendar-edit: la lecture ET le PATCH sont contraints au workspace du share", async () => {
  const { calls } = installMockFetch({});
  try {
    const res = await call(editReq({}));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);

    const postReads = calls.filter((c) => c.url.includes("/rest/v1/calendar_posts") && c.method === "GET");
    assertEquals(postReads.length, 1);
    const readParams = new URL(postReads[0].url).searchParams;
    assertEquals(readParams.get("user_id"), `eq.${OWNER_ID}`);
    assertEquals(readParams.get("workspace_id"), `eq.${SHARE_WORKSPACE_ID}`);

    const patches = calls.filter((c) => c.method === "PATCH");
    assertEquals(patches.length, 1);
    const patchParams = new URL(patches[0].url).searchParams;
    assertEquals(patchParams.get("id"), `eq.${POST_ID}`);
    assertEquals(patchParams.get("user_id"), `eq.${OWNER_ID}`);
    assertEquals(patchParams.get("workspace_id"), `eq.${SHARE_WORKSPACE_ID}`);
  } finally {
    restore();
  }
});

Deno.test("public-calendar-edit: post hors workspace du share -> 404, aucun PATCH envoyé", async () => {
  const { calls } = installMockFetch({ postFound: false });
  try {
    const res = await call(editReq({}));
    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.error, "post_not_found");
    assertEquals(calls.filter((c) => c.method === "PATCH").length, 0);
  } finally {
    restore();
  }
});

Deno.test("public-calendar-edit: share legacy sans workspace_id -> filtre user_id seul, édition OK", async () => {
  const { calls } = installMockFetch({ share: makeShare({ workspace_id: null }) });
  try {
    const res = await call(editReq({}));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);

    const patches = calls.filter((c) => c.method === "PATCH");
    assertEquals(patches.length, 1);
    const patchParams = new URL(patches[0].url).searchParams;
    assertEquals(patchParams.get("user_id"), `eq.${OWNER_ID}`);
    assertEquals(patchParams.get("workspace_id"), null);
  } finally {
    restore();
  }
});

Deno.test("public-calendar-edit: échec d'écriture en base -> 500, jamais success:true", async () => {
  installMockFetch({ patchStatus: 500 });
  try {
    const res = await call(editReq({}));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "update_failed");
    assertEquals(body.success, undefined);
  } finally {
    restore();
  }
});

Deno.test("public-calendar-edit: PATCH qui ne touche aucune ligne -> 404, jamais success:true", async () => {
  installMockFetch({ patchRows: [] });
  try {
    const res = await call(editReq({}));
    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.error, "post_not_found");
  } finally {
    restore();
  }
});

Deno.test("public-calendar-edit: wording aussi passe par l'update vérifié et contraint", async () => {
  const { calls } = installMockFetch({});
  try {
    const res = await call(editReq({ field: "wording", value: "nouveau texte" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);

    const patches = calls.filter((c) => c.method === "PATCH");
    assertEquals(patches.length, 1);
    assertStringIncludes(patches[0].url, `workspace_id=eq.${SHARE_WORKSPACE_ID}`);
  } finally {
    restore();
  }
});
