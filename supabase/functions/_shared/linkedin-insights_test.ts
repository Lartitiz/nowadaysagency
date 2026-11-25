import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchLinkedInInsights } from "./linkedin-insights.ts";

function response(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

// Vécu le 24/11/2026 : un repost retiré pendant les 30 jours, LinkedIn renvoie
// un total de -1 et l'écran affichait « -1 Reposts ».
Deno.test("LinkedIn : un total négatif (repost retiré) est ramené à 0", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("memberFollowersCount?q=me")) return response({ elements: [{ memberFollowersCount: 3618 }] });
    if (url.includes("memberFollowersCount?q=dateRange")) return response({ elements: [{ memberFollowersCount: 21 }] });
    if (url.includes("queryType=RESHARE")) return response({ elements: [{ count: -1 }] });
    if (url.includes("queryType=REACTION")) return response({ elements: [{ count: -3 }] });
    if (url.includes("queryType=IMPRESSION")) return response({ elements: [{ count: 169 }] });
    return response({ elements: [{ count: 0 }] });
  }) as typeof fetch;
  try {
    const m = await fetchLinkedInInsights({ access_token: "fake" });
    assertEquals(m.postAnalytics30d.reshares, 0);
    assertEquals(m.postAnalytics30d.reactions, 0);
    assertEquals(m.postAnalytics30d.impressions, 169);
    assertEquals(m.followers, 3618);
    assertEquals(m.followersGained30d, 21);
    for (const v of Object.values(m.postAnalytics30d)) assertEquals(typeof v === "number" && v >= 0, true);
  } finally { globalThis.fetch = realFetch; }
});
