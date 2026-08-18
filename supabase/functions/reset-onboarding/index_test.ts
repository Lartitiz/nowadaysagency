// Tests de reset-onboarding : le reset complet (workspaceId sans brandingOnly,
// bouton "Repartir de zéro") remet à zéro le profil/plan/onboarding de l'OWNER
// via service role — un pouvoir qu'un·e manager n'a pas par RLS. Il doit donc
// être réservé à l'owner de l'espace (ou à un compte admin).
//
// Le mode brandingOnly (bouton « Réinitialiser tout le branding » de /branding)
// tourne lui aussi en service role (cf. commentaire BRANDING_ONLY_TABLES dans
// index.ts) : un·e manager peut le déclencher (flux accompagnement), mais
// audit du 17/08 : n'importe quelle membre SIMPLE d'un espace partagé le
// pouvait aussi (garde d'appartenance seule, pas de garde de rôle) — donc
// effacer le branding de tout l'espace sans être owner ni manager. Corrigé :
// brandingOnly exige désormais owner/manager, comme le reset complet.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/reset-onboarding/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = "http://localhost:54321";
const WORKSPACE_ID = "ws-1";
const OWNER_ID = "owner-1";
const MANAGER_ID = "manager-1";
const MEMBER_ID = "member-1";

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

const MEMBERS = [
  { user_id: OWNER_ID, role: "owner" },
  { user_id: MANAGER_ID, role: "manager" },
  { user_id: MEMBER_ID, role: "member" },
];

function installMockFetch(opts: { callerId: string; callerEmail: string }) {
  const calls: RestCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ url, method });

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: opts.callerId, email: opts.callerEmail }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/rest/v1/workspace_members")) {
      return new Response(JSON.stringify(MEMBERS), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Toutes les autres tables (DELETE branding, PATCH profiles/user_plan_config,
    // DELETE ai_usage/audit_validations…) : succès générique, non testé finement ici.
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls };
}

function restore() {
  globalThis.fetch = originalFetch;
}

function resetReq(body: Record<string, unknown>): Request {
  return new Request("https://edge.local/reset-onboarding", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });
}

Deno.test("reset-onboarding: un manager NE PEUT PAS déclencher le reset complet de l'espace", async () => {
  installMockFetch({ callerId: MANAGER_ID, callerEmail: "manager@example.com" });
  try {
    const res = await call(resetReq({ workspaceId: WORKSPACE_ID }));
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
  } finally {
    restore();
  }
});

Deno.test("reset-onboarding: l'owner PEUT déclencher le reset complet de son propre espace", async () => {
  installMockFetch({ callerId: OWNER_ID, callerEmail: "owner@example.com" });
  try {
    const res = await call(resetReq({ workspaceId: WORKSPACE_ID }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
  } finally {
    restore();
  }
});

Deno.test("reset-onboarding: un admin peut déclencher le reset complet même sans être owner", async () => {
  installMockFetch({ callerId: MANAGER_ID, callerEmail: "laetitia@nowadaysagency.com" });
  try {
    const res = await call(resetReq({ workspaceId: WORKSPACE_ID }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
  } finally {
    restore();
  }
});

Deno.test("reset-onboarding: un manager PEUT toujours déclencher le reset brandingOnly (flux accompagnement)", async () => {
  installMockFetch({ callerId: MANAGER_ID, callerEmail: "manager@example.com" });
  try {
    const res = await call(resetReq({ workspaceId: WORKSPACE_ID, brandingOnly: true }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
  } finally {
    restore();
  }
});

Deno.test("reset-onboarding: une membre simple NE PEUT PAS déclencher le reset brandingOnly (audit 17/08)", async () => {
  const { calls } = installMockFetch({ callerId: MEMBER_ID, callerEmail: "membre@example.com" });
  try {
    const res = await call(resetReq({ workspaceId: WORKSPACE_ID, brandingOnly: true }));
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "Forbidden: rôle owner ou manager requis");
    // Aucune suppression de branding n'a dû partir avant le 403.
    const deletes = calls.filter((c) => c.method === "DELETE" || c.method === "PATCH");
    assertEquals(deletes.length, 0);
  } finally {
    restore();
  }
});

Deno.test("reset-onboarding: un admin peut déclencher le reset brandingOnly même sans être owner/manager", async () => {
  installMockFetch({ callerId: MEMBER_ID, callerEmail: "laetitia@nowadaysagency.com" });
  try {
    const res = await call(resetReq({ workspaceId: WORKSPACE_ID, brandingOnly: true }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
  } finally {
    restore();
  }
});
