import { reelLedgerFixture } from "../_shared/reel-publication-fixture.ts";
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { notifyPublishFailure, processScheduledPosts } from "./index.ts";

Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
// TOKEN_ENCRYPTION_KEY volontairement absent : decryptConnTokens devient un
// no-op (fail-open, cf. _shared/token-crypto.ts) et laisse passer les jetons
// en clair utilisés ci-dessous.

const DUE_POST = {
  id: "post-1",
  workspace_id: null,
  user_id: "user-1",
  canal: "linkedin",
  theme: "Lancement",
  content_draft: "Un texte de post LinkedIn prêt à publier.",
  media_urls: [],
  scheduled_publish_at: new Date(Date.now() - 60_000).toISOString(),
  story_sequence_detail: null,
};

const LINKEDIN_CONNECTION = {
  platform: "linkedin",
  platform_account_id: "member-123",
  access_token: "plain-access-token",
  refresh_token: "plain-refresh-token",
};

/**
 * Fake client Supabase minimal pour social-publish-scheduled. Un seul post
 * "dû" est simulé ; aucun post en 'publishing' périmé (recovery vide).
 * Sert .single() ET .maybeSingle() sur les mêmes lignes, par convention repo.
 */
function fakeSupabase(opts: {
  dueRows?: any[];
  connection?: any | null;
  claimSucceeds?: boolean;
  getUserByIdResult?: { data: any; error: any };
} = {}) {
  const ledger = reelLedgerFixture();
  const dueRows = opts.dueRows ?? [DUE_POST];
  const connection = opts.connection === undefined ? LINKEDIN_CONNECTION : opts.connection;
  const claimSucceeds = opts.claimSucceeds ?? true;

  const updateCalls: any[] = [];
  const emailCallCount = { n: 0 };

  function calendarPostsBuilder() {
    const state: { filters: Record<string, unknown>; update?: any; select?: string } = { filters: {} };
    const builder: any = {
      select(cols: string) {
        state.select = cols;
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return builder;
      },
      in(col: string, val: unknown) {
        state.filters[col] = val;
        return builder;
      },
      lte(col: string, val: unknown) {
        state.filters[col] = val;
        return builder;
      },
      lt(col: string, val: unknown) {
        state.filters[col] = val;
        return builder;
      },
      limit(_n: number) {
        return builder;
      },
      order() { return builder; },
      update(patch: any) {
        state.update = patch;
        return builder;
      },
      maybeSingle() {
        return resolveClaim();
      },
      single() {
        return resolveClaim();
      },
      then(onFulfilled: any, onRejected: any) {
        return resolveQuery().then(onFulfilled, onRejected);
      },
    };

    function resolveClaim() {
      // Verrou optimiste (update publish_status -> 'publishing', filtré sur 'scheduled').
      if (state.update?.publish_status === "publishing" && "publish_status" in state.filters) {
        updateCalls.push({ table: "calendar_posts", ...state });
        if (!claimSucceeds) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: { id: state.filters.id }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }

    async function resolveQuery() {
      // Requête des posts dus (select, pas d'update).
      if (!state.update && state.select) {
        return { data: dueRows, error: null };
      }
      // Recovery des posts périmés en 'publishing' (update -> 'failed', filtré sur 'publishing').
      if (state.update?.publish_status === "failed" && state.filters.publish_status === "publishing") {
        updateCalls.push({ table: "calendar_posts", ...state });
        return { data: [], error: null };
      }
      // Update final succès/échec (update -> 'published' ou 'failed', pas de filtre publish_status).
      if (state.update && !("publish_status" in state.filters)) {
        updateCalls.push({ table: "calendar_posts", ...state });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    return builder;
  }

  function socialConnectionsBuilder() {
    const builder: any = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      is() {
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: connection, error: null });
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      if (table === "reel_publication_receipts") return ledger.from();
      if (table === "calendar_posts") return calendarPostsBuilder();
      if (table === "social_connections") return socialConnectionsBuilder();
      throw new Error(`Table non mockée dans ce test: ${table}`);
    },
    auth: {
      admin: {
        async getUserById(_id: string) {
          emailCallCount.n++;
          return opts.getUserByIdResult ?? { data: { user: { email: "cliente@example.com" } }, error: null };
        },
      },
    },
    _updateCalls: updateCalls,
    _emailCallCount: emailCallCount,
  };
}

function withMockedFetch<T>(impl: (input: any, init?: any) => Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl as any;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("carrousel programmé : la légende structurée remplace le dump des slides", async () => {
  const sb = fakeSupabase({ dueRows: [{ ...DUE_POST, content_draft: "SLIDE 1 : texte de visuel", story_sequence_detail: { caption: "Voici la vraie légende." } }] });
  let payload = "";
  const result = await withMockedFetch(async (_input: any, init: any) => {
    payload = init.body;
    return new Response(JSON.stringify({ id: "urn:li:share:caption" }), { status: 201 });
  }, () => processScheduledPosts(sb));
  assertEquals(result.results[0].ok, true);
  assertStringIncludes(payload, "Voici la vraie légende.");
  assertEquals(payload.includes("SLIDE 1"), false);
});

Deno.test("post échu et 'scheduled' est publié puis passe à 'published'", async () => {
  const sb = fakeSupabase();
  const fetchCalls: string[] = [];

  const result = await withMockedFetch(async (input: any) => {
    const url = String(input);
    fetchCalls.push(url);
    if (url.includes("api.linkedin.com/v2/ugcPosts")) {
      return new Response(JSON.stringify({ id: "urn:li:share:12345" }), { status: 201 });
    }
    throw new Error(`fetch non mocké pour: ${url}`);
  }, () => processScheduledPosts(sb));

  assertEquals(result.processed, 1);
  assertEquals(result.results, [{ id: "post-1", ok: true, postId: "urn:li:share:12345" }]);

  const finalUpdate = sb._updateCalls.find(
    (c: any) => c.update?.publish_status === "published" && c.filters.id === "post-1",
  );
  assertEquals(finalUpdate.update.published_post_id, "urn:li:share:12345");
  assertEquals(finalUpdate.update.publish_error, null);
});

Deno.test("un échec d'appel API met publish_status à 'failed' sans planter la fonction", async () => {
  const sb = fakeSupabase();

  const result = await withMockedFetch(async (input: any) => {
    const url = String(input);
    if (url.includes("api.linkedin.com/v2/ugcPosts")) {
      return new Response(JSON.stringify({ message: "Jeton invalide" }), { status: 401 });
    }
    if (url.includes("/functions/v1/send-email")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`fetch non mocké pour: ${url}`);
  }, () => processScheduledPosts(sb));

  // La fonction ne lève pas : l'échec est capturé et reporté dans les résultats.
  assertEquals(result.processed, 1);
  assertEquals(result.results[0].ok, false);
  assertStringIncludes(result.results[0].error, "Jeton LinkedIn expiré ou invalide");

  const finalUpdate = sb._updateCalls.find(
    (c: any) => c.update?.publish_status === "failed" && c.filters.id === "post-1",
  );
  assertStringIncludes(finalUpdate.update.publish_error, "Jeton LinkedIn expiré ou invalide");
});

Deno.test("un échec de publication déclenche l'email de notification best-effort", async () => {
  const sb = fakeSupabase();
  const emailRequests: any[] = [];

  await withMockedFetch(async (input: any, init: any) => {
    const url = String(input);
    if (url.includes("api.linkedin.com/v2/ugcPosts")) {
      return new Response(JSON.stringify({ message: "Erreur serveur" }), { status: 500 });
    }
    if (url.includes("/functions/v1/send-email")) {
      emailRequests.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`fetch non mocké pour: ${url}`);
  }, () => processScheduledPosts(sb));

  assertEquals(emailRequests.length, 1);
  assertEquals(emailRequests[0].body.to, "cliente@example.com");
  assertStringIncludes(emailRequests[0].body.subject, "n'est pas partie");
  assertEquals(sb._emailCallCount.n, 1);
});

Deno.test("l'échec de l'envoi d'email ne fait pas planter le traitement (best-effort)", async () => {
  const sb = fakeSupabase();

  const result = await withMockedFetch(async (input: any) => {
    const url = String(input);
    if (url.includes("api.linkedin.com/v2/ugcPosts")) {
      return new Response(JSON.stringify({ message: "Erreur serveur" }), { status: 500 });
    }
    if (url.includes("/functions/v1/send-email")) {
      throw new Error("Réseau indisponible pour l'envoi d'email");
    }
    throw new Error(`fetch non mocké pour: ${url}`);
  }, () => processScheduledPosts(sb));

  // Malgré l'échec de l'email (en plus de l'échec de publication), la fonction
  // se termine normalement et le post est bien marqué en échec.
  assertEquals(result.processed, 1);
  assertEquals(result.results[0].ok, false);
  const finalUpdate = sb._updateCalls.find(
    (c: any) => c.update?.publish_status === "failed" && c.filters.id === "post-1",
  );
  assertEquals(finalUpdate.update.publish_error, result.results[0].error);
});

Deno.test("notifyPublishFailure ne lève jamais même si getUserById échoue", async () => {
  const sb = fakeSupabase({
    getUserByIdResult: { data: null, error: { message: "boom" } },
  });
  // Ne doit pas lever, même sans email trouvé et sans mock de fetch.
  await notifyPublishFailure(sb, { id: "post-x", user_id: "user-x", canal: "linkedin" }, "erreur test");
});

Deno.test("aucun post dû : la fonction renvoie processed:0 sans mise à jour par post", async () => {
  const sb = fakeSupabase({ dueRows: [] });
  const result = await processScheduledPosts(sb);
  assertEquals(result, { processed: 0, results: [] });
  // La requête de recovery des posts périmés tourne toujours (filtrée côté
  // serveur) ; ce qu'on vérifie ici, c'est qu'aucune mise à jour PAR POST
  // (identifiée par un filtre `id`) n'a eu lieu en l'absence de post dû.
  assertEquals(sb._updateCalls.filter((c: any) => c.filters.id).length, 0);
});

Deno.test("un post déjà réclamé par un autre run (verrou optimiste perdu) est ignoré", async () => {
  const sb = fakeSupabase({ claimSucceeds: false });
  const result = await processScheduledPosts(sb);
  assertEquals(result, { processed: 0, results: [] });
});

Deno.test("scheduled Reel rejects a cover or temporary MP4 before any Graph call", async () => {
  Deno.env.set("SUPABASE_URL", "https://fake.local");
  for (const media of [["https://cover.test/image.jpg"],["https://render.test/temp.mp4"],[]]) {
    const db = fakeSupabase({dueRows:[{...DUE_POST,canal:"instagram",format:"reel",media_urls:media}],connection:{user_id:"user-1",platform_account_id:"ig",access_token:"token"},getUserByIdResult:{data:{user:null},error:null}});
    let calls=0;
    const result = await withMockedFetch(async()=>{calls++;throw new Error("unexpected external call");},()=>processScheduledPosts(db));
    assertEquals(calls,0); assertEquals(result.results[0].ok,false);
    assertStringIncludes(result.results[0].error,"MP4 archivée");
  }
});
Deno.test("scheduled Reel uses durable MP4, complete caption and same receipt on replay", async () => {
  Deno.env.set("SUPABASE_URL", "https://fake.local");
  const video="https://fake.local/storage/v1/object/public/calendar-media/reels-montes/user-1/video.mp4";
  const db=fakeSupabase({dueRows:[{...DUE_POST,canal:"instagram",format:"reel",content_draft:"[0-3] HOOK\nMon texte",story_sequence_detail:{type:"reel",script:[{section:"hook",timing:"0-3",texte_parle:"Mon texte"}],caption:{text:"Caption",cta:"CTA"},hashtags:["#tag"]},media_urls:[video,"https://cover.test/a.jpg"]}],connection:{user_id:"user-1",workspace_id:null,platform_account_id:"ig",access_token:"token"}});
  const calls: URL[]=[];
  await withMockedFetch(async(input:any,init:any)=>{
    const req=new Request(input,init);const url=new URL(req.url);calls.push(url);
    return new Response(JSON.stringify(url.pathname.endsWith("/media_publish")?{id:"reel-published"}:url.pathname.endsWith("/media")?{id:"container"}:{status_code:"FINISHED"}),{headers:{"content-type":"application/json"}});
  },async()=>{assertEquals((await processScheduledPosts(db)).results[0].postId,"reel-published");assertEquals((await processScheduledPosts(db)).results[0].postId,"reel-published");});
  assertEquals(calls.filter(u=>u.pathname.endsWith("/media_publish")).length,1);
  const media=calls.find(u=>u.pathname.endsWith("/media"))!;
  assertEquals(media.searchParams.get("media_type"),"REELS");assertEquals(media.searchParams.get("video_url"),video);
  assertEquals(media.searchParams.get("caption"),"Caption\n\nCTA\n\n#tag");assertEquals(media.searchParams.has("image_url"),false);
});
