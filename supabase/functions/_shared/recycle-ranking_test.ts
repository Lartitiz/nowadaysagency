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

Deno.test("top IG réel NON publié via l'app → candidat instagram s'il atteint la médiane", () => {
  const out = rankRecycleCandidates([], [
    igPost({ id: "a", likes: 200 }),
    igPost({ id: "b", likes: 80 }), // pile la médiane → gardé
    igPost({ id: "c", likes: 10 }), // sous la médiane → exclu
  ], NOW);
  assertEquals(out.map((c) => c.id), ["a", "b"]);
  assertEquals(out[0].source, "instagram");
  assertEquals(out[0].content, null);
  assertEquals(out[0].metrics?.xMedian, 2.5);
});

Deno.test("un post viral n'écarte plus les autres bons posts (médiane, pas moyenne)", () => {
  // Moyenne des likes = 880 : avec elle, seul le viral passait. Médiane = 100.
  const out = rankRecycleCandidates([], [
    igPost({ id: "viral", likes: 4000 }),
    igPost({ id: "bon", likes: 160 }),
    igPost({ id: "moyen", likes: 100 }),
    igPost({ id: "bas", likes: 80 }),
    igPost({ id: "plus-bas", likes: 60 }),
  ], NOW);
  assertEquals(out.map((c) => c.id), ["viral", "bon", "moyen"]);
});

Deno.test("moins de 3 posts mesurés : pas de médiane, aucun post Instagram hors app proposé", () => {
  const out = rankRecycleCandidates([], [igPost({ id: "a", likes: 500 }), igPost({ id: "b", likes: 5 })], NOW);
  assertEquals(out.length, 0);
});

Deno.test("tri : × médiane décroissant avant revive, cap MAX_CANDIDATES", () => {
  const apps = [
    appPost({ id: "m1", published_post_id: "ig1" }),
    appPost({ id: "m2", published_post_id: "ig2" }),
    ...Array.from({ length: 8 }, (_, i) => appPost({ id: `old-${i}`, published_at: daysAgo(50 + i) })),
  ];
  const igs = [
    // m1 a le meilleur taux d'engagement mais peu de likes : c'est × médiane qui classe.
    igPost({ id: "ig1", likes: 40, engagementRate: 0.30 }),
    igPost({ id: "ig2", likes: 240, engagementRate: 0.05 }),
    igPost({ id: "ig3", likes: 80 }),
  ];
  const out = rankRecycleCandidates(apps, igs, NOW);
  assertEquals(out.length, MAX_CANDIDATES);
  assertEquals(out[0].id, "m2");
  assertEquals(out[0].metrics?.xMedian, 3);
  assertEquals(out[1].id, "ig3"); // post Instagram hors app, pile à la médiane
  assertEquals(out[2].id, "m1");
  assertEquals(out[3].reason, "revive");
});

Deno.test("sans médiane possible, les posts app mesurés restent classés par taux d'engagement", () => {
  const out = rankRecycleCandidates(
    [appPost({ id: "m1", published_post_id: "ig1" }), appPost({ id: "m2", published_post_id: "ig2" })],
    [igPost({ id: "ig1", engagementRate: 0.05 }), igPost({ id: "ig2", engagementRate: 0.30 })],
    NOW,
  );
  assertEquals(out.map((c) => c.id), ["m2", "m1"]);
});

Deno.test("post sans texte (content_draft vide) ignoré", () => {
  const out = rankRecycleCandidates([appPost({ content_draft: "  " })], [], NOW);
  assertEquals(out.length, 0);
});
