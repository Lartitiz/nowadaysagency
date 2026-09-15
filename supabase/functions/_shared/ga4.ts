// Lecture des statistiques Google Analytics 4 (GA4 Data API v1beta) pour pré-remplir
// les colonnes « site web » de monthly_stats avec des données RÉELLES au lieu de la
// saisie manuelle. Miroir de _shared/instagram-insights.ts.
//
// Phase 1 : authentification par COMPTE DE SERVICE (service account) Google. On
// signe un JWT RS256 avec la clé privée du compte de service (secrets d'env
// GOOGLE_SA_CLIENT_EMAIL + GOOGLE_SA_PRIVATE_KEY), on l'échange contre un
// access_token OAuth, puis on interroge une seule propriété GA4.
//
// Un rapport échoué/absent reste null ; zéro exige une réponse GA4 valide.
// Le module reste sans dépendance externe (WebCrypto natif Deno).

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export interface Ga4MonthMetrics {
  ga4Users: number | null;
  websiteVisitors: number | null;
  trafficSearch: number | null;
  trafficSocial: number | null;
  trafficPinterest: number | null;
  trafficInstagram: number | null;
  observation: { fetchedAt: string; startDate: string; endDate: string; timeZone: string | null; periodState: "partial" | "complete"; reportState: "partial" | "complete"; unavailable: string[] };
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
  if (workspaceId) {
    const { data: member, error } = await supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (error || !member) throw new Error("Accès à cet espace refusé.");
  }
  const { data: conn, error: connError } = await cq.maybeSingle();
  if (connError) throw connError;
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

// Require valid headers, complete rows and unrestricted data before deriving zeros.
// https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/RunReportResponse
function reportRows(report: any, dimension: string | null, metric: string): any[] {
  if (report?.metricHeaders?.[0]?.name !== metric ||
      (dimension && report?.dimensionHeaders?.[0]?.name !== dimension)) throw new Error("Rapport GA4 incomplet");
  const rows = report.rows ?? [];
  if (!Array.isArray(rows) || (report.rowCount ?? rows.length) !== rows.length ||
      report.metadata?.subjectToThresholding || report.metadata?.dataLossFromOtherRow ||
      report.metadata?.samplingMetadatas?.length || report.metadata?.schemaRestrictionResponse?.activeMetricRestrictions?.length) {
    throw new Error("Rapport GA4 incomplet ou restreint");
  }
  for (const row of rows) {
    const raw = row?.metricValues?.[0]?.value;
    if (typeof raw !== "string" || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) ||
        (dimension && typeof row?.dimensionValues?.[0]?.value !== "string")) throw new Error("Mesure GA4 absente");
  }
  return rows;
}

export async function fetchGa4Month(
  propertyId: string, monthISO: string, auth: Ga4Auth = { mode: "service" },
): Promise<Ga4MonthMetrics> {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(monthISO)) throw new Error("Mois invalide");
  const token = auth.mode === "user" ? auth.accessToken : await getAccessToken();
  const { startDate, endDate } = monthBounds(monthISO);
  const fetchedAt = new Date().toISOString();
  const observation: Ga4MonthMetrics["observation"] = {
    fetchedAt, startDate, endDate, timeZone: null, periodState: "partial", reportState: "complete", unavailable: [],
  };
  const out: Ga4MonthMetrics = { ga4Users: null, websiteVisitors: null, trafficSearch: null,
    trafficSocial: null, trafficPinterest: null, trafficInstagram: null, observation };
  const reports = [
    { dimension: null, metric: "totalUsers", fields: ["ga4Users", "websiteVisitors"] },
    { dimension: "sessionDefaultChannelGroup", metric: "sessions", fields: ["trafficSearch", "trafficSocial"] },
    { dimension: "sessionSource", metric: "sessions", fields: ["trafficPinterest", "trafficInstagram"] },
  ] as const;
  for (const spec of reports) {
    try {
      const report = await runReport(propertyId, {
        dateRanges: [{ startDate, endDate }], metrics: [{ name: spec.metric }],
        ...(spec.dimension ? { dimensions: [{ name: spec.dimension }] } : {}), limit: 250000,
      }, token);
      const rows = reportRows(report, spec.dimension, spec.metric);
      const zone = report.metadata?.timeZone;
      if (typeof zone !== "string" || !zone) throw new Error("Fuseau GA4 absent");
      if (observation.timeZone && observation.timeZone !== zone) throw new Error("Fuseaux GA4 incohérents");
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(fetchedAt));
      const date = ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
      if (startDate > date) throw new Error("Mois dans le futur");
      observation.timeZone = zone;
      observation.endDate = date < endDate ? date : endDate;
      observation.periodState = date > endDate ? "complete" : "partial";
      let first = 0, second = 0;
      if (!spec.dimension) {
        if (rows.length > 1) throw new Error("Total GA4 ambigu");
        first = second = rows.length ? Number(rows[0].metricValues[0].value) : 0;
      } else for (const row of rows) {
        const label = row.dimensionValues[0].value.toLowerCase();
        const value = Number(row.metricValues[0].value);
        if (spec.dimension === "sessionDefaultChannelGroup") {
          if (label.includes("search")) first += value;
          else if (label.includes("social")) second += value;
        } else {
          if (label.includes("pinterest")) first += value;
          else if (label.includes("instagram") || label === "ig") second += value;
        }
      }
      out[spec.fields[0]] = first; out[spec.fields[1]] = second;
    } catch (e) {
      console.warn("GA4 rapport indisponible:", spec.metric, spec.dimension, (e as Error).message);
      observation.unavailable.push(...spec.fields);
      observation.reportState = "partial";
    }
  }
  if (observation.unavailable.length === 6) throw new Error("Aucun rapport GA4 exploitable. Réessaie plus tard.");
  return out;
}
