// Classement des candidats au RECYCLAGE INTELLIGENT (roadmap rétention n°1) :
// détecter les meilleurs posts passés et proposer de les ré-angler.
//
// Deux sources, croisées ici en fonction PURE (testée dans recycle-ranking_test.ts) :
// - les posts publiés PAR L'APP (calendar_posts) : texte complet disponible ;
// - les métriques par post du compte Instagram réel (~25 derniers posts, via
//   fetchRecentPostMetrics) : la mesure réelle de « ça a marché ».
// La jointure se fait sur calendar_posts.published_post_id, qui contient selon le
// chemin de publication soit l'ID média Meta (cron social-publish-scheduled), soit
// le PERMALINK (publication directe, markPostPublished #158) → on matche les deux.

import type { IgPostMetrics } from "./instagram-insights.ts";
import { likesMedian, timesMedian } from "./post-median.ts";

export interface AppPublishedPost {
  id: string;
  theme: string | null;
  content_draft: string | null;
  canal: string | null;
  format: string | null;
  published_at: string | null;
  date: string | null;
  published_post_id: string | null;
}

export interface RecycleCandidate {
  id: string; // calendar_posts.id (source app) ou id média IG (source instagram)
  source: "app" | "instagram";
  /** Pourquoi on le propose : mesuré performant, ou assez ancien pour revivre. */
  reason: "top_engagement" | "revive";
  theme: string;
  /** Texte complet du post — disponible seulement pour la source app. */
  content: string | null;
  excerpt: string;
  canal: string;
  format: string | null;
  publishedAt: string | null;
  permalink?: string;
  metrics?: {
    engagementRate?: number;
    /** Likes ÷ médiane des likes du compte : 2 = deux fois le post habituel. */
    xMedian?: number;
    reach?: number;
    views?: number;
    likes?: number;
    comments?: number;
    saves?: number;
    shares?: number;
  };
}

/** Un post trop frais ne se recycle pas : on laisse vivre au moins 3 semaines. */
export const MIN_AGE_DAYS = 21;
export const MAX_CANDIDATES = 6;
/** Le recyclage tolère une médiane sur peu de posts (les petits comptes en ont peu). */
export const RECYCLE_MEDIAN_MIN_POSTS = 3;

function ageInDays(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 86400000;
}

function matchesPublishedId(publishedPostId: string, ig: IgPostMetrics): boolean {
  if (!publishedPostId) return false;
  if (publishedPostId === ig.id) return true;
  if (ig.permalink && publishedPostId === ig.permalink) return true;
  // Tolérance : id préfixé/suffixé (ex. "instagram://<id>") ou permalink avec slash final.
  if (ig.id.length >= 8 && publishedPostId.includes(ig.id)) return true;
  if (ig.permalink && ig.permalink.length > 20 && publishedPostId.startsWith(ig.permalink.replace(/\/$/, ""))) return true;
  return false;
}

function pickMetrics(ig: IgPostMetrics, xMedian?: number): RecycleCandidate["metrics"] {
  return {
    engagementRate: ig.engagementRate,
    xMedian,
    reach: ig.reach,
    views: ig.views,
    likes: ig.likes,
    comments: ig.comments,
    saves: ig.saves,
    shares: ig.shares,
  };
}

function excerptOf(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + "…";
}

/**
 * Croise posts app publiés et métriques IG réelles, puis classe :
 * 1. `top_engagement` — posts mesurés, classés par « × médiane » (likes du post ÷
 *    médiane des likes du compte), le taux d'engagement départageant les égalités ;
 *    un post Instagram hors app n'est proposé que s'il atteint la médiane ;
 * 2. `revive` (plus ancien d'abord) — posts app sans mesure, assez vieux pour revivre.
 * Tout candidat doit avoir ≥ MIN_AGE_DAYS. Cap à MAX_CANDIDATES.
 */
export function rankRecycleCandidates(
  appPosts: AppPublishedPost[],
  igPosts: IgPostMetrics[],
  now: Date = new Date(),
): RecycleCandidate[] {
  const top: RecycleCandidate[] = [];
  const revive: RecycleCandidate[] = [];
  const matchedIgIds = new Set<string>();

  // La médiane, pas la moyenne : un seul post viral tirait la moyenne vers le haut
  // et écartait tous les autres bons posts.
  const med = likesMedian(igPosts, now, RECYCLE_MEDIAN_MIN_POSTS);

  for (const post of appPosts) {
    const text = (post.content_draft || "").trim();
    if (!text) continue;
    const publishedAt = post.published_at || post.date;
    const age = ageInDays(publishedAt, now);
    if (age === null || age < MIN_AGE_DAYS) continue;

    const ig = post.published_post_id
      ? igPosts.find((p) => matchesPublishedId(post.published_post_id!, p))
      : undefined;
    if (ig) matchedIgIds.add(ig.id);

    const base = {
      id: post.id,
      source: "app" as const,
      theme: (post.theme || "").split("\n")[0].trim() || excerptOf(text, 60),
      content: text,
      excerpt: excerptOf(text),
      canal: post.canal || "instagram",
      format: post.format,
      publishedAt: publishedAt || null,
      permalink: ig?.permalink,
    };

    if (ig && typeof ig.engagementRate === "number") {
      top.push({ ...base, reason: "top_engagement", metrics: pickMetrics(ig, timesMedian(ig, med)) });
    } else {
      revive.push({ ...base, reason: "revive" });
    }
  }

  // Tops IG réels NON publiés via l'app (posts historiques) : proposables aussi,
  // avec le sujet court en guise de matière (le texte complet n'est pas persisté).
  for (const ig of igPosts) {
    if (matchedIgIds.has(ig.id)) continue;
    if (typeof ig.engagementRate !== "number") continue;
    const x = timesMedian(ig, med);
    if (x === undefined || x < 1) continue; // seulement à la médiane du compte ou au-dessus
    const age = ageInDays(ig.timestamp, now);
    if (age === null || age < MIN_AGE_DAYS) continue;
    if (!ig.subject || ig.subject.length < 15) continue; // rien à ré-angler sans sujet
    top.push({
      id: ig.id,
      source: "instagram",
      reason: "top_engagement",
      theme: excerptOf(ig.subject, 60),
      content: null,
      excerpt: ig.subject,
      canal: "instagram",
      format: ig.format?.toLowerCase() || null,
      publishedAt: ig.timestamp,
      permalink: ig.permalink,
      metrics: pickMetrics(ig, x),
    });
  }

  top.sort((a, b) =>
    (b.metrics?.xMedian ?? -1) - (a.metrics?.xMedian ?? -1) ||
    (b.metrics?.engagementRate || 0) - (a.metrics?.engagementRate || 0)
  );
  // À faire revivre : les plus anciens d'abord (ce sont eux qu'on a oubliés).
  revive.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return ta - tb;
  });

  return [...top, ...revive].slice(0, MAX_CANDIDATES);
}
