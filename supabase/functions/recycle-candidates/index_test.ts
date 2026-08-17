// Régression IDOR (audit 17/08) : recycle-candidates prenait workspace_id
// depuis le body sans jamais vérifier que l'utilisateur·rice authentifié·e
// appartient à cet espace -> lecture possible des posts publiés (texte
// complet dans content_draft) de n'importe quel workspace deviné.
// Fix : assertWorkspaceMembership AVANT toute lecture de calendar_posts.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/recycle-candidates/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  captureServeHandler,
  installFetchMock,
  setTestEnv,
  authedRequest,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const MODULE_URL = new URL("./index.ts", import.meta.url).href;
const handler = await captureServeHandler(MODULE_URL);

const FOREIGN_WORKSPACE_ID = "ws-not-mine";

function recycleRequest(body: unknown = {}): Request {
  return authedRequest(`${TEST_SUPABASE_URL}/functions/v1/recycle-candidates`, body);
}

/** Fait répondre workspace_members avec une ligne (membre) ou vide (non membre), délègue le reste au mock installé. */
function stubMembership(isMember: boolean): () => void {
  const innerFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.startsWith(`${TEST_SUPABASE_URL}/rest/v1/workspace_members`)) {
      const rows = isMember ? [{ role: "member" }] : [];
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return innerFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = innerFetch;
  };
}

Deno.test("workspace_id étranger (non membre) -> 403 workspace_access_denied, aucune lecture calendar_posts", async () => {
  const mock = installFetchMock({ anthropic: () => { throw new Error("no AI call expected"); } });
  const restoreMembership = stubMembership(false);
  const calls: string[] = [];
  const innerFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    return innerFetch(input, init);
  }) as typeof fetch;
  try {
    const res = await handler(recycleRequest({ workspace_id: FOREIGN_WORKSPACE_ID }));
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "workspace_access_denied");
    assertEquals(calls.some((u) => u.includes("/rest/v1/calendar_posts")), false);
  } finally {
    globalThis.fetch = innerFetch;
    restoreMembership();
    mock.restore();
  }
});

Deno.test("workspace_id dont l'utilisateur·rice est membre -> 200, filtré par workspace_id", async () => {
  const mock = installFetchMock({ anthropic: () => { throw new Error("no AI call expected"); } });
  const restoreMembership = stubMembership(true);
  const calls: string[] = [];
  const innerFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    return innerFetch(input, init);
  }) as typeof fetch;
  try {
    const res = await handler(recycleRequest({ workspace_id: FOREIGN_WORKSPACE_ID }));
    assertEquals(res.status, 200);
    const postReads = calls.filter((u) => u.includes("/rest/v1/calendar_posts"));
    assertEquals(postReads.length, 1);
    assertEquals(postReads[0].includes(`workspace_id=eq.${FOREIGN_WORKSPACE_ID}`), true);
  } finally {
    globalThis.fetch = innerFetch;
    restoreMembership();
    mock.restore();
  }
});

Deno.test("pas de workspace_id (legacy) -> 200, filtré par user_id, pas de check membership", async () => {
  const mock = installFetchMock({ anthropic: () => { throw new Error("no AI call expected"); } });
  const calls: string[] = [];
  const innerFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push(url);
    return innerFetch(input, init);
  }) as typeof fetch;
  try {
    const res = await handler(recycleRequest({}));
    assertEquals(res.status, 200);
    assertEquals(calls.some((u) => u.includes("/rest/v1/workspace_members")), false);
    const postReads = calls.filter((u) => u.includes("/rest/v1/calendar_posts"));
    assertEquals(postReads.length, 1);
    assertEquals(postReads[0].includes("user_id=eq.test-user-id"), true);
  } finally {
    globalThis.fetch = innerFetch;
    mock.restore();
  }
});
