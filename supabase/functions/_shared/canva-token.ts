// Rafraîchissement du jeton Canva (rotation du refresh_token à chaque usage).
// Partagé par social-canva-import (qui s'en sert) et social-status (qui dit à la
// page Connexions si la connexion marche encore).
import { encryptToken } from "./token-crypto.ts";
import { isDefinitiveRefusal, type RefreshOutcome } from "./oauth-refresh.ts";

const CANVA_API = "https://api.canva.com/rest/v1";
// Le jeton d'accès Canva est court (~4 h). On rafraîchit s'il expire dans < 10 min.
const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Jeton d'accès Canva utilisable, ou null si Canva refuse le renouvellement
 * (refresh token expiré/révoqué : le jeton actuel est mort aussi, inutile de
 * partir dans un export de 2 min qui finira en erreur).
 */
export async function refreshCanvaTokenIfNeeded(supabase: any, conn: any): Promise<string | null> {
  const out = await refreshCanvaToken(supabase, conn);
  if (out.state === "dead") return null;
  return out.token;
}

export async function refreshCanvaToken(
  supabase: any,
  conn: any,
  opts: { signal?: AbortSignal } = {},
): Promise<RefreshOutcome> {
  const expiresAtMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expiresAtMs - Date.now() > REFRESH_THRESHOLD_MS) return { state: "fresh", token: conn.access_token };
  if (!conn.refresh_token) return { state: "unknown", token: conn.access_token }; // pas de refresh dispo : on tente l'actuel

  const clientId = Deno.env.get("CANVA_CLIENT_ID")!;
  const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET")!;
  const basic = btoa(`${clientId}:${clientSecret}`);
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", conn.refresh_token);
  let res: Response;
  try {
    res = await fetch(`${CANVA_API}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: form.toString(),
      signal: opts.signal,
    });
  } catch (e) {
    console.warn("Canva refresh unreachable:", e);
    return { state: "unknown", token: conn.access_token };
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    console.warn("Canva refresh failed:", j);
    return isDefinitiveRefusal(res.status, j) ? { state: "dead" } : { state: "unknown", token: conn.access_token };
  }

  const newExpires = new Date(Date.now() + Number(j.expires_in || 4 * 3600) * 1000).toISOString();
  const { error: persistError } = await supabase
    .from("social_connections")
    .update({
      access_token: await encryptToken(j.access_token),
      refresh_token: await encryptToken(j.refresh_token || conn.refresh_token),
      token_expires_at: newExpires,
    })
    .eq("id", conn.id);
  // Non-bloquant : le jeton rafraîchi reste utilisable pour CET appel même si
  // la persistance échoue (au pire, un nouveau refresh au prochain appel).
  if (persistError) console.error("[canva-token] Échec persistance jeton rafraîchi:", persistError);
  return { state: "refreshed", token: j.access_token as string, expiresAt: newExpires };
}
