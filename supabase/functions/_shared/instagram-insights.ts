// Lecture des statistiques Instagram (Graph API "Instagram Business Login").
// Récupère les métriques du compte (abonnés, reach, croissance) + les insights
// par post sur les ~90 derniers jours, pour nourrir l'audit avec des données RÉELLES
// au lieu de la saisie manuelle. Réutilise refreshTokenIfNeeded de instagram-graph.ts.
//
// Robustesse : chaque sous-appel est isolé dans un try/catch et renvoie un partiel.
// Si une métrique n'est pas disponible (type de compte, permission, période vide),
// on continue sans elle — on ne casse jamais l'audit.
import { refreshTokenIfNeeded } from "./instagram-graph.ts";

const GRAPH = "https://graph.instagram.com/v23.0";

export interface IgPostMetrics {
  id: string;
  subject: string; // début de la légende, sert de "sujet" dans l'audit
  format: string; // IMAGE / CAROUSEL / VIDEO / REEL
  timestamp: string;
  permalink?: string;
  reach?: number;
  views?: number; // nouvelle métrique Meta (remplace impressions) — clé pour les Reels
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  engagementRate?: number; // (likes+comments+saves+shares) / (reach ou, à défaut, views)
}

export interface IgAudienceBucket {
  label: string; // ex: "25-34", "Femmes", "Paris, Île-de-France", "FR"
  value: number; // nb d'abonnés dans ce segment (compte, pas %)
}

export interface IgAudience {
  age?: IgAudienceBucket[]; // tranches d'âge, triées desc
  gender?: IgAudienceBucket[]; // genre (libellés FR)
  cities?: IgAudienceBucket[]; // top villes
  countries?: IgAudienceBucket[]; // top pays (codes ISO)
}

export interface IgLiveMetrics {
  followers?: number;
  follows?: number;
  mediaCount?: number;
  reach30d?: number;
  views30d?: number; // vues du compte sur 28 j (remplace impressions, dépréciées par Meta)
  totalInteractions30d?: number; // likes + commentaires + partages + enregistrements du compte
  accountsEngaged30d?: number; // nb de comptes uniques ayant interagi
  profileViews30d?: number; // visites du profil (réintroduit par Meta en 2025)
  followerGrowth30d?: number;
  postsLast30d?: number;
  frequencyLabel?: string;
  avgEngagementRate?: number; // moyenne sur les posts mesurés
  topPosts: IgPostMetrics[]; // 3 meilleurs par engagement
  flopPosts: IgPostMetrics[]; // 3 moins bons par engagement
  audience?: IgAudience; // démographie des abonnés (follower_demographics)
  fetchedAt: string;
  partial: boolean; // true si une partie des appels a échoué
  authError?: boolean; // true si Meta a signalé un token invalide / permission retirée
}

const GENDER_LABELS_FR: Record<string, string> = {
  F: "Femmes",
  M: "Hommes",
  U: "Non précisé",
};

// Récupère un découpage démographique des abonnés (age / gender / city / country)
// via la métrique follower_demographics. Réservé aux comptes ≥ 100 abonnés ; chaque
// appel est isolé et renvoie undefined si la donnée n'est pas exploitable.
async function fetchDemographicBreakdown(
  igId: string,
  token: string,
  breakdown: "age" | "gender" | "city" | "country",
  ctx?: IgFetchContext,
): Promise<IgAudienceBucket[] | undefined> {
  const u = new URL(`${GRAPH}/${igId}/insights`);
  u.searchParams.set("metric", "follower_demographics");
  u.searchParams.set("period", "lifetime");
  u.searchParams.set("metric_type", "total_value");
  u.searchParams.set("breakdown", breakdown);
  u.searchParams.set("access_token", token);
  const json = await getJson(u, ctx);
  const results = json?.data?.[0]?.total_value?.breakdowns?.[0]?.results;
  if (!Array.isArray(results) || results.length === 0) return undefined;
  const buckets = results
    .map((r: any) => ({
      label: String(r?.dimension_values?.[0] ?? "").trim(),
      value: Number(r?.value) || 0,
    }))
    .filter((b: IgAudienceBucket) => b.label && b.value > 0)
    .sort((a: IgAudienceBucket, b: IgAudienceBucket) => b.value - a.value);
  return buckets.length ? buckets : undefined;
}

// Contexte d'erreurs d'une récupération : permet de distinguer un token
// expiré/permission retirée (→ 409 « reconnecte-toi » côté edge) d'un simple
// trou de données, sans jamais casser les appels partiels.
export interface IgFetchContext {
  authError: boolean;
  rateLimited: boolean;
}
export function newFetchContext(): IgFetchContext {
  return { authError: false, rateLimited: false };
}

async function getJson(url: URL, ctx?: IgFetchContext): Promise<any | null> {
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
      const err = json?.error;
      // 190 = token invalide/expiré ; OAuthException 10/200+ = permission retirée.
      if (ctx && (err?.code === 190 || err?.type === "OAuthException")) ctx.authError = true;
      // 4/17/32/613 = rate limit Meta.
      if (ctx && [4, 17, 32, 613].includes(err?.code)) ctx.rateLimited = true;
      console.warn("IG insights call failed:", url.pathname, err?.code, err?.message);
      return null;
    }
    return json;
  } catch (e) {
    console.warn("IG insights fetch error:", url.pathname, e);
    return null;
  }
}

// Exécute des tâches avec une concurrence bornée (ordre des résultats préservé).
// Meta tolère bien quelques appels simultanés ; en séquentiel, ~25 posts × 2
// appels prenaient l'essentiel du temps de l'edge.
const POST_CONCURRENCY = 5;
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// Lit la valeur agrégée d'une réponse insights (total_value, ou somme de la série).
function readTotalValue(json: any): number | undefined {
  const d = json?.data?.[0];
  if (!d) return undefined;
  const total = d?.total_value?.value;
  if (typeof total === "number") return total;
  if (Array.isArray(d?.values)) {
    const s = d.values.reduce((a: number, v: any) => a + (Number(v?.value) || 0), 0);
    return Number.isFinite(s) ? s : undefined;
  }
  return undefined;
}

// Récupère une métrique compte agrégée (metric_type=total_value) sur les 28 derniers
// jours. Couvre les nouvelles métriques Meta : views, total_interactions,
// accounts_engaged, profile_views.
//
// IMPORTANT : on interroge en period=day avec une fenêtre since/until EXPLICITE.
// C'est le mode documenté par Meta pour les métriques d'interaction
// (total_interactions, accounts_engaged) qui, SANS fenêtre, renvoient la valeur d'UNE
// seule journée au lieu de l'agrégat 28 j (bug observé : ~5 interactions au lieu de
// plusieurs centaines). metric_type=total_value → Meta renvoie l'agrégat sur la
// fenêtre ; à défaut on somme la série. Repli en days_28 si la fenêtre échoue (suffit
// pour views/profile_views). Appel ISOLÉ : une métrique absente renvoie undefined
// sans casser les autres.
async function fetchAccountTotalValue(
  igId: string,
  token: string,
  metric: string,
  ctx?: IgFetchContext,
): Promise<number | undefined> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - 28 * 24 * 3600;

  const windowed = new URL(`${GRAPH}/${igId}/insights`);
  windowed.searchParams.set("metric", metric);
  windowed.searchParams.set("period", "day");
  windowed.searchParams.set("metric_type", "total_value");
  windowed.searchParams.set("since", String(since));
  windowed.searchParams.set("until", String(until));
  windowed.searchParams.set("access_token", token);
  const v1 = readTotalValue(await getJson(windowed, ctx));
  if (typeof v1 === "number") return v1;

  // Repli : agrégat days_28 sans fenêtre.
  const fallback = new URL(`${GRAPH}/${igId}/insights`);
  fallback.searchParams.set("metric", metric);
  fallback.searchParams.set("period", "days_28");
  fallback.searchParams.set("metric_type", "total_value");
  fallback.searchParams.set("access_token", token);
  return readTotalValue(await getJson(fallback, ctx));
}

function deriveFrequency(postsLast30d: number): string {
  if (postsLast30d >= 25) return "Tous les jours";
  if (postsLast30d >= 12) return "3-4x/semaine";
  if (postsLast30d >= 5) return "1-2x/semaine";
  if (postsLast30d >= 1) return "Moins d'1x/semaine";
  return "Irrégulier";
}

/**
 * Récupère UNIQUEMENT les ~25 derniers posts avec leurs métriques par post
 * (reach, likes, comments, saves, shares, views pour les Reels) + engagementRate.
 * Version légère de fetchInstagramInsights (pas de démographie ni de métriques
 * compte) — utilisée par le recyclage intelligent (edge recycle-candidates).
 */
export async function fetchRecentPostMetrics(
  supabase: any,
  conn: any,
): Promise<{ posts: IgPostMetrics[]; postsLast30d: number; partial: boolean; authError?: boolean }> {
  const token = await refreshTokenIfNeeded(supabase, conn);
  const ctx = newFetchContext();
  const res = await fetchPostMetricsInternal(conn.platform_account_id, token, ctx);
  return { ...res, authError: ctx.authError };
}

async function fetchPostMetricsInternal(
  igId: string,
  token: string,
  ctx: IgFetchContext,
): Promise<{ posts: IgPostMetrics[]; postsLast30d: number; partial: boolean }> {
  let partial = false;
  const media = await getJson(
    (() => {
      const u = new URL(`${GRAPH}/${igId}/media`);
      u.searchParams.set("fields", "id,caption,media_type,timestamp,permalink");
      u.searchParams.set("limit", "25");
      u.searchParams.set("access_token", token);
      return u;
    })(),
    ctx,
  );

  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  let postsLast30d = 0;
  let measured: IgPostMetrics[] = [];

  if (media?.data?.length) {
    // Un pool borné remplace la boucle séquentielle (~25 posts × 2 appels en
    // série = l'essentiel de la latence de l'edge). Ordre préservé par mapPool.
    measured = await mapPool(media.data as any[], POST_CONCURRENCY, async (post) => {
      const pm: IgPostMetrics = {
        id: String(post.id),
        subject: (post.caption || "").replace(/\s+/g, " ").trim().slice(0, 120),
        format: String(post.media_type || "IMAGE"),
        timestamp: post.timestamp,
        permalink: post.permalink,
      };

      const isVideo = ["VIDEO", "REEL"].includes(pm.format.toUpperCase());
      const insUrl = new URL(`${GRAPH}/${post.id}/insights`);
      // saved/shares ne sont pas dispo sur tous les types de média → on demande
      // un set large, les métriques absentes sont simplement ignorées.
      insUrl.searchParams.set("metric", "reach,likes,comments,saved,shares");
      insUrl.searchParams.set("access_token", token);

      // Reels / vidéos : Meta sert souvent "views" plutôt que "reach". Appel
      // isolé (pour ne pas casser l'appel éprouvé) mais en parallèle du premier.
      const viewsUrl = new URL(`${GRAPH}/${post.id}/insights`);
      viewsUrl.searchParams.set("metric", "views");
      viewsUrl.searchParams.set("access_token", token);

      const [ins, vj] = await Promise.all([
        getJson(insUrl, ctx),
        isVideo ? getJson(viewsUrl, ctx) : Promise.resolve(null),
      ]);

      if (ins?.data) {
        for (const m of ins.data) {
          const val = m?.values?.[0]?.value ?? m?.total_value?.value;
          if (m.name === "reach") pm.reach = val;
          if (m.name === "likes") pm.likes = val;
          if (m.name === "comments") pm.comments = val;
          if (m.name === "saved") pm.saves = val;
          if (m.name === "shares") pm.shares = val;
        }
      } else {
        partial = true;
      }

      const v = vj?.data?.find((m: any) => m.name === "views");
      const vVal = v?.values?.[0]?.value ?? v?.total_value?.value;
      if (typeof vVal === "number") pm.views = vVal;

      const interactions =
        (pm.likes || 0) + (pm.comments || 0) + (pm.saves || 0) + (pm.shares || 0);
      // Dénominateur : reach en priorité, sinon views (Reels), sinon on ne calcule pas.
      const denom = (pm.reach && pm.reach > 0) ? pm.reach
        : (pm.views && pm.views > 0) ? pm.views
        : 0;
      if (denom > 0) pm.engagementRate = interactions / denom;
      return pm;
    });

    for (const post of media.data) {
      if (post.timestamp && new Date(post.timestamp).getTime() >= cutoff) postsLast30d++;
    }
  } else {
    partial = true;
  }

  return { posts: measured, postsLast30d, partial };
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
  const ctx = newFetchContext();
  let partial = false;

  const result: IgLiveMetrics = {
    topPosts: [],
    flopPosts: [],
    fetchedAt: new Date().toISOString(),
    partial: false,
  };

  // Les blocs 1/2/2bis/3/4 sont indépendants : ils partaient en SÉRIE (5 allers-
  // retours Meta l'un après l'autre) → désormais en parallèle. La sémantique de
  // chaque bloc (fenêtres, replis, gardes) est inchangée.

  // 1. Compteurs de base du compte.
  const fetchBase = async () => {
    const u = new URL(`${GRAPH}/${igId}`);
    u.searchParams.set("fields", "followers_count,follows_count,media_count");
    u.searchParams.set("access_token", token);
    return getJson(u, ctx);
  };

  // 2. Reach UNIQUE du compte sur les 28 derniers jours. Comme les autres métriques
  //    compte, on interroge sur une fenêtre since/until EXPLICITE (period=day +
  //    total_value) : sans fenêtre, days_28 renvoyait le reach d'UNE seule journée
  //    (cause des reach aberrants/sous-évalués qui se faisaient écarter par la garde).
  //    ⚠️ Le reach compte des utilisateurs UNIQUES → on lit l'agrégat total_value, on
  //    ne SOMME JAMAIS la série journalière (ça doublonnerait les mêmes personnes).
  const fetchReach28 = async (): Promise<number | undefined> => {
    const until = Math.floor(Date.now() / 1000);
    const since = until - 28 * 24 * 3600;
    const windowed = new URL(`${GRAPH}/${igId}/insights`);
    windowed.searchParams.set("metric", "reach");
    windowed.searchParams.set("period", "day");
    windowed.searchParams.set("metric_type", "total_value");
    windowed.searchParams.set("since", String(since));
    windowed.searchParams.set("until", String(until));
    windowed.searchParams.set("access_token", token);
    const total = (await getJson(windowed, ctx))?.data?.find((m: any) => m.name === "reach")
      ?.total_value?.value;
    if (typeof total === "number") return total;
    // Repli : agrégat days_28 sans fenêtre (lit total_value uniquement, jamais la somme).
    const fb = new URL(`${GRAPH}/${igId}/insights`);
    fb.searchParams.set("metric", "reach");
    fb.searchParams.set("period", "days_28");
    fb.searchParams.set("metric_type", "total_value");
    fb.searchParams.set("access_token", token);
    const fbTotal = (await getJson(fb, ctx))?.data?.find((m: any) => m.name === "reach")
      ?.total_value?.value;
    return typeof fbTotal === "number" ? fbTotal : undefined;
  };

  // 3. Croissance d'abonnés sur 30 jours. follower_count (period=day) renvoie le nb
  //    de nouveaux abonnés par jour → on somme. On ne garde la valeur QUE si la série
  //    existe vraiment (sinon reduce([]) = 0 ferait passer "pas de données" pour "+0").
  const fetchGrowth = async () => {
    const u = new URL(`${GRAPH}/${igId}/insights`);
    u.searchParams.set("metric", "follower_count");
    u.searchParams.set("period", "day");
    u.searchParams.set("access_token", token);
    return getJson(u, ctx);
  };

  // 2bis. Métriques compte agrégées sur 28 j (views = remplace impressions ;
  //       total_interactions, accounts_engaged, profile_views). Appels isolés et
  //       optionnels : une métrique absente reste simplement vide (pas de partial),
  //       on enrichit le remplissage auto sans jamais dégrader le reste.
  const [base, reach28, accountVals, growth, postData] = await Promise.all([
    fetchBase(),
    fetchReach28(),
    Promise.all([
      fetchAccountTotalValue(igId, token, "views", ctx),
      fetchAccountTotalValue(igId, token, "total_interactions", ctx),
      fetchAccountTotalValue(igId, token, "accounts_engaged", ctx),
      fetchAccountTotalValue(igId, token, "profile_views", ctx),
    ]),
    fetchGrowth(),
    // 4. Posts récents + insights par post (logique partagée avec le recyclage
    // intelligent via fetchRecentPostMetrics).
    fetchPostMetricsInternal(igId, token, ctx),
  ]);

  if (base) {
    result.followers = base.followers_count;
    result.follows = base.follows_count;
    result.mediaCount = base.media_count;
  } else {
    partial = true;
  }

  if (typeof reach28 === "number") result.reach30d = reach28;
  else partial = true;

  const [views30d, totalInteractions30d, accountsEngaged30d, profileViews30d] = accountVals;
  if (typeof views30d === "number") result.views30d = views30d;
  if (typeof totalInteractions30d === "number") result.totalInteractions30d = totalInteractions30d;
  if (typeof accountsEngaged30d === "number") result.accountsEngaged30d = accountsEngaged30d;
  if (typeof profileViews30d === "number") result.profileViews30d = profileViews30d;

  const growthValues = growth?.data?.[0]?.values;
  if (Array.isArray(growthValues) && growthValues.length > 0) {
    result.followerGrowth30d = growthValues.reduce(
      (sum: number, v: any) => sum + (Number(v?.value) || 0),
      0,
    );
  }

  // 1bis. Démographie de l'audience (follower_demographics). L'API exige ≥ 100
  //       abonnés, sinon elle renvoie une erreur → on ne tente qu'au-dessus du seuil
  //       (dépend du bloc 1, donc après le Promise.all). Bonus : un échec ici ne
  //       dégrade pas le reste (pas de partial).
  if (typeof result.followers === "number" && result.followers >= 100) {
    const [age, gender, cities, countries] = await Promise.all([
      fetchDemographicBreakdown(igId, token, "age", ctx),
      fetchDemographicBreakdown(igId, token, "gender", ctx),
      fetchDemographicBreakdown(igId, token, "city", ctx),
      fetchDemographicBreakdown(igId, token, "country", ctx),
    ]);
    const audience: IgAudience = {};
    if (age?.length) audience.age = age;
    if (gender?.length) {
      audience.gender = gender.map((g) => ({
        ...g,
        label: GENDER_LABELS_FR[g.label] || g.label,
      }));
    }
    if (cities?.length) audience.cities = cities.slice(0, 6);
    if (countries?.length) audience.countries = countries.slice(0, 6);
    if (Object.keys(audience).length) result.audience = audience;
  }

  if (postData.partial) partial = true;
  const measured = postData.posts;

  result.postsLast30d = postData.postsLast30d;
  result.frequencyLabel = deriveFrequency(postData.postsLast30d);

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

  // Garde-fou de cohérence : le reach 28 j du compte ne peut pas être inférieur au
  // reach d'un post PUBLIÉ DANS CES 28 JOURS (le reach compte dédoublonne au moins ce
  // post). On compare donc UNIQUEMENT aux posts récents (≤ 28 j) — un vieux post viral
  // (jusqu'à 90 j dans la liste) peut légitimement dépasser le reach 28 j et ne doit
  // pas faire écarter une valeur correcte. Si l'invariant casse, le reach est aberrant
  // → on ne l'expose pas (mieux vaut vide qu'impossible).
  const recentCutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const maxRecentPostReach = Math.max(
    0,
    ...measured
      .filter((p) => p.timestamp && new Date(p.timestamp).getTime() >= recentCutoff)
      .map((p) => p.reach || 0),
  );
  if (typeof result.reach30d === "number" && result.reach30d < maxRecentPostReach) {
    result.reach30d = undefined;
  }
  // De même, une croissance à 0 sur 30 j pour un compte qui publie est presque
  // toujours un "pas de données" de l'API (le metric follower_count compte les
  // NOUVEAUX abonnés, jamais négatif) → on ne l'expose pas comme une vraie stagnation.
  if (result.followerGrowth30d === 0) {
    result.followerGrowth30d = undefined;
  }

  result.partial = partial;
  result.authError = ctx.authError;
  return result;
}
