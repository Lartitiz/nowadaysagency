// Tests de reset-onboarding : le reset scopé espace est DESTRUCTEUR (efface le
// branding de tout l'espace en service role). Il doit donc être réservé aux
// rôles owner / manager — une membre simple d'un espace partagé qui appelle
// l'edge doit recevoir 403 sans qu'AUCUNE suppression ne parte.
//
// On capte le handler Deno.serve() via le harnais partagé et on mocke fetch :
// /auth/v1/user (identité de l'appelante), /rest/v1/workspace_members (liste
// des membres avec rôles), et toutes les autres tables (deletes/updates captés).
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/reset-onboarding/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  captureServeHandler,
  setTestEnv,
  authedRequest,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

const WORKSPACE_ID = "ws-1";
const CALLER_ID = "test-user-id"; // id renvoyé par le mock /auth/v1/user
const OWNER_ID = "owner-user-id";

setTestEnv();
const handler = await captureServeHandler(new URL("./index.ts", import.meta.url).href);

const originalFetch = globalThis.fetch;

interface CapturedCall {
  path: string;
  method: string;
  url: string;
}

/**
 * Mock fetch : `members` pilote la réponse de workspace_members ; toute
 * mutation (DELETE/PATCH) sur les autres tables est captée dans `mutations`.
 */
function installMock(members: { user_id: string; role: string }[]) {
  const mutations: CapturedCall[] = [];
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (!url.startsWith(TEST_SUPABASE_URL)) return originalFetch(input, init);

    const path = url.slice(TEST_SUPABASE_URL.length).split("?")[0];
    const method = (init?.method || "GET").toUpperCase();

    if (path === "/auth/v1/user") {
      return new Response(
        JSON.stringify({ id: CALLER_ID, email: "membre@example.com", aud: "authenticated", role: "authenticated" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (path === "/rest/v1/workspace_members") {
      return new Response(JSON.stringify(members), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "DELETE" || method === "PATCH") {
      mutations.push({ path, method, url });
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { mutations };
}

function restore() {
  globalThis.fetch = originalFetch;
}

function resetReq(body: Record<string, unknown> = {}): Request {
  return authedRequest("https://edge.local/reset-onboarding", { workspaceId: WORKSPACE_ID, ...body });
}

Deno.test("reset-onboarding: membre simple (role=member) -> 403, aucune suppression", async () => {
  const { mutations } = installMock([
    { user_id: OWNER_ID, role: "owner" },
    { user_id: CALLER_ID, role: "member" },
  ]);
  try {
    const res = await handler(resetReq());
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "Forbidden: rôle owner ou manager requis");
    assertEquals(mutations.length, 0);
  } finally {
    restore();
  }
});

Deno.test("reset-onboarding: membre simple + brandingOnly -> 403 aussi, aucune suppression", async () => {
  const { mutations } = installMock([
    { user_id: OWNER_ID, role: "owner" },
    { user_id: CALLER_ID, role: "member" },
  ]);
  try {
    const res = await handler(resetReq({ brandingOnly: true }));
    assertEquals(res.status, 403);
    assertEquals(mutations.length, 0);
  } finally {
    restore();
  }
});

Deno.test("reset-onboarding: non-membre -> 403 (garde d'appartenance préservée)", async () => {
  const { mutations } = installMock([{ user_id: OWNER_ID, role: "owner" }]);
  try {
    const res = await handler(resetReq());
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "Forbidden");
    assertEquals(mutations.length, 0);
  } finally {
    restore();
  }
});

Deno.test("reset-onboarding: owner -> reset exécuté, success:true", async () => {
  const { mutations } = installMock([{ user_id: CALLER_ID, role: "owner" }]);
  try {
    const res = await handler(resetReq());
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    // Les DELETE du branding sont bien partis (BRANDING_TABLES en compte 27).
    const deletes = mutations.filter((m) => m.method === "DELETE");
    assertEquals(deletes.length > 20, true);
  } finally {
    restore();
  }
});

Deno.test("reset-onboarding: manager -> reset exécuté aussi (rôle autorisé)", async () => {
  const { mutations } = installMock([
    { user_id: OWNER_ID, role: "owner" },
    { user_id: CALLER_ID, role: "manager" },
  ]);
  try {
    const res = await handler(resetReq({ brandingOnly: true }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(mutations.filter((m) => m.method === "DELETE").length > 5, true);
  } finally {
    restore();
  }
});
