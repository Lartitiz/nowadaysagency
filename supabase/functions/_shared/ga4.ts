// Lecture des statistiques Google Analytics 4 (GA4 Data API v1beta) pour pré-remplir
// les colonnes « site web » de monthly_stats avec des données RÉELLES au lieu de la
// saisie manuelle. Miroir de _shared/instagram-insights.ts.
//
// Phase 1 : authentification par COMPTE DE SERVICE (service account) Google. On
// signe un JWT RS256 avec la clé privée du compte de service (secrets d'env
// GOOGLE_SA_CLIENT_EMAIL + GOOGLE_SA_PRIVATE_KEY), on l'échange contre un
// access_token OAuth, puis on interroge une seule propriété GA4.
//
// Robustesse : les métriques absentes valent 0, on renvoie toujours des entiers.
// Le module reste sans dépendance externe (WebCrypto natif Deno).

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export interface Ga4MonthMetrics {
  ga4Users: number;
  websiteVisitors: number;
  trafficSearch: number;
  trafficSocial: number;
  trafficPinterest: number;
  trafficInstagram: number;
}

// Une propriété GA4 accessible, aplatie depuis les accountSummaries.
export interface Ga4Property {
  propertyId: string;   // id numérique (sans le préfixe "properties/")
  displayName: string;  // nom d'affichage de la propriété
  account: string;      // "accounts/123456"
  accountName: string;  // nom d'affichage du compte parent
}

// Deux modes d'authentification pour la GA4 Data API :
//  - service  : compte de service Google (Phase 1, secrets d'env) — comportement inchangé.
//  - user     : jeton d'accès OAuth de l'utilisatrice (Phase 2, per-user).
export type Ga4Auth =
  | { mode: "service" }
  | { mode: "user"; accessToken: string };

// ─── Encodage base64url (sans padding) ───
function base64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlFromString(str: string): string {
  return base64urlFromBytes(new TextEncoder().encode(str));
}

// base64 standard → octets (utilisé pour décoder le corps DER de la clé PEM).
function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Extrait les octets DER (PKCS8) d'une clé privée PEM. La variable d'env peut
// contenir des `\n` littéraux (échappés) au lieu de vrais sauts de ligne.
function pkcs8DerFromPem(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return bytesFromBase64(body);
}

// Importe la clé privée du compte de service (RS256) pour la signature.
async function importPrivateKey(pemEnv: string): Promise<CryptoKey> {
  const der = pkcs8DerFromPem(pemEnv);
  return await crypto.subtle.importKey(
    "pkcs8",
    der.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// Construit et signe le JWT assertion (RS256) attendu par l'échange OAuth Google.
async function buildSignedJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64urlFromString(JSON.stringify(header))}.${base64urlFromString(JSON.stringify(claims))}`;
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64urlFromBytes(new Uint8Array(sig))}`;
}

// Échange le JWT signé contre un access_token OAuth (valable ~1 h).
async function getAccessToken(): Promise<string> {
  const clientEmail = Deno.env.get("GOOGLE_SA_CLIENT_EMAIL");
  const privateKey = Deno.env.get("GOOGLE_SA_PRIVATE_KEY");
  if (!clientEmail || !privateKey) {
    throw new Error("GA4 non configuré : GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY manquants.");
  }
  const jwt = await buildSignedJwt(clientEmail, privateKey);
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    throw new Error(`Échec de l'échange OAuth Google (${res.status}): ${json?.error_description || json?.error || "inconnu"}`);
  }
  return json.access_token as string;
}

// ─── Chemin PER-USER (Phase 2 : OAuth utilisateur) ───

// Rafraîchit un access_token utilisateur à partir de son refresh_token
// (grant_type=refresh_token). Renvoie le nouveau jeton + son expiration ISO.
export async function refreshGoogleUserToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GA4 OAuth non configuré : GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants.");
  }
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    throw new Error(`Échec du refresh OAuth Google (${res.status}): ${json?.error_description || json?.error || "inconnu"}`);
  }
  const expiresIn = Number(json.expires_in || 3600);
  return {
    accessToken: json.access_token as string,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

// Résultat de la résolution d'un jeton utilisateur Google pour un scope donné.
export type ResolvedGoogleToken =
  | { conn: null; accessToken: null }                       // pas de connexion google
  | { conn: any; accessToken: null; serviceAccount: true }  // connexion Phase 1 (compte de service)
  | { conn: any; accessToken: string };                     // jeton utilisateur valide

// Charge la connexion Google de l'appelant (scope user OU workspace), déchiffre ses
// jetons et renvoie un access_token utilisateur VALIDE — rafraîchi et persisté en
// base s'il était expiré. Facteur commun aux edges GA4 per-user (list/select) et
// aux chemins de fetch/cron. Les imports token-crypto sont passés en paramètres
// pour éviter un cycle d'import _shared ↔ _shared.
export async function resolveGoogleUserToken(
  supabase: any,
  userId: string,
  workspaceId: string | null,
  helpers: {
    decryptConnTokens: (conn: any) => Promise<any>;
    encryptToken: (v: string | null) => Promise<string | null>;
  },
): Promise<ResolvedGoogleToken> {
  const filterCol = workspaceId ? "workspace_id" : "user_id";
  const filterVal = workspaceId || userId;
  let cq = supabase
    .from("social_connections")
    .select("id, access_token, refresh_token, token_expires_at, platform_account_id, platform_account_name")
    .eq("platform", "google")
    .eq(filterCol, filterVal);
  if (workspaceId) cq = cq.eq("user_id", userId);
  else cq = cq.is("workspace_id", null);
  const { data: conn } = await cq.maybeSingle();
  if (!conn) return { conn: null, accessToken: null };

  await helpers.decryptConnTokens(conn);

  // Connexion Phase 1 (compte de service) : pas de jeton utilisateur à résoudre.
  if (conn.access_token === "service_account") {
    return { conn, accessToken: null, serviceAccount: true };
  }

  let accessToken: string = conn.access_token;
  const expMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  // Rafraîchit si expiré (ou expiration inconnue) et si un refresh_token existe.
  if ((!expMs || expMs <= Date.now()) && conn.refresh_token) {
    const refreshed = await refreshGoogleUserToken(conn.refresh_token);
    accessToken = refreshed.accessToken;
    const { error: persistError } = await supabase
      .from("social_connections")
      .update({
        access_token: await helpers.encryptToken(accessToken),
        token_expires_at: refreshed.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    // Non-bloquant : le jeton rafraîchi reste utilisable pour CET appel même si
    // la persistance échoue (au pire, un nouveau refresh au prochain appel).
    if (persistError) console.error("[ga4] Échec persistance jeton rafraîchi:", persistError);
  }
  return { conn, accessToken };
}

// Énumère les propriétés GA4 auxquelles le jeton donne accès, via l'Analytics
// Admin API (accountSummaries). Aplatit la hiérarchie compte → propriétés.
export async function accountSummaries(accessToken: string): Promise<Ga4Property[]> {
  const out: Ga4Property[] = [];
  let pageToken: string | undefined;
  do {
    const u = new URL(`${GA4_ADMIN_API}/accountSummaries`);
    u.searchParams.set("pageSize", "200");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`GA4 accountSummaries a échoué (${res.status}): ${json?.error?.message || "inconnu"}`);
    }
    for (const acc of (json?.accountSummaries || []) as any[]) {
      const account = String(acc?.account || "");
      const accountName = String(acc?.displayName || "Google Analytics");
      for (const prop of (acc?.propertySummaries || []) as any[]) {
        const raw = String(prop?.property || ""); // "properties/123456"
        const propertyId = raw.replace(/^properties\//, "");
        if (!propertyId) continue;
        out.push({
          propertyId,
          displayName: String(prop?.displayName || `Propriété ${propertyId}`),
          account,
          accountName,
        });
      }
    }
    pageToken = json?.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

// Appelle la GA4 Data API runReport sur une propriété donnée.
export async function runReport(
  propertyId: string,
  body: Record<string, unknown>,
  token: string,
): Promise<any> {
  const res = await fetch(`${GA4_DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GA4 runReport a échoué (${res.status}): ${json?.error?.message || "inconnu"}`);
  }
  return json;
}

// ─── Bornes du mois calendaire (premier → dernier jour, format YYYY-MM-DD) ───
function monthBounds(monthISO: string): { startDate: string; endDate: string } {
  const [y, m] = monthISO.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // dernier jour du mois
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

function toInt(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Récupère les métriques « site web » d'un MOIS CALENDAIRE pour une propriété GA4.
// `auth` choisit la source du jeton : compte de service (défaut, Phase 1) ou jeton
// utilisateur déjà résolu (Phase 2). Le reste (rapports A/B/C) est identique.
export async function fetchGa4Month(
  propertyId: string,
  monthISO: string,
  auth: Ga4Auth = { mode: "service" },
): Promise<Ga4MonthMetrics> {
  const token = auth.mode === "user" ? auth.accessToken : await getAccessToken();
  const { startDate, endDate } = monthBounds(monthISO);
  const dateRanges = [{ startDate, endDate }];

  const out: Ga4MonthMetrics = {
    ga4Users: 0,
    websiteVisitors: 0,
    trafficSearch: 0,
    trafficSocial: 0,
    trafficPinterest: 0,
    trafficInstagram: 0,
  };

  // ── Rapport A : totalUsers du mois (sans dimension) ──
  try {
    const a = await runReport(propertyId, {
      dateRanges,
      metrics: [{ name: "totalUsers" }],
    }, token);
    const val = toInt(a?.rows?.[0]?.metricValues?.[0]?.value);
    out.ga4Users = val;
    out.websiteVisitors = val; // même valeur : visiteurs = utilisateurs GA4
  } catch (e) {
    console.warn("GA4 rapport A (totalUsers) échoué:", (e as Error).message);
  }

  // ── Rapport B : sessions par canal par défaut ──
  try {
    const b = await runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
    }, token);
    for (const row of (b?.rows || []) as any[]) {
      const channel = String(row?.dimensionValues?.[0]?.value || "").toLowerCase();
      const sessions = toInt(row?.metricValues?.[0]?.value);
      if (!sessions) continue;
      // Défensif sur les variantes de libellés ("Organic Search", "Paid Search",
      // "Organic Social", "Paid Social", et variantes régionales).
      if (channel.includes("search")) {
        out.trafficSearch += sessions;
      } else if (channel.includes("social")) {
        out.trafficSocial += sessions;
      }
    }
  } catch (e) {
    console.warn("GA4 rapport B (canaux) échoué:", (e as Error).message);
  }

  // ── Rapport C : sessions par source (Pinterest / Instagram) ──
  try {
    const c = await runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }],
    }, token);
    for (const row of (c?.rows || []) as any[]) {
      const source = String(row?.dimensionValues?.[0]?.value || "").toLowerCase();
      const sessions = toInt(row?.metricValues?.[0]?.value);
      if (!sessions) continue;
      if (source.includes("pinterest")) {
        out.trafficPinterest += sessions;
      } else if (
        // "instagram" couvre déjà "l.instagram.com" ; "ig" seul est l'abréviation
        // fréquente de la source Instagram (on évite includes("ig") qui matcherait
        // "digital", "signal"…).
        source.includes("instagram") ||
        source === "ig"
      ) {
        out.trafficInstagram += sessions;
      }
    }
  } catch (e) {
    console.warn("GA4 rapport C (sources) échoué:", (e as Error).message);
  }

  return out;
}
