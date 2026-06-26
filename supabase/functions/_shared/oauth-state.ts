// Shared HMAC signing for OAuth `state` parameter.
// The state travels through the browser back to our callback (no JWT there),
// so we sign it to know who initiated the flow.

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signState(payload: Record<string, unknown>, secret: string): Promise<string> {
  const data = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${b64urlEncode(sig)}`;
}

// ── PKCE (requis par Canva Connect, code_challenge_method=S256) ──
// Le code_verifier doit revenir au callback. On le glisse dans le `state` signé
// (HMAC, anti-falsification, TTL 10 min). Acceptable ici car le client est
// confidentiel (client_secret requis pour l'échange) : le verifier seul ne suffit pas.
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes); // 43 caractères base64url
}

export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(verifier)),
  );
  return b64urlEncode(digest);
}

export async function verifyState<T = Record<string, unknown>>(
  state: string,
  secret: string,
  maxAgeMs = 10 * 60 * 1000,
): Promise<T | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const key = await importKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), enc.encode(data));
  if (!ok) return null;
  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(data)));
  } catch {
    return null;
  }
  if (typeof payload?.ts === "number" && Date.now() - payload.ts > maxAgeMs) return null;
  return payload as T;
}
