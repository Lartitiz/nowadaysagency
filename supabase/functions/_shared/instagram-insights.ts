// Lecture des statistiques Instagram (Graph API "Instagram Business Login").
// Récupère les métriques du compte (abonnés, reach, croissance) + les insights
// par post sur les ~90 derniers jours, pour nourrir l'audit avec des données RÉELLES
// au lieu de la saisie manuelle. Réutilise refreshTokenIfNeeded de instagram-graph.ts.
//
// Robustesse : chaque sous-appel est isolé dans un try/catch et renvoie un partiel.
// Si une métrique n'est pas disponible (type de compte, permission, période vide),
// on continue sans elle — on ne casse jamais l'audit.
import { refreshTokenIfNeeded } from "./instagram-graph.ts";

const GRAPH = "https://graph.instagram.com/v21.0";

export interface IgPostMetrics {
  id: string;
  subject: string; // début de la légende, sert de "sujet" dans l'audit
  format: string; // IMAGE / CAROUSEL / VIDEO / REEL
  timestamp: string;
  permalink?: string;
  reach?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  engagementRate?: number; // (likes+comments+saves+shares) / reach
}

export interface IgLiveMetrics {
  followers?: number;
  follows?: number;
  mediaCount?: number;
  reach30d?: number;
  followerGrowth30d?: number;
  postsLast30d?: number;
  frequencyLabel?: string;
  avgEngagementRate?: number; // moyenne sur les posts mesurés
  topPosts: IgPostMetrics[]; // 3 meilleurs par engagement
  flopPosts: IgPostMetrics[]; // 3 moins bons par engagement
  fetchedAt: string;
  partial: boolean; // true si une partie des appels a échoué
}

async function getJson(url: URL): Promise<any | null> {
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
      console.warn("IG insights call failed:", url.pathname, json?.error?.message);
      return null;
    }
    return json;
  } catch (e) {
    console.warn("IG insights fetch error:", url.pathname, e);
    return null;
  }
}

function deriveFrequency(postsLast30d: number): string {
  if (postsLast30d >= 25) return "Tous les jours";
  if (postsLast30d >= 12) return "3-4x/semaine";
  if (postsLast30d >= 5) return "1-2x/semaine";
  if (postsLast30d >= 1) return "Moins d'1x/semaine";
  return "Irrégulier";
}

/**
 * Récupère les statistiques réelles du compte Instagram d'une connexion.
 * `conn` = ligne social_connections (platform_account_id + access_token).
 */
export async function fetchInstagramInsights(
  supabase: any,
  conn: any,
): Promise<IgLiveMetrics> {
  const token = await refreshTokenIfNeeded(supabase, conn);
  const igId = conn.platform_account_id;
  let partial = false;

  const result: IgLiveMetrics = {
    topPosts: [],
    flopPosts: [],
    fetchedAt: new Date().toISOString(),
    partial: false,
  };

  // 1. Compteurs de base du compte.
  const base = await getJson(
    (() => {
      const u = new URL(`${GRAPH}/${igId}`);
      u.searchParams.set("fields", "followers_count,follows_count,media_count");
      u.searchParams.set("access_token", token);
      return u;
    })(),
  );
  if (base) {
    result.followers = base.followers_count;
    result.follows = base.follows_count;
    result.mediaCount = base.media_count;
  } else {
    partial = true;
  }

  // 2. Reach du compte sur 28 jours. (profile_views écarté : peu fiable dans cette
  //    version de l'API — renvoyait des valeurs aberrantes type "4 vues / 28 j".)
  //    On privilégie total_value (agrégat) ; à défaut on SOMME la série journalière
  //    plutôt que de lire la 1re journée (cause des reach sous-évalués observés).
  const acct = await getJson(
    (() => {
      const u = new URL(`${GRAPH}/${igId}/insights`);
      u.searchParams.set("metric", "reach");
      u.searchParams.set("period", "days_28");
      u.searchParams.set("metric_type", "total_value");
      u.searchParams.set("access_token", token);
      return u;
    })(),
  );
  if (acct?.data) {
    for (const m of acct.data) {
      if (m.name !== "reach") continue;
      const total = m?.total_value?.value;
      const summed = Array.isArray(m?.values)
        ? m.values.reduce((s: number, v: any) => s + (Number(v?.value) || 0), 0)
        : undefined;
      result.reach30d = typeof total === "number" ? total : summed;
    }
  } else {
    partial = true;
  }

  // 3. Croissance d'abonnés sur 30 jours. follower_count (period=day) renvoie le nb
  //    de nouveaux abonnés par jour → on somme. On ne garde la valeur QUE si la série
  //    existe vraiment (sinon reduce([]) = 0 ferait passer "pas de données" pour "+0").
  const growth = await getJson(
    (() => {
      const u = new URL(`${GRAPH}/${igId}/insights`);
      u.searchParams.set("metric", "follower_count");
      u.searchParams.set("period", "day");
      u.searchParams.set("access_token", token);
      return u;
    })(),
  );
  const growthValues = growth?.data?.[0]?.values;
  if (Array.isArray(growthValues) && growthValues.length > 0) {
    result.followerGrowth30d = growthValues.reduce(
      (sum: number, v: any) => sum + (Number(v?.value) || 0),
      0,
    );
  }

  // 4. Posts récents + insights par post.
  const media = await getJson(
    (() => {
      const u = new URL(`${GRAPH}/${igId}/media`);
      u.searchParams.set("fields", "id,caption,media_type,timestamp,permalink");
      u.searchParams.set("limit", "25");
      u.searchParams.set("access_token", token);
      return u;
    })(),
  );

  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  let postsLast30d = 0;
  const measured: IgPostMetrics[] = [];

  if (media?.data?.length) {
    for (const post of media.data) {
      if (post.timestamp && new Date(post.timestamp).getTime() >= cutoff) postsLast30d++;

      const ins = await getJson(
        (() => {
          const u = new URL(`${GRAPH}/${post.id}/insights`);
          // saved/shares ne sont pas dispo sur tous les types de média → on demande
          // un set large, les métriques absentes sont simplement ignorées.
          u.searchParams.set("metric", "reach,likes,comments,saved,shares");
          u.searchParams.set("access_token", token);
          return u;
        })(),
      );

      const pm: IgPostMetrics = {
        id: String(post.id),
        subject: (post.caption || "").replace(/\s+/g, " ").trim().slice(0, 120),
        format: String(post.media_type || "IMAGE"),
        timestamp: post.timestamp,
        permalink: post.permalink,
      };
      if (ins?.data) {
        for (const m of ins.data) {
          const val = m?.values?.[0]?.value ?? m?.total_value?.value;
          if (m.name === "reach") pm.reach = val;
          if (m.name === "likes") pm.likes = val;
          if (m.name === "comments") pm.comments = val;
          if (m.name === "saved") pm.saves = val;
          if (m.name === "shares") pm.shares = val;
        }
        const interactions =
          (pm.likes || 0) + (pm.comments || 0) + (pm.saves || 0) + (pm.shares || 0);
        if (pm.reach && pm.reach > 0) pm.engagementRate = interactions / pm.reach;
      } else {
        partial = true;
      }
      measured.push(pm);
    }
  } else {
    partial = true;
  }

  result.postsLast30d = postsLast30d;
  result.frequencyLabel = deriveFrequency(postsLast30d);

  // Classement top/flop : on ne garde que les posts dont on a pu mesurer l'engagement.
  const ranked = measured
    .filter((p) => typeof p.engagementRate === "number")
    .sort((a, b) => (b.engagementRate || 0) - (a.engagementRate || 0));
  if (ranked.length) {
    result.topPosts = ranked.slice(0, 3);
    result.flopPosts = ranked.slice(-3).reverse();
    result.avgEngagementRate =
      ranked.reduce((s, p) => s + (p.engagementRate || 0), 0) / ranked.length;
  }

  // Garde-fou de cohérence : l'API renvoie parfois un reach compte aberrant (sous le
  // reach d'un seul post). Un compte ne peut pas avoir un reach inférieur à celui d'un
  // de ses posts → si c'est le cas, la valeur n'est pas fiable, on ne l'expose pas à
  // l'audit (mieux vaut une métrique absente qu'un chiffre impossible).
  const maxPostReach = Math.max(0, ...measured.map((p) => p.reach || 0));
  if (typeof result.reach30d === "number" && result.reach30d < maxPostReach) {
    result.reach30d = undefined;
  }

  result.partial = partial;
  return result;
}
