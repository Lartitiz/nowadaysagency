import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readSocialDiagnosticEvidence } from "./diagnostic-social.ts";

type Conn = Record<string, unknown>;
function db(connections: Record<string, Conn | null>) {
  return {
    from(table: string) {
      assertEquals(table, "social_connections");
      let platform = "";
      const q = {
        select() { return q; },
        eq(key: string, value: string) { if (key === "platform") platform = value; return q; },
        is() { return q; },
        async maybeSingle() { return { data: connections[platform] || null, error: null }; },
      };
      return q;
    },
  };
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

Deno.test("Instagram connecté : profil et légendes lus, absence d'insights signalée", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/media?")) return response({ data: [
      { media_type: "CAROUSEL_ALBUM", caption: "Je peins chaque pièce à main levée.", timestamp: "2026-09-20" },
    ] });
    if (url.includes("graph.instagram.com/v23.0/")) return response({ username: "atelier_test", biography: "Faïence et grès peints à la main", website: "https://example.test" });
    throw new Error("unexpected network call");
  }) as typeof fetch;
  try {
    const evidence = await readSocialDiagnosticEvidence(db({
      instagram: { platform_account_id: "123", access_token: "fake", scopes: "instagram_business_basic" },
    }), "test-user", "test-workspace", new AbortController().signal);
    assertEquals(evidence.sources, ["instagram_connected"]);
    assertEquals(evidence.failed, ["instagram_insights"]);
    assertStringIncludes(evidence.text, "Faïence et grès peints à la main");
    assertStringIncludes(evidence.text, "Je peins chaque pièce à main levée.");
    assertEquals(evidence.images.length, 0);
  } finally { globalThis.fetch = realFetch; }
});

Deno.test("connexion Instagram sans permission de profil : aucune source analysée", async () => {
  const evidence = await readSocialDiagnosticEvidence(db({
    instagram: { platform_account_id: "123", access_token: "fake", scopes: "instagram_business_content_publish" },
  }), "test-user", "test-workspace", new AbortController().signal);
  assertEquals(evidence.sources, []);
  assertEquals(evidence.failed, ["instagram_connected"]);
});

Deno.test("token Instagram expiré et lecture en échec : pas de faux succès", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => response({ error: { code: 190 } }, 401)) as typeof fetch;
  try {
    const evidence = await readSocialDiagnosticEvidence(db({
      instagram: { platform_account_id: "123", access_token: "expired", scopes: "instagram_business_basic" },
    }), "test-user", "test-workspace", new AbortController().signal);
    assertEquals(evidence.sources, []);
    assertEquals(evidence.failed, ["instagram_connected", "instagram_insights"]);
  } finally { globalThis.fetch = realFetch; }
});

Deno.test("LinkedIn publication seule : Analytics indisponible ; Analytics avec données : source réelle", async () => {
  const publishing = { access_token: "fake", scopes: "openid profile w_member_social" };
  const onlyPublishing = await readSocialDiagnosticEvidence(db({ linkedin: publishing }), "u", "w", new AbortController().signal);
  assertEquals(onlyPublishing.sources, []);
  assertEquals(onlyPublishing.failed, ["linkedin_analytics"]);

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("memberFollowersCount?q=me")) return response({ elements: [{ memberFollowersCount: 120 }] });
    if (url.includes("memberCreatorPostAnalytics")) return response({ elements: [{ count: 8 }] });
    return response({ elements: [] });
  }) as typeof fetch;
  try {
    const evidence = await readSocialDiagnosticEvidence(db({
      linkedin: publishing,
      linkedin_analytics: { access_token: "fake", scopes: "r_member_postAnalytics r_member_profileAnalytics" },
    }), "u", "w", new AbortController().signal);
    assert(evidence.sources.includes("linkedin_analytics"));
    assertStringIncludes(evidence.text, "Abonnés à la lecture : 120");
  } finally { globalThis.fetch = realFetch; }
});

Deno.test("Instagram : un visuel de publication réellement téléchargé accompagne les légendes", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/media?")) return response({ data: [
      { media_type: "IMAGE", caption: "Bol en grès peint à la main", media_url: "https://cdn.example.test/photo.jpg" },
    ] });
    if (url.includes("cdn.example.test")) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
      headers: { "content-type": "image/jpeg" },
    });
    return response({ username: "atelier_test", biography: "Céramique peinte à la main" });
  }) as typeof fetch;
  try {
    const evidence = await readSocialDiagnosticEvidence(db({
      instagram: { platform_account_id: "123", access_token: "fake", scopes: "instagram_business_basic" },
    }), "u", "w", new AbortController().signal);
    assertEquals(evidence.sources, ["instagram_connected"]);
    assertEquals(evidence.images.length, 1);
    assertStringIncludes(evidence.text, "1 visuels lus");
  } finally { globalThis.fetch = realFetch; }
});

Deno.test("Instagram : un identifiant et des formats seuls ne valent pas analyse de contenu", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).includes("/media?")
      ? response({ data: [{ media_type: "IMAGE", timestamp: "2026-09-20" }] })
      : response({ username: "atelier_test" })) as typeof fetch;
  try {
    const evidence = await readSocialDiagnosticEvidence(db({
      instagram: { platform_account_id: "123", access_token: "fake", scopes: "instagram_business_basic" },
    }), "u", "w", new AbortController().signal);
    assertEquals(evidence.sources, []);
    assert(evidence.failed.includes("instagram_connected"));
  } finally { globalThis.fetch = realFetch; }
});

Deno.test("LinkedIn Analytics sans données utiles ou droit suffisant : source absente", async () => {
  const insufficient = await readSocialDiagnosticEvidence(db({
    linkedin_analytics: { access_token: "fake", scopes: "r_basicprofile" },
  }), "u", "w", new AbortController().signal);
  assertEquals(insufficient.sources, []);
  assertEquals(insufficient.failed, ["linkedin_analytics"]);

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => response({ elements: [] })) as typeof fetch;
  try {
    const empty = await readSocialDiagnosticEvidence(db({
      linkedin_analytics: { access_token: "fake", scopes: "r_member_postAnalytics r_member_profileAnalytics" },
    }), "u", "w", new AbortController().signal);
    assertEquals(empty.sources, []);
    assertEquals(empty.failed, ["linkedin_analytics"]);
  } finally { globalThis.fetch = realFetch; }
});
