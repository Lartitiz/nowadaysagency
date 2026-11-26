// « Ce post est-il sorti du lot ? » — fonctions PURES (testées dans post-median_test.ts).
//
// Un nombre de likes ne dit rien seul : on le rapporte au post HABITUEL du compte,
// c'est-à-dire la médiane des likes de ses 12 à 24 derniers posts (étude Instagram
// de Laetitia, 26/11/2026). La médiane, pas la moyenne : un seul post viral tire
// une moyenne vers le haut et fait passer tous les autres pour des échecs.
//
// Les chiffres d'un post se relèvent à J+7 : avant, il n'entre pas dans la médiane
// et ne reçoit pas de verdict (« trop tôt »).

import type { IgPostMetrics } from "./instagram-insights-types.ts";

export const MEDIAN_MIN_POSTS = 12;
export const MEDIAN_MAX_POSTS = 24;
export const SETTLE_DAYS = 7;
/** À partir de ce multiple de la médiane, le post est « sorti du lot ». */
export const OUTLIER_MULTIPLE = 2;

export type PostVerdict = "trop_tot" | "sorti_du_lot" | "au_dessus" | "en_dessous";

export interface LikesMedian {
  median: number;
  /** Nombre de posts qui ont servi au calcul. */
  sample: number;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function ageDays(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now.getTime() - t) / 86400000 : null;
}

/**
 * Médiane des likes des posts « posés » (≥ SETTLE_DAYS jours), sur les
 * MEDIAN_MAX_POSTS plus récents. null s'il y en a moins de `minPosts`, ou si la
 * médiane vaut 0 (un multiple de zéro ne veut rien dire).
 */
export function likesMedian(
  posts: IgPostMetrics[],
  now: Date = new Date(),
  minPosts: number = MEDIAN_MIN_POSTS,
): LikesMedian | null {
  const settled = posts
    .filter((p) => typeof p.likes === "number" && (ageDays(p.timestamp, now) ?? -1) >= SETTLE_DAYS)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MEDIAN_MAX_POSTS);
  if (settled.length < minPosts) return null;
  const m = median(settled.map((p) => p.likes as number));
  return m && m > 0 ? { median: m, sample: settled.length } : null;
}

/** Likes du post ÷ médiane, arrondi au dixième. undefined si l'un des deux manque. */
export function timesMedian(post: IgPostMetrics, med: LikesMedian | null): number | undefined {
  if (!med || typeof post.likes !== "number") return undefined;
  return Math.round((post.likes / med.median) * 10) / 10;
}

export function verdictOf(
  post: IgPostMetrics,
  med: LikesMedian | null,
  now: Date = new Date(),
): PostVerdict | undefined {
  const age = ageDays(post.timestamp, now);
  if (age !== null && age < SETTLE_DAYS) return "trop_tot";
  const x = timesMedian(post, med);
  if (x === undefined) return undefined;
  if (x >= OUTLIER_MULTIPLE) return "sorti_du_lot";
  return x >= 1 ? "au_dessus" : "en_dessous";
}

/** Pose `xMedian` et `verdict` sur chaque post (copie, ordre conservé). */
export function annotatePosts(
  posts: IgPostMetrics[],
  now: Date = new Date(),
  minPosts: number = MEDIAN_MIN_POSTS,
): { posts: IgPostMetrics[]; med: LikesMedian | null } {
  const med = likesMedian(posts, now, minPosts);
  return {
    med,
    posts: posts.map((p) => {
      const verdict = verdictOf(p, med, now);
      const xMedian = verdict === "trop_tot" ? undefined : timesMedian(p, med);
      return { ...p, xMedian, verdict };
    }),
  };
}
