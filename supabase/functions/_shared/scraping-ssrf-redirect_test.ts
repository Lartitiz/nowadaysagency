// Anti-SSRF : une adresse publique qui REDIRIGE vers une adresse interne
// (127.0.0.1, 169.254.169.254 = métadonnées cloud, réseau privé) ne doit jamais
// être suivie par le serveur. Avant le correctif, scrapeWebsite / fetchSitemapXml /
// fetchExternalCss / scrapeLinkedin suivaient les redirections sans revérifier.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fetchExternalCss,
  fetchSitemapUrls,
  safeFetchFollow,
  scrapeLinkedin,
  scrapeWebsite,
} from "./scraping.ts";

type Route = (url: string) => Response;

/** Remplace fetch le temps d'un test ; renvoie la liste des URL réellement demandées. */
async function withFetchMock(route: Route, run: (requested: string[]) => Promise<void>) {
  const original = globalThis.fetch;
  const requested: string[] = [];
  // Imite le vrai fetch : sans `redirect: "manual"`, il suit SEUL les redirections
  // (c'est exactement le comportement qui laissait passer la faille).
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
const INTERNAL_HOSTS = ["127.0.0.1", "169.254.169.254", "10.0.0.5", "localhost"];
const touchedInternal = (requested: string[]) =>
  requested.filter((u) => {
    try { return INTERNAL_HOSTS.includes(new URL(u).hostname); } catch { return false; }
  });

for (const internal of ["http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data/"]) {
  Deno.test(`safeFetchFollow refuse une redirection vers ${internal}`, async () => {
    await withFetchMock(
      (url) => url.startsWith("https://public.example") ? redirectTo(internal) : new Response("SECRET"),
      async (requested) => {
        const res = await safeFetchFollow("https://public.example/", new AbortController().signal);
        assertEquals(res, null);
        assertEquals(touchedInternal(requested), []);
      },
    );
  });
}

Deno.test("safeFetchFollow suit une redirection publique (et relative)", async () => {
  await withFetchMock(
    (url) => {
      if (url === "https://public.example/") return redirectTo("https://www.public.example/home");
      if (url === "https://www.public.example/home") return redirectTo("/fr/");
      return new Response("<html>ok</html>", { status: 200 });
    },
    async (requested) => {
      const res = await safeFetchFollow("https://public.example/", new AbortController().signal);
      assert(res);
      assertEquals(res.finalUrl, "https://www.public.example/fr/");
      assertEquals(await res.response.text(), "<html>ok</html>");
      assertEquals(requested, ["https://public.example/", "https://www.public.example/home", "https://www.public.example/fr/"]);
    },
  );
});

Deno.test("safeFetchFollow transmet les en-têtes demandés et coupe après trop de redirections", async () => {
  const original = globalThis.fetch;
  let seenUA = "";
  let calls = 0;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    calls++;
    seenUA = new Headers(init?.headers).get("user-agent") ?? "";
    assertEquals(init?.redirect, "manual");
    return Promise.resolve(redirectTo(`https://public.example/${calls}`));
  }) as typeof fetch;
  try {
    const res = await safeFetchFollow("https://public.example/", new AbortController().signal, 2, { "User-Agent": "Test/1.0" });
    assertEquals(res, null);
    assertEquals(calls, 3);
    assertEquals(seenUA, "Test/1.0");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("scrapeWebsite ne lit jamais une page interne atteinte par redirection", async () => {
  await withFetchMock(
    (url) => {
      const host = new URL(url).hostname;
      if (host === "public.example") return redirectTo("http://169.254.169.254/latest/meta-data/");
      if (INTERNAL_HOSTS.includes(host)) return new Response("<html><title>SECRET</title><p>cle-interne-tres-secrete-0123456789</p></html>");
      return new Response("", { status: 404 }); // Jina & co : rien
    },
    async (requested) => {
      const text = await scrapeWebsite("public.example", new AbortController().signal);
      assertEquals(touchedInternal(requested), []);
      assert(!text || !text.includes("SECRET"));
    },
  );
});

Deno.test("scrapeWebsite lit toujours un site public qui redirige vers www", async () => {
  await withFetchMock(
    (url) => {
      const u = new URL(url);
      if (u.hostname === "public.example") return redirectTo(`https://www.public.example${u.pathname}`);
      if (u.hostname === "www.public.example" && u.pathname === "/") {
        return new Response("<html><title>Mon atelier</title><p>Je crée des bijoux en argent recyclé depuis dix ans.</p></html>");
      }
      return new Response("", { status: 404 });
    },
    async () => {
      const text = await scrapeWebsite("https://public.example", new AbortController().signal);
      assert(text && text.includes("Mon atelier"), `texte inattendu : ${text}`);
    },
  );
});

Deno.test("le sitemap n'est pas suivi vers une adresse interne", async () => {
  await withFetchMock(
    (url) => {
      const host = new URL(url).hostname;
      if (host === "public.example") return redirectTo("http://127.0.0.1/sitemap.xml");
      return new Response('<urlset><url><loc>http://127.0.0.1/a-propos</loc></url></urlset>');
    },
    async (requested) => {
      const urls = await fetchSitemapUrls("https://public.example", new AbortController().signal);
      assertEquals(urls, []);
      assertEquals(touchedInternal(requested), []);
    },
  );
});

Deno.test("les feuilles de style et LinkedIn ne suivent pas une redirection interne", async () => {
  await withFetchMock(
    (url) => {
      const host = new URL(url).hostname;
      if (host === "public.example" || host === "www.linkedin.com") return redirectTo("http://10.0.0.5/");
      return new Response(":root{--secret:#000}");
    },
    async (requested) => {
      const css = await fetchExternalCss('<link rel="stylesheet" href="https://public.example/app.css">', "https://public.example/");
      assertEquals(css, "");
      const li = await scrapeLinkedin("https://www.linkedin.com/in/test", new AbortController().signal);
      assertEquals(li, null);
      assertEquals(touchedInternal(requested), []);
    },
  );
});
