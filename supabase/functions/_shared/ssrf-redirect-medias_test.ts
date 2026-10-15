// Anti-SSRF (suite de #1564) : une image ou un PDF dont l'adresse publique
// REDIRIGE vers une adresse interne (127.0.0.1, métadonnées cloud 169.254.169.254)
// ne doit jamais être lu par le serveur. Avant le correctif, readMediaImage
// (diagnostic réseaux) et la publication LinkedIn suivaient la redirection
// sans revérifier — et LinkedIn aurait même republié le contenu lu.
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readSocialDiagnosticEvidence } from "./diagnostic-social.ts";
import { publishDocumentToLinkedIn, publishImagesToLinkedIn } from "./linkedin-graph.ts";

/** Remplace fetch ; imite le vrai fetch qui suit SEUL les redirections sauf `redirect: "manual"`. */
async function withFetchMock(route: (url: string) => Response, run: (requested: string[]) => Promise<void>) {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (let hop = 0; hop < 10; hop++) {
      requested.push(url);
      const res = route(url);
      const loc = res.headers.get("location");
      if (init?.redirect === "manual" || res.status < 300 || res.status >= 400 || !loc) return Promise.resolve(res);
      url = new URL(loc, url).toString();
    }
    return Promise.reject(new TypeError("too many redirects"));
  }) as typeof fetch;
  try {
    await run(requested);
  } finally {
    globalThis.fetch = original;
  }
}

const redirectTo = (location: string) => new Response(null, { status: 302, headers: { location } });
const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } });
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } });
const touchedInternal = (requested: string[]) =>
  requested.filter((u) => ["127.0.0.1", "169.254.169.254"].includes(new URL(u).hostname));

function db(instagram: Record<string, unknown>) {
  return {
    from() {
      let platform = "";
      const q = {
        select: () => q,
        eq(k: string, v: string) { if (k === "platform") platform = v; return q; },
        is: () => q,
        maybeSingle: async () => ({ data: platform === "instagram" ? instagram : null, error: null }),
      };
      return q;
    },
  };
}

const IG = { platform_account_id: "123", access_token: "fake", scopes: "instagram_business_basic" };

Deno.test("diagnostic réseaux : un visuel qui redirige vers 127.0.0.1 n'est pas lu", async () => {
  await withFetchMock((url) => {
    if (url.includes("/media?")) return json({ data: [
      { media_type: "IMAGE", caption: "Bol", media_url: "https://cdn.example.test/piege.jpg" },
      { media_type: "IMAGE", caption: "Tasse", media_url: "http://169.254.169.254/latest/meta-data/x.jpg" },
    ] });
    if (url.startsWith("https://cdn.example.test/")) return redirectTo("http://127.0.0.1/secret.jpg");
    if (url.includes("graph.instagram.com")) return json({ username: "atelier_test" });
    return jpeg(); // adresse interne : ne doit JAMAIS être atteinte
  }, async (requested) => {
    const evidence = await readSocialDiagnosticEvidence(db(IG), "u", "w", new AbortController().signal);
    assertEquals(evidence.images.length, 0);
    assertEquals(touchedInternal(requested), []);
  });
});

Deno.test("diagnostic réseaux : un visuel public redirigé vers un autre CDN public reste lu", async () => {
  await withFetchMock((url) => {
    if (url.includes("/media?")) return json({ data: [{ media_type: "IMAGE", caption: "Bol", media_url: "https://cdn.example.test/a.jpg" }] });
    if (url.startsWith("https://cdn.example.test/")) return redirectTo("https://cdn2.example.test/a.jpg");
    if (url.startsWith("https://cdn2.example.test/")) return jpeg();
    return json({ username: "atelier_test" });
  }, async () => {
    const evidence = await readSocialDiagnosticEvidence(db(IG), "u", "w", new AbortController().signal);
    assertEquals(evidence.images.length, 1);
  });
});

const CONN = { access_token: "li-token", platform_account_id: "member-1" };

Deno.test("publication LinkedIn : une image qui redirige vers 127.0.0.1 est refusée", async () => {
  await withFetchMock((url) => {
    if (url.startsWith("https://images.example/")) return redirectTo("http://127.0.0.1/admin.png");
    return jpeg();
  }, async (requested) => {
    await assertRejects(() => publishImagesToLinkedIn(CONN, "", ["https://images.example/a.jpg"]), Error, "Image inaccessible");
    await assertRejects(() => publishImagesToLinkedIn(CONN, "", ["http://169.254.169.254/x.png"]), Error, "Image inaccessible");
    assertEquals(touchedInternal(requested), []);
  });
});

Deno.test("publication LinkedIn : un PDF qui redirige vers les métadonnées cloud est refusé", async () => {
  await withFetchMock((url) => {
    if (url.startsWith("https://pdfs.example/")) return redirectTo("http://169.254.169.254/latest/deck.pdf");
    return new Response("SECRET");
  }, async (requested) => {
    await assertRejects(() => publishDocumentToLinkedIn(CONN, "", "https://pdfs.example/deck.pdf"), Error, "PDF inaccessible");
    assertEquals(touchedInternal(requested), []);
  });
});
