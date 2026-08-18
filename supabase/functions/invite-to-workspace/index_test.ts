// Tests de invite-to-workspace : gestion des membres d'un espace (inviter,
// lister, révoquer, retirer), jamais testée jusqu'ici. Tout passe par le
// service role (RLS contournées côté serveur), donc les seuls garde-fous sont
// ceux codés ici — un rôle mal vérifié ou un garde manquant expose la gestion
// complète d'un espace à n'importe quel membre.
//
// Couvre : un manager ne peut PAS inviter (seul owner/manager peut, donc un
// simple membre non trouvé est refusé), retirer le/la propriétaire est
// impossible, se retirer soi-même est impossible, et le chemin nominal
// d'invitation.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/invite-to-workspace/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = "http://localhost:54321";
const WORKSPACE_ID = "ws-1";
const OWNER_ID = "owner-1";
const MANAGER_ID = "manager-1";
const OTHER_USER_ID = "stranger-1";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");

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

interface Membership {
  id: string;
  user_id: string;
  role: string;
}

const MEMBERSHIPS: Membership[] = [
  { id: "mem-owner", user_id: OWNER_ID, role: "owner" },
  { id: "mem-manager", user_id: MANAGER_ID, role: "manager" },
];

interface MockOpts {
  callerId: string;
  membershipsOverride?: Membership[];
  insertShouldFail?: boolean;
  removeTarget?: Membership | null;
}

function installMockFetch(opts: MockOpts) {
  const calls: { path: string; method: string }[] = [];
  const memberships = opts.membershipsOverride ?? MEMBERSHIPS;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = url.replace(SUPABASE_URL, "").split("?")[0];
    calls.push({ path, method });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (path === "/auth/v1/user") {
      return json({ id: opts.callerId, email: `${opts.callerId}@example.com` });
    }

    if (path === "/rest/v1/workspace_members") {
      if (method === "GET") {
        // .maybeSingle() côté "check caller role" : renvoie la ligne du caller
        // filtrée par user_id=eq.<id> dans l'URL.
        if (url.includes(`user_id=eq.${opts.callerId}`)) {
          const mine = memberships.find((m) => m.user_id === opts.callerId);
          return json(mine ? [mine] : []);
        }
        // action "list" ou lookup du membre ciblé par remove_member (id=eq.<member_id>)
        if (opts.removeTarget !== undefined && url.includes("id=eq.")) {
          return json(opts.removeTarget ? [opts.removeTarget] : []);
        }
        return json(memberships);
      }
      if (method === "DELETE") {
        return json([{ id: "mem-removed" }]);
      }
    }

    if (path === "/rest/v1/profiles") {
      return json([]);
    }

    if (path === "/rest/v1/workspace_invitations") {
      if (method === "POST") {
        if (opts.insertShouldFail) {
          return json({ message: "insert failed" }, 500);
        }
        // .select(...).single() sur un POST : Accept demande un objet, et
        // PostgREST le renvoie directement (pas de tableau à déballer).
        return json({ id: "invite-1", token: "abc123token" }, 201);
      }
      if (method === "GET") return json([]);
      if (method === "DELETE") return json([{ id: "invite-1" }]);
    }

    return json([]);
  }) as typeof fetch;
  return { calls };
}

function restore() {
  globalThis.fetch = originalFetch;
}

function req(body: Record<string, unknown>, opts: { auth?: boolean } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth !== false) headers.authorization = "Bearer test-token";
  return new Request("https://edge.local/invite-to-workspace", { method: "POST", headers, body: JSON.stringify(body) });
}

Deno.test("invite-to-workspace: un utilisateur qui n'est PAS membre de l'espace ne peut pas inviter -> 403", async () => {
  installMockFetch({ callerId: OTHER_USER_ID });
  try {
    const res = await call(req({ workspace_id: WORKSPACE_ID, email: "nouvelle@example.com", action: "invite" }));
    assertEquals(res.status, 403);
  } finally {
    restore();
  }
});

Deno.test("invite-to-workspace: owner PEUT inviter -> 200 avec un token/invite_url", async () => {
  installMockFetch({ callerId: OWNER_ID });
  try {
    const res = await call(req({ workspace_id: WORKSPACE_ID, email: "nouvelle@example.com", action: "invite" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(typeof body.token, "string");
    assertEquals(body.invite_url.includes("abc123token"), true);
  } finally {
    restore();
  }
});

Deno.test("invite-to-workspace: manager PEUT aussi inviter -> 200", async () => {
  installMockFetch({ callerId: MANAGER_ID });
  try {
    const res = await call(req({ workspace_id: WORKSPACE_ID, email: "nouvelle@example.com", action: "invite" }));
    assertEquals(res.status, 200);
  } finally {
    restore();
  }
});

Deno.test("invite-to-workspace: remove_member sur le/la propriétaire -> refusé (400), jamais supprimé", async () => {
  const mock = installMockFetch({ callerId: OWNER_ID, removeTarget: { id: "mem-owner", user_id: OWNER_ID, role: "owner" } });
  try {
    const res = await call(req({ workspace_id: WORKSPACE_ID, action: "remove_member", member_id: "mem-owner" }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Impossible de retirer le ou la propriétaire de son espace.");
    const deletes = mock.calls.filter((c) => c.path === "/rest/v1/workspace_members" && c.method === "DELETE");
    assertEquals(deletes.length, 0);
  } finally {
    restore();
  }
});

Deno.test("invite-to-workspace: un manager ne peut pas se retirer lui-même -> 400 (pas owner, donc c'est bien le garde 'soi-même' qui joue)", async () => {
  installMockFetch({ callerId: MANAGER_ID, removeTarget: { id: "mem-manager", user_id: MANAGER_ID, role: "manager" } });
  try {
    const res = await call(req({ workspace_id: WORKSPACE_ID, action: "remove_member", member_id: "mem-manager" }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Tu ne peux pas te retirer toi-même de l'espace.");
  } finally {
    restore();
  }
});

Deno.test("invite-to-workspace: échec d'insertion de l'invitation -> 500, jamais un faux succès", async () => {
  installMockFetch({ callerId: OWNER_ID, insertShouldFail: true });
  try {
    const res = await call(req({ workspace_id: WORKSPACE_ID, email: "nouvelle@example.com", action: "invite" }));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.success, undefined);
  } finally {
    restore();
  }
});

Deno.test("invite-to-workspace: preview par token ne nécessite pas d'authentification", async () => {
  installMockFetch({ callerId: OWNER_ID });
  try {
    // Aucune ligne renvoyée par le mock générique pour workspace_invitations en GET -> introuvable, mais
    // le point important est que la requête n'exige PAS d'Authorization (pas de 401).
    const res = await call(req({ action: "preview", token: "sometoken" }, { auth: false }));
    assertEquals(res.status, 404);
  } finally {
    restore();
  }
});
