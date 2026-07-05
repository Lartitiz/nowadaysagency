import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { rankRecycleCandidates, MIN_AGE_DAYS, MAX_CANDIDATES } from "./recycle-ranking.ts";
import type { AppPublishedPost } from "./recycle-ranking.ts";
import type { IgPostMetrics } from "./instagram-insights.ts";

const NOW = new Date("2026-07-05T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const appPost = (over: Partial<AppPublishedPost> = {}): AppPublishedPost => ({
  id: "post-1",
  theme: "Mes 3 erreurs de débutante",
  content_draft: "Voici le texte complet du post publié, assez long pour être recyclé sérieusement.",
  canal: "instagram",
  format: "carousel",
  published_at: daysAgo(40),
  date: null,
  published_post_id: null,
  ...over,
});

const igPost = (over: Partial<IgPostMetrics> = {}): IgPostMetrics => ({
  id: "1789000000",
  subject: "Voici le sujet du post Instagram qui a très bien marché ce mois-là",
  format: "CAROUSEL",
  timestamp: daysAgo(40),
  permalink: "https://www.instagram.com/p/ABC123/",
  reach: 1000,
  likes: 80,
  comments: 15,
  saves: 30,
  engagementRate: 0.125,
  ...over,
});

Deno.test("jointure par ID média : post app mesuré → top_engagement avec metrics", () => {
  const out = rankRecycleCandidates(
    [appPost({ published_post_id: "1789000000" })],
    [igPost()],
    NOW,
  );
  assertEquals(out.length, 1);
  assertEquals(out[0].source, "app");
  assertEquals(out[0].reason, "top_engagement");
  assertEquals(out[0].metrics?.engagementRate, 0.125);
  assertEquals(out[0].content !== null, true); // texte complet conservé
});

Deno.test("jointure par PERMALINK (publication directe #158)", () => {
  const out = rankRecycleCandidates(
    [appPost({ published_post_id: "https://www.instagram.com/p/ABC123/" })],
    [igPost()],
    NOW,
  );
  assertEquals(out[0].reason, "top_engagement");
});

Deno.test("post app sans métrique → revive, les plus ANCIENS d'abord", () => {
  const out = rankRecycleCandidates(
    [
      appPost({ id: "recent", published_at: daysAgo(30) }),
      appPost({ id: "vieux", published_at: daysAgo(90) }),
    ],
    [],
    NOW,
  );
  assertEquals(out.map((c) => c.id), ["vieux", "recent"]);
  assertEquals(out[0].reason, "revive");
});

Deno.test(`un post plus frais que ${MIN_AGE_DAYS} jours n'est jamais proposé`, () => {
  const out = rankRecycleCandidates(
    [appPost({ published_at: daysAgo(5) })],
    [igPost({ timestamp: daysAgo(3) })],
    NOW,
  );
  assertEquals(out.length, 0);
});

Deno.test("top IG réel NON publié via l'app → candidat instagram (sujet court)", () => {
  const out = rankRecycleCandidates([], [
    igPost({ id: "a", engagementRate: 0.2 }),
    igPost({ id: "b", engagementRate: 0.01 }), // sous la moyenne → exclu
  ], NOW);
  assertEquals(out.length, 1);
  assertEquals(out[0].source, "instagram");
  assertEquals(out[0].content, null);
});

Deno.test("tri : top engagement (ER desc) avant revive, cap MAX_CANDIDATES", () => {
  const apps = [
    appPost({ id: "m1", published_post_id: "ig1" }),
    appPost({ id: "m2", published_post_id: "ig2" }),
    ...Array.from({ length: 8 }, (_, i) => appPost({ id: `old-${i}`, published_at: daysAgo(50 + i) })),
  ];
  const igs = [
    igPost({ id: "ig1", engagementRate: 0.05 }),
    igPost({ id: "ig2", engagementRate: 0.30 }),
  ];
  const out = rankRecycleCandidates(apps, igs, NOW);
  assertEquals(out.length, MAX_CANDIDATES);
  assertEquals(out[0].id, "m2"); // meilleur ER en premier
  assertEquals(out[1].id, "m1");
  assertEquals(out[2].reason, "revive");
});

Deno.test("post sans texte (content_draft vide) ignoré", () => {
  const out = rankRecycleCandidates([appPost({ content_draft: "  " })], [], NOW);
  assertEquals(out.length, 0);
});
