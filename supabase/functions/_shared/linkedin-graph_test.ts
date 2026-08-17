// Tests de _shared/linkedin-graph.ts (publication texte/image/document LinkedIn),
// sans réseau réel : `fetch` est intercepté pour simuler l'API LinkedIn.
//
// Lancer : deno test --no-check --allow-all supabase/functions/_shared/linkedin-graph_test.ts

// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  publishTextToLinkedIn,
  publishImagesToLinkedIn,
  publishDocumentToLinkedIn,
  isLinkedInImageUrl,
  isLinkedInPdfUrl,
  linkedInPermalink,
} from "./linkedin-graph.ts";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

interface RouterConfig {
  ugcPost?: () => { status: number; body?: unknown; headers?: Record<string, string> };
  imageFetch?: () => { status: number };
  registerUpload?: () => { status: number; body?: unknown };
  imageBinaryUpload?: () => { status: number };
  pdfFetch?: () => { status: number };
  initDocUpload?: () => { status: number; body?: unknown };
  docBinaryUpload?: () => { status: number };
  restPost?: () => { status: number; body?: unknown; headers?: Record<string, string> };
}

function makeRouter(cfg: RouterConfig) {
  const calls: { method: string; url: string; body?: string }[] = [];

  const fetchFn = (async (input: any, init?: any): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    const bodyText = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ method: req.method, url: req.url, body: bodyText });

    if (url.href.startsWith("https://images.example/")) {
      const r = cfg.imageFetch ? cfg.imageFetch() : { status: 200 };
      return new Response(new Uint8Array([1, 2, 3]), { status: r.status, headers: { "content-type": "image/jpeg" } });
    }
    if (url.href.startsWith("https://pdfs.example/")) {
      const r = cfg.pdfFetch ? cfg.pdfFetch() : { status: 200 };
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: r.status });
    }
    if (url.href === "https://api.linkedin.com/v2/assets?action=registerUpload") {
      const r = cfg.registerUpload
        ? cfg.registerUpload()
        : {
            status: 200,
            body: {
              value: {
                uploadMechanism: {
                  "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": { uploadUrl: "https://upload.linkedin.com/img" },
                },
                asset: "urn:li:digitalmediaAsset:abc",
              },
            },
          };
      return jsonResponse(r.status, r.body ?? {});
    }
    if (url.href === "https://upload.linkedin.com/img") {
      const r = cfg.imageBinaryUpload ? cfg.imageBinaryUpload() : { status: 201 };
      return new Response(null, { status: r.status });
    }
    if (url.href === "https://api.linkedin.com/v2/ugcPosts") {
      const r = cfg.ugcPost ? cfg.ugcPost() : { status: 200, body: { id: "urn:li:share:1" } };
      return jsonResponse(r.status, r.body ?? {}, r.headers);
    }
    if (url.href === "https://api.linkedin.com/rest/documents?action=initializeUpload") {
      const r = cfg.initDocUpload
        ? cfg.initDocUpload()
        : { status: 200, body: { value: { uploadUrl: "https://upload.linkedin.com/doc", document: "urn:li:document:xyz" } } };
      return jsonResponse(r.status, r.body ?? {});
    }
    if (url.href === "https://upload.linkedin.com/doc") {
      const r = cfg.docBinaryUpload ? cfg.docBinaryUpload() : { status: 201 };
      return new Response(null, { status: r.status });
    }
    if (url.href === "https://api.linkedin.com/rest/posts") {
      const r = cfg.restPost ? cfg.restPost() : { status: 201, body: {}, headers: { "x-restli-id": "urn:li:share:doc1" } };
      return jsonResponse(r.status, r.body ?? {}, r.headers);
    }
    throw new Error(`URL non gérée par le fake fetch: ${req.method} ${req.url}`);
  }) as typeof fetch;

  return { fetchFn, calls };
}

const CONN = { access_token: "li-token", platform_account_id: "member-1" };

// ── publishTextToLinkedIn ─────────────────────────────────────────────────

Deno.test("publishTextToLinkedIn — succès : bon payload, bon urn renvoyé", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;

  const urn = await publishTextToLinkedIn(CONN, "Mon texte");
  assertEquals(urn, "urn:li:share:1");

  const call = calls.find((c) => c.url === "https://api.linkedin.com/v2/ugcPosts");
  const payload = JSON.parse(call!.body!);
  assertEquals(payload.author, "urn:li:person:member-1");
  assertEquals(payload.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text, "Mon texte");
});

Deno.test("publishTextToLinkedIn — texte vide → erreur immédiate, aucun appel réseau", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  await assertRejects(() => publishTextToLinkedIn(CONN, "   "), Error, "texte du post LinkedIn est vide");
  assertEquals(calls.length, 0);
});

Deno.test("publishTextToLinkedIn — jeton expiré (401) → message dédié reconnexion", async () => {
  const { fetchFn } = makeRouter({ ugcPost: () => ({ status: 401, body: { message: "invalid token" } }) });
  globalThis.fetch = fetchFn;
  await assertRejects(() => publishTextToLinkedIn(CONN, "x"), Error, "Jeton LinkedIn expiré ou invalide");
});

Deno.test("publishTextToLinkedIn — LinkedIn refuse le contenu (422) → message serveur propagé", async () => {
  const { fetchFn } = makeRouter({ ugcPost: () => ({ status: 422, body: { message: "Contenu non conforme." } }) });
  globalThis.fetch = fetchFn;
  await assertRejects(() => publishTextToLinkedIn(CONN, "x"), Error, "Contenu non conforme.");
});

Deno.test("publishTextToLinkedIn — pas d'urn dans la réponse → erreur explicite, pas de faux succès", async () => {
  const { fetchFn } = makeRouter({ ugcPost: () => ({ status: 200, body: {} }) });
  globalThis.fetch = fetchFn;
  await assertRejects(() => publishTextToLinkedIn(CONN, "x"), Error, "n'a pas renvoyé d'identifiant");
});

// ── publishImagesToLinkedIn ───────────────────────────────────────────────

Deno.test("publishImagesToLinkedIn — succès : upload puis post, bon urn renvoyé", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;

  const urn = await publishImagesToLinkedIn(CONN, "Avec image", ["https://images.example/a.jpg"]);
  assertEquals(urn, "urn:li:share:1");

  const register = calls.find((c) => c.url.includes("registerUpload"));
  const registerPayload = JSON.parse(register!.body!);
  assertEquals(registerPayload.registerUploadRequest.owner, "urn:li:person:member-1");

  const post = calls.find((c) => c.url === "https://api.linkedin.com/v2/ugcPosts");
  const postPayload = JSON.parse(post!.body!);
  assertEquals(postPayload.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory, "IMAGE");
  assertEquals(postPayload.specificContent["com.linkedin.ugc.ShareContent"].media[0].media, "urn:li:digitalmediaAsset:abc");
});

Deno.test("publishImagesToLinkedIn — image source inaccessible → erreur propre", async () => {
  const { fetchFn } = makeRouter({ imageFetch: () => ({ status: 404 }) });
  globalThis.fetch = fetchFn;
  await assertRejects(
    () => publishImagesToLinkedIn(CONN, "", ["https://images.example/gone.jpg"]),
    Error,
    "Image inaccessible",
  );
});

Deno.test("publishImagesToLinkedIn — aucune image valide après filtrage → erreur immédiate", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  await assertRejects(() => publishImagesToLinkedIn(CONN, "", ["https://images.example/doc.pdf"]), Error, "Aucune image publique");
  assertEquals(calls.length, 0);
});

Deno.test("publishImagesToLinkedIn — registerUpload renvoie 401 → message dédié reconnexion", async () => {
  const { fetchFn } = makeRouter({ registerUpload: () => ({ status: 401, body: {} }) });
  globalThis.fetch = fetchFn;
  await assertRejects(
    () => publishImagesToLinkedIn(CONN, "", ["https://images.example/a.jpg"]),
    Error,
    "Jeton LinkedIn expiré ou invalide",
  );
});

// ── publishDocumentToLinkedIn (carrousel PDF) ─────────────────────────────

Deno.test("publishDocumentToLinkedIn — succès : bon payload, bon urn renvoyé", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;

  const urn = await publishDocumentToLinkedIn(CONN, "Mon carrousel (v2)", "https://pdfs.example/deck.pdf", "Titre du deck");
  assertEquals(urn, "urn:li:share:doc1");

  const post = calls.find((c) => c.url === "https://api.linkedin.com/rest/posts");
  const payload = JSON.parse(post!.body!);
  assertEquals(payload.content.media.id, "urn:li:document:xyz");
  assertEquals(payload.content.media.title, "Titre du deck");
  // Échappement « Little Text » : les parenthèses doivent être préfixées d'un backslash.
  assertEquals(payload.commentary, "Mon carrousel \\(v2\\)");
});

Deno.test("publishDocumentToLinkedIn — URL non-PDF → erreur immédiate, aucun appel réseau", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  await assertRejects(
    () => publishDocumentToLinkedIn(CONN, "", "https://images.example/a.jpg"),
    Error,
    "Aucun PDF valide",
  );
  assertEquals(calls.length, 0);
});

Deno.test("publishDocumentToLinkedIn — PDF source inaccessible → erreur propre", async () => {
  const { fetchFn } = makeRouter({ pdfFetch: () => ({ status: 404 }) });
  globalThis.fetch = fetchFn;
  await assertRejects(
    () => publishDocumentToLinkedIn(CONN, "", "https://pdfs.example/gone.pdf"),
    Error,
    "PDF inaccessible",
  );
});

Deno.test("publishDocumentToLinkedIn — création du post document échoue → message serveur propagé, pas de faux succès", async () => {
  const { fetchFn } = makeRouter({ restPost: () => ({ status: 400, body: { message: "Document invalide." } }) });
  globalThis.fetch = fetchFn;
  await assertRejects(
    () => publishDocumentToLinkedIn(CONN, "", "https://pdfs.example/deck.pdf"),
    Error,
    "Document invalide.",
  );
});

// ── helpers purs ────────────────────────────────────────────────────────

Deno.test("isLinkedInImageUrl / isLinkedInPdfUrl / linkedInPermalink", () => {
  assertEquals(isLinkedInImageUrl("https://x/a.jpg"), true);
  assertEquals(isLinkedInImageUrl("https://x/a.pdf"), false);
  assertEquals(isLinkedInPdfUrl("https://x/a.pdf"), true);
  assertEquals(isLinkedInPdfUrl("https://x/a.jpg"), false);
  assertEquals(linkedInPermalink("urn:li:share:1"), "https://www.linkedin.com/feed/update/urn:li:share:1/");
});
