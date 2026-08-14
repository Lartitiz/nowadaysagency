// Lecture des statistiques LinkedIn réelles (Community Management API), pour
// nourrir l'audit et la page stats avec des données FACTUELLES au lieu de la
// saisie manuelle. Connexion DISTINCTE de la publication (platform =
// 'linkedin_analytics', scopes r_member_postAnalytics + r_member_profileAnalytics).
//
// Piège déjà rencontré côté Instagram (cf. instagram-insights.ts) et appliqué
// ici d'emblée : TOUJOURS passer une fenêtre temporelle EXPLICITE. LinkedIn encode
// le since/until en objet Restli (année/mois/jour), pas en epoch, mais l'exigence
// est la même : sans dateRange, l'API renvoie l'agrégat LIFETIME du post/compte,
// pas celui de la période demandée — un chiffre plausible mais faux.
//
// Pas de refresh_token LinkedIn (token ~2 mois, comme pour la publication) : on
// utilise conn.access_token tel quel, un 401/403 déclenche authError.

const REST = "https://api.linkedin.com/rest";
// Même version que _shared/linkedin-graph.ts (LINKEDIN_VERSION) — garder synchro.
const LINKEDIN_VERSION = "202606";

export interface LiPostAnalytics {
  impressions?: number;
  membersReached?: number;
  reactions?: number;
  comments?: number;
  reshares?: number;
  saves?: number;
  sends?: number;
  linkClicks?: number;
  followerGainedFromContent?: number;
  profileViewsFromContent?: number;
}

export interface LiLiveMetrics {
  followers?: number;
  followersGained30d?: number;
  postAnalytics30d: LiPostAnalytics;
  fetchedAt: string;
  partial: boolean;
  authError?: boolean;
}

interface LiFetchContext {
  authError: boolean;
}

// Restli 2.0 encode un objet imbriqué en `(clef:valeur,clef:(sous-objet))` — les
// exemples officiels LinkedIn n'URL-encodent PAS ces parenthèses/deux-points dans
// la query string, on les laisse donc telles quelles.
function restliDayFirst(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return `(day:${d.getUTCDate()},month:${d.getUTCMonth() + 1},year:${d.getUTCFullYear()})`;
}
function restliYearFirst(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return `(year:${d.getUTCFullYear()},month:${d.getUTCMonth() + 1},day:${d.getUTCDate()})`;
}

async function getJson(url: string, token: string, ctx: LiFetchContext): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": LINKEDIN_VERSION,
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) ctx.authError = true;
      console.warn("LinkedIn insights call failed:", url, res.status, json?.message);
      return null;
    }
    return json;
  } catch (e) {
    console.warn("LinkedIn insights fetch error:", url, e);
    return null;
  }
}

// queryType → clé de LiPostAnalytics. DAILY n'est pas supporté pour tous les
// queryType (MEMBERS_REACHED, LINK_CLICKS, FOLLOWER_GAINED_FROM_CONTENT,
// PROFILE_VIEW_FROM_CONTENT) → on ne demande QUE l'agrégat TOTAL, jamais DAILY.
const POST_QUERY_TYPES: { key: keyof LiPostAnalytics; type: string }[] = [
  { key: "impressions", type: "IMPRESSION" },
  { key: "membersReached", type: "MEMBERS_REACHED" },
  { key: "reactions", type: "REACTION" },
  { key: "comments", type: "COMMENT" },
  { key: "reshares", type: "RESHARE" },
  { key: "saves", type: "POST_SAVE" },
  { key: "sends", type: "POST_SEND" },
  { key: "linkClicks", type: "LINK_CLICKS" },
  { key: "followerGainedFromContent", type: "FOLLOWER_GAINED_FROM_CONTENT" },
  { key: "profileViewsFromContent", type: "PROFILE_VIEW_FROM_CONTENT" },
];

async function fetchAggregatedPostMetric(
  token: string,
  queryType: string,
  sinceSec: number,
  untilSec: number,
  ctx: LiFetchContext,
): Promise<number | undefined> {
  const dateRange = `(start:${restliDayFirst(sinceSec)},end:${restliDayFirst(untilSec)})`;
  const url = `${REST}/memberCreatorPostAnalytics?q=me&queryType=${queryType}&aggregation=TOTAL&dateRange=${dateRange}`;
  const json = await getJson(url, token, ctx);
  const count = json?.elements?.[0]?.count;
  return typeof count === "number" ? count : undefined;
}

async function fetchFollowersCount(token: string, ctx: LiFetchContext): Promise<number | undefined> {
  const json = await getJson(`${REST}/memberFollowersCount?q=me`, token, ctx);
  const count = json?.elements?.[0]?.memberFollowersCount;
  return typeof count === "number" ? count : undefined;
}

// Somme des nouveaux abonnés/jour sur la fenêtre — miroir du follower_count IG
// (period=day, on additionne la série, jamais l'agrégat lifetime).
async function fetchFollowersGained(
  token: string,
  sinceSec: number,
  untilSec: number,
  ctx: LiFetchContext,
): Promise<number | undefined> {
  const dateRange = `(start:${restliYearFirst(sinceSec)},end:${restliYearFirst(untilSec)})`;
  const json = await getJson(`${REST}/memberFollowersCount?q=dateRange&dateRange=${dateRange}`, token, ctx);
  const els = json?.elements;
  if (!Array.isArray(els) || !els.length) return undefined;
  return els.reduce((s: number, e: any) => s + (Number(e?.memberFollowersCount) || 0), 0);
}

/**
 * Statistiques agrégées des 30 derniers jours (posts + abonnés) pour la
 * connexion LinkedIn analytics (`conn` = ligne social_connections déchiffrée,
 * platform = 'linkedin_analytics').
 */
export async function fetchLinkedInInsights(conn: any): Promise<LiLiveMetrics> {
  const token = conn.access_token as string;
  const ctx: LiFetchContext = { authError: false };
  const until = Math.floor(Date.now() / 1000);
  const since = until - 30 * 24 * 3600;

  const [followers, followersGained30d, ...postVals] = await Promise.all([
    fetchFollowersCount(token, ctx),
    fetchFollowersGained(token, since, until, ctx),
    ...POST_QUERY_TYPES.map((m) => fetchAggregatedPostMetric(token, m.type, since, until, ctx)),
  ]);

  const postAnalytics30d: LiPostAnalytics = {};
  POST_QUERY_TYPES.forEach((m, i) => {
    const v = postVals[i];
    if (typeof v === "number") (postAnalytics30d as any)[m.key] = v;
  });

  return {
    followers,
    followersGained30d,
    postAnalytics30d,
    fetchedAt: new Date().toISOString(),
    partial: typeof followers !== "number" || Object.keys(postAnalytics30d).length < POST_QUERY_TYPES.length,
    authError: ctx.authError,
  };
}
