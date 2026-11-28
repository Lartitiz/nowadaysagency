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
  publishVideoToLinkedIn,
  isLinkedInVideoUrl,
  isLinkedInImageUrl,
  isLinkedInPdfUrl,
  linkedInPermalink,
  prepareLinkedInText,
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
  videoFetch?: () => { status: number };
  initVideoUpload?: () => { status: number; body?: unknown };
  videoPartUpload?: () => { status: number; etag?: string | null };
  finalizeVideo?: () => { status: number; body?: unknown };
  videoStatus?: () => string;
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
    if (url.href.startsWith("https://videos.example/")) {
      const r = cfg.videoFetch ? cfg.videoFetch() : { status: 200 };
      return new Response(new Uint8Array([1, 2, 3, 4, 5, 6]), { status: r.status });
    }
    if (url.href === "https://api.linkedin.com/rest/videos?action=initializeUpload") {
      const r = cfg.initVideoUpload ? cfg.initVideoUpload() : {
        status: 200,
        body: { value: { video: "urn:li:video:v1", uploadToken: "tok", uploadInstructions: [
          { uploadUrl: "https://upload.linkedin.com/vid/1", firstByte: 0, lastByte: 3 },
          { uploadUrl: "https://upload.linkedin.com/vid/2", firstByte: 4, lastByte: 5 },
        ] } },
      };
      return jsonResponse(r.status, r.body ?? {});
    }
    if (url.href.startsWith("https://upload.linkedin.com/vid/")) {
      const r = cfg.videoPartUpload ? cfg.videoPartUpload() : { status: 200, etag: `"etag-${url.href.slice(-1)}"` };
      return new Response(null, { status: r.status, headers: r.etag ? { etag: r.etag } : {} });
    }
    if (url.href === "https://api.linkedin.com/rest/videos?action=finalizeUpload") {
      const r = cfg.finalizeVideo ? cfg.finalizeVideo() : { status: 200 };
      return jsonResponse(r.status, r.body ?? {});
    }
    if (url.href.startsWith("https://api.linkedin.com/rest/videos/")) {
      return jsonResponse(200, { status: cfg.videoStatus ? cfg.videoStatus() : "AVAILABLE" });
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

// ── Nettoyage du markdown avant publication (04/10/2026) ──────────────────
// LinkedIn n'interprète pas le markdown : un **gras** glissé par l'IA était
// publié en astérisques bruts. Numérotation, puces et sauts de ligne intacts.

const POST_MARKDOWN = "Un **vrai** déclic.\n\n1. Le *premier* point\n2. Le second\n\n– une puce\n• une autre\n\nLien : https://site.fr/mon_offre_2026 et [ma page](https://site.fr/a_b)\n\n#marketing #petite_entreprise";
const POST_CLEAN = "Un vrai déclic.\n\n1. Le premier point\n2. Le second\n\n– une puce\n• une autre\n\nLien : https://site.fr/mon_offre_2026 et ma page (https://site.fr/a_b)\n\n#marketing #petite_entreprise";

Deno.test("prepareLinkedInText — retire **gras** / *italique*, garde numérotation, puces, sauts de ligne, URL et hashtags", () => {
  assertEquals(prepareLinkedInText(POST_MARKDOWN), POST_CLEAN);
  // Pas de faux positif sur un calcul ou une puce « * ».
  assertEquals(prepareLinkedInText("2 * 3 = 6\n* point un\n* point deux"), "2 * 3 = 6\n* point un\n* point deux");
});

Deno.test("publishTextToLinkedIn — le markdown n'est jamais publié en astérisques bruts", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  await publishTextToLinkedIn(CONN, POST_MARKDOWN);
  const payload = JSON.parse(calls.find((c) => c.url === "https://api.linkedin.com/v2/ugcPosts")!.body!);
  assertEquals(payload.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text, POST_CLEAN);
});

Deno.test("publishImagesToLinkedIn — légende nettoyée du markdown", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  await publishImagesToLinkedIn(CONN, POST_MARKDOWN, ["https://images.example/a.jpg"]);
  const payload = JSON.parse(calls.find((c) => c.url === "https://api.linkedin.com/v2/ugcPosts")!.body!);
  assertEquals(payload.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text, POST_CLEAN);
});

Deno.test("publishDocumentToLinkedIn — légende nettoyée du markdown avant l'échappement", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  await publishDocumentToLinkedIn(CONN, "Un **vrai** déclic", "https://pdfs.example/deck.pdf", "Deck");
  const payload = JSON.parse(calls.find((c) => c.url === "https://api.linkedin.com/rest/posts")!.body!);
  assertEquals(payload.commentary, "Un vrai déclic");
});

// ── publishVideoToLinkedIn (28/11/2026) ───────────────────────────────────

async function withFetch<T>(cfg: RouterConfig, run: (calls: { method: string; url: string; body?: string }[]) => Promise<T>): Promise<T> {
  const { fetchFn, calls } = makeRouter(cfg);
  const original = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try { return await run(calls); } finally { globalThis.fetch = original; }
}

Deno.test("publishVideoToLinkedIn — succès : morceaux envoyés dans l'ordre, étiquettes rendues, post vidéo créé", async () => {
  await withFetch({}, async (calls) => {
    const urn = await publishVideoToLinkedIn(CONN, "Ma légende (avec parenthèses)", "https://videos.example/reel.mp4", "Mon sujet", 0);
    assertEquals(urn, "urn:li:share:doc1");
    const order = calls.map((c) => c.url.replace("https://api.linkedin.com", "").replace("https://upload.linkedin.com", "up:"));
    assertEquals(order, [
      "https://videos.example/reel.mp4",
      "/rest/videos?action=initializeUpload",
      "up:/vid/1",
      "up:/vid/2",
      "/rest/videos?action=finalizeUpload",
      "/rest/videos/urn%3Ali%3Avideo%3Av1",
      "/rest/posts",
    ]);
    const init = JSON.parse(calls[1].body!);
    assertEquals(init.initializeUploadRequest.fileSizeBytes, 6);
    assertEquals(init.initializeUploadRequest.owner, "urn:li:person:member-1");
    const fin = JSON.parse(calls[4].body!);
    assertEquals(fin.finalizeUploadRequest, { video: "urn:li:video:v1", uploadToken: "tok", uploadedPartIds: ["etag-1", "etag-2"] });
    const post = JSON.parse(calls[6].body!);
    assertEquals(post.content.media, { id: "urn:li:video:v1", title: "Mon sujet" });
    assertEquals(post.commentary, "Ma légende \\(avec parenthèses\\)");
  });
});

Deno.test("publishVideoToLinkedIn — adresse qui n'est pas un MP4 → erreur immédiate, aucun appel réseau", async () => {
  await withFetch({}, async (calls) => {
    await assertRejects(() => publishVideoToLinkedIn(CONN, "x", "https://images.example/a.jpg", undefined, 0), Error, "Aucune vidéo MP4");
    assertEquals(calls.length, 0);
  });
});

Deno.test("publishVideoToLinkedIn — vidéo source inaccessible → erreur propre, rien n'est publié", async () => {
  await withFetch({ videoFetch: () => ({ status: 404 }) }, async (calls) => {
    await assertRejects(() => publishVideoToLinkedIn(CONN, "x", "https://videos.example/reel.mp4", undefined, 0), Error, "Vidéo inaccessible");
    assertEquals(calls.some((c) => c.url.endsWith("/rest/posts")), false);
  });
});

Deno.test("publishVideoToLinkedIn — jeton expiré à l'init (401) → message de reconnexion", async () => {
  await withFetch({ initVideoUpload: () => ({ status: 401 }) }, async () => {
    await assertRejects(() => publishVideoToLinkedIn(CONN, "x", "https://videos.example/reel.mp4", undefined, 0), Error, "Reconnecte LinkedIn");
  });
});

Deno.test("publishVideoToLinkedIn — un morceau sans étiquette → arrêt, aucun post créé", async () => {
  await withFetch({ videoPartUpload: () => ({ status: 200, etag: null }) }, async (calls) => {
    await assertRejects(() => publishVideoToLinkedIn(CONN, "x", "https://videos.example/reel.mp4", undefined, 0), Error, "Échec de l'envoi de la vidéo");
    assertEquals(calls.some((c) => c.url.endsWith("/rest/posts")), false);
  });
});

Deno.test("publishVideoToLinkedIn — traitement refusé par LinkedIn → arrêt, aucun post créé", async () => {
  await withFetch({ videoStatus: () => "PROCESSING_FAILED" }, async (calls) => {
    await assertRejects(() => publishVideoToLinkedIn(CONN, "x", "https://videos.example/reel.mp4", undefined, 0), Error, "n'a pas pu traiter");
    assertEquals(calls.some((c) => c.url.endsWith("/rest/posts")), false);
  });
});

Deno.test("isLinkedInVideoUrl — MP4 public seulement ; une image n'est jamais une vidéo et inversement", () => {
  assertEquals(isLinkedInVideoUrl("https://x.example/a.mp4"), true);
  assertEquals(isLinkedInVideoUrl("https://x.example/a.mp4?token=1"), true);
  assertEquals(isLinkedInVideoUrl("https://x.example/a.jpg"), false);
  assertEquals(isLinkedInVideoUrl("blob:abc.mp4"), false);
  assertEquals(isLinkedInImageUrl("https://x.example/a.mp4"), false);
});
