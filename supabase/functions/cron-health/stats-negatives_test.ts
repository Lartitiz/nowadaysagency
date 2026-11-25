// Relevés LinkedIn négatifs : le relevé réel du 24/11/2026 (« -1 Reposts ») doit sortir.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chiffresNegatifs, statsLinkedInNegatives } from "./stats-negatives.ts";

const NOW = Date.parse("2026-11-25T08:00:00Z");
const releve = (reshares: number, fetchedAt = "2026-11-24T10:00:00.000Z") => ({
  month_date: "2026-11-01",
  custom_data: { li_stats: { followers: 3618, followersGained30d: 21, fetchedAt,
    postAnalytics30d: { impressions: 169, membersReached: 97, reactions: 1, comments: 0, reshares, linkClicks: 0 } } },
});

Deno.test("stats négatives : le relevé du 24/11 (-1 repost) est signalé", () => {
  assertEquals(chiffresNegatifs([releve(-1)], NOW), [{ mois: "2026-11-01", champ: "reshares", valeur: -1 }]);
});

Deno.test("stats négatives : relevé sain, vieux relevé, abonnés perdus → rien", () => {
  assertEquals(chiffresNegatifs([releve(0)], NOW), []);
  assertEquals(chiffresNegatifs([releve(-1, "2026-11-20T10:00:00.000Z")], NOW), []);
  assertEquals(chiffresNegatifs([{ custom_data: { li_stats: { followersGained30d: -4, fetchedAt: "2026-11-24T10:00:00.000Z" } } }], NOW), []);
  assertEquals(chiffresNegatifs([{ custom_data: null }, { custom_data: { ig_audience: {} } }], NOW), []);
});

Deno.test("stats négatives : lecture des lignes modifiées depuis 48 h, erreur → { erreur }", async () => {
  const appels: unknown[][] = [];
  const client = (reponse: unknown) => ({ from: (t: string) => {
    appels.push(["from", t]);
    const q = { select: () => q, gte: (...a: unknown[]) => (appels.push(["gte", ...a]), q), range: () => Promise.resolve(reponse) };
    return q;
  } });
  assertEquals(await statsLinkedInNegatives(client({ data: [releve(-1)], error: null }), NOW),
    { count: 1, items: [{ mois: "2026-11-01", champ: "reshares", valeur: -1 }] });
  assertEquals(appels, [["from", "monthly_stats"], ["gte", "updated_at", "2026-11-23T08:00:00.000Z"]]);
  assertEquals(await statsLinkedInNegatives(client({ data: null, error: { message: "permission denied" } }), NOW), { erreur: "permission denied" });
});
