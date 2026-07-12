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
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export interface Ga4MonthMetrics {
  ga4Users: number;
  websiteVisitors: number;
  trafficSearch: number;
  trafficSocial: number;
  trafficPinterest: number;
  trafficInstagram: number;
}

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
export async function fetchGa4Month(propertyId: string, monthISO: string): Promise<Ga4MonthMetrics> {
  const token = await getAccessToken();
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
