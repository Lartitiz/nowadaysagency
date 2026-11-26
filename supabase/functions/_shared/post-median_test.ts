import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { annotatePosts, likesMedian, median, MEDIAN_MAX_POSTS, MEDIAN_MIN_POSTS } from "./post-median.ts";
import type { IgPostMetrics } from "./instagram-insights.ts";

const NOW = new Date("2026-11-26T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const post = (id: string, likes: number | undefined, age: number): IgPostMetrics => ({
  id, subject: "Sujet " + id, format: "CAROUSEL", timestamp: daysAgo(age), likes,
});
/** n posts posés, 40 likes chacun, du plus récent (10 j) au plus ancien. */
const lot = (n: number, likes = 40) => Array.from({ length: n }, (_, i) => post("p" + i, likes, 10 + i));

Deno.test("médiane : valeur du milieu, moyenne des deux du milieu si pair", () => {
  assertEquals(median([5, 1, 3]), 3);
  assertEquals(median([1, 2, 3, 10]), 2.5);
  assertEquals(median([]), null);
});

Deno.test("un post viral ne déplace pas la médiane (c'est tout l'intérêt face à la moyenne)", () => {
  const posts = [...lot(11), post("viral", 4000, 30)];
  assertEquals(likesMedian(posts, NOW), { median: 40, sample: 12 });
});

Deno.test(`moins de ${MEDIAN_MIN_POSTS} posts posés → pas de médiane, donc pas de verdict`, () => {
  const { posts, med } = annotatePosts(lot(11), NOW);
  assertEquals(med, null);
  assertEquals(posts.every((p) => p.verdict === undefined && p.xMedian === undefined), true);
});

Deno.test("un post de moins de 7 jours : « trop tôt », hors médiane, sans multiple", () => {
  const { posts, med } = annotatePosts([post("frais", 900, 3), ...lot(12)], NOW);
  assertEquals(med, { median: 40, sample: 12 });
  assertEquals(posts[0].verdict, "trop_tot");
  assertEquals(posts[0].xMedian, undefined);
});

Deno.test("les posts frais ne comptent pas pour atteindre le minimum", () => {
  assertEquals(likesMedian([post("frais", 40, 2), ...lot(11)], NOW), null);
});

Deno.test("verdicts : × 2 et plus sorti du lot, × 1 et plus au-dessus, sinon en dessous", () => {
  const { posts } = annotatePosts(
    [post("a", 124, 8), post("b", 80, 8), post("c", 56, 8), post("d", 40, 8), post("e", 24, 8), ...lot(12)],
    NOW,
  );
  assertEquals(posts.slice(0, 5).map((p) => [p.xMedian, p.verdict]), [
    [3.1, "sorti_du_lot"],
    [2, "sorti_du_lot"],
    [1.4, "au_dessus"],
    [1, "au_dessus"],
    [0.6, "en_dessous"],
  ]);
});

Deno.test(`seuls les ${MEDIAN_MAX_POSTS} posts posés les plus récents comptent`, () => {
  const recents = Array.from({ length: 24 }, (_, i) => post("r" + i, 10, 8 + i));
  const vieux = Array.from({ length: 10 }, (_, i) => post("v" + i, 999, 100 + i));
  assertEquals(likesMedian([...vieux, ...recents], NOW), { median: 10, sample: 24 });
});

Deno.test("likes absents (métrique non servie) : post ignoré du calcul et sans verdict", () => {
  const { posts, med } = annotatePosts([post("sans", undefined, 20), ...lot(12)], NOW);
  assertEquals(med?.sample, 12);
  assertEquals(posts[0].verdict, undefined);
});

Deno.test("médiane à 0 like : aucun multiple (on ne divise pas par zéro)", () => {
  const { posts, med } = annotatePosts(lot(12, 0), NOW);
  assertEquals(med, null);
  assertEquals(posts[0].xMedian, undefined);
});
