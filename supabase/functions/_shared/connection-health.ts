// La connexion marche-t-elle encore ? Utilisé par social-status quand la page
// Connexions le demande (verify: true).
//
// Pinterest, Canva et Google renouvellent leur jeton d'accès au moment où on s'en
// sert : la date d'expiration en base est celle du dernier usage. Le 23/10/2026,
// les trois connexions de Laetitia affichaient « Connecté · expire le 14/08 »
// alors que les trois plateformes refusaient le renouvellement. Seule une vraie
// tentative de renouvellement le dit ; on la fait ici (et on garde le jeton neuf).
//
// Instagram et LinkedIn ne sont pas concernés : leur date d'expiration en base
// est la vraie (la page les signale déjà).
import { decryptConnTokens, encryptToken } from "./token-crypto.ts";
import { isDefinitiveRefusal, type RefreshOutcome } from "./oauth-refresh.ts";
import { refreshPinterestToken } from "./pinterest-graph.ts";
import { refreshCanvaToken } from "./canva-token.ts";
import { refreshGoogleUserToken } from "./ga4.ts";

export type ConnectionHealth = "ok" | "dead" | "unknown";

/** Plateformes dont la date en base ne dit rien : il faut essayer de renouveler. */
export const SELF_RENEWING_PLATFORMS = new Set(["pinterest", "canva", "google"]);

// La page attend la réponse : au-delà, on ne sait pas (pas d'alarme).
const PROBE_TIMEOUT_MS = 6000;

async function refreshGoogle(supabase: any, conn: any, signal: AbortSignal): Promise<RefreshOutcome> {
  // Connexion « compte de service » (Phase 1) : pas de jeton utilisateur.
  if (conn.access_token === "service_account") return { state: "fresh", token: conn.access_token };
  const expMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expMs && expMs > Date.now()) return { state: "fresh", token: conn.access_token };
  if (!conn.refresh_token) return { state: "unknown", token: conn.access_token };
  try {
    const refreshed = await refreshGoogleUserToken(conn.refresh_token, { signal });
    const { error } = await supabase
      .from("social_connections")
      .update({
        access_token: await encryptToken(refreshed.accessToken),
        token_expires_at: refreshed.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    if (error) console.error("[connection-health] Échec persistance jeton Google:", error);
    return { state: "refreshed", token: refreshed.accessToken, expiresAt: refreshed.expiresAt };
  } catch (e: any) {
    if (typeof e?.status === "number" && isDefinitiveRefusal(e.status, e.body)) return { state: "dead" };
    return { state: "unknown", token: conn.access_token };
  }
}

/**
 * Essaie de renouveler le jeton d'une connexion Pinterest / Canva / Google
 * (ligne complète de social_connections, jetons chiffrés). Ne lève jamais.
 * Renvoie aussi la nouvelle date d'expiration quand le renouvellement a marché.
 */
export async function checkConnectionHealth(
  supabase: any,
  row: any,
): Promise<{ health: ConnectionHealth; expiresAt?: string }> {
  if (!SELF_RENEWING_PLATFORMS.has(row?.platform)) return { health: "unknown" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const conn = { ...row };
    await decryptConnTokens(conn);
    const opts = { signal: controller.signal };
    const out = row.platform === "pinterest"
      ? await refreshPinterestToken(supabase, conn, opts)
      : row.platform === "canva"
      ? await refreshCanvaToken(supabase, conn, opts)
      : await refreshGoogle(supabase, conn, controller.signal);
    if (out.state === "dead") return { health: "dead" };
    if (out.state === "refreshed") return { health: "ok", expiresAt: out.expiresAt };
    return { health: out.state === "fresh" ? "ok" : "unknown" };
  } catch (e) {
    console.warn("[connection-health] vérification impossible:", row?.platform, e);
    return { health: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}
