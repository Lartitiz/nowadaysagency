// Rafraîchissement PROACTIF des jetons Instagram (Instagram Business Login,
// graph.instagram.com). Un jeton longue durée vaut 60 jours et se prolonge via
// refresh_access_token tant qu'il n'est pas expiré. Jusqu'ici il n'était
// rafraîchi qu'au moment d'un appel (publication, stats, scan photos) : une
// cliente qui ne publie pas pendant la dernière semaine voyait son jeton
// expirer, et ses publications programmées suivantes échouaient.
//
// Appelé par social-publish-scheduled (cron pg toutes les 5 min), limité à un
// passage par heure. Best-effort : ne lève jamais, un échec est journalisé et
// retenté l'heure suivante.
import { refreshTokenIfNeeded } from "./instagram-graph.ts";
import { decryptConnTokens } from "./token-crypto.ts";

const DAY_MS = 24 * 3600 * 1000;
export const SWEEP_THRESHOLD_MS = 10 * DAY_MS;

export interface SweepResult {
  checked: number;
  refreshed: number;
  failed: { id: string; account: string | null }[];
}

// Un passage par heure suffit (les 5 premières minutes de chaque heure UTC,
// soit un seul tick du cron */5) : évite de marteler l'API si un refresh échoue.
export function isSweepTick(now: Date = new Date()): boolean {
  return now.getUTCMinutes() < 5;
}

export async function refreshExpiringInstagramTokens(
  supabase: any,
  now: number = Date.now(),
): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, refreshed: 0, failed: [] };
  try {
    const { data, error } = await supabase
      .from("social_connections")
      .select("id, platform, platform_account_name, access_token, token_expires_at")
      .eq("platform", "instagram")
      .not("token_expires_at", "is", null)
      // Déjà expiré = plus rafraîchissable : la cliente doit se reconnecter.
      .gt("token_expires_at", new Date(now).toISOString())
      .lte("token_expires_at", new Date(now + SWEEP_THRESHOLD_MS).toISOString())
      .limit(50);
    if (error) {
      console.error("[instagram-token-sweep] lecture des connexions impossible:", error);
      return result;
    }
    for (const conn of data || []) {
      result.checked++;
      try {
        await decryptConnTokens(conn);
        const before = conn.access_token;
        const after = await refreshTokenIfNeeded(supabase, conn, SWEEP_THRESHOLD_MS);
        if (after && after !== before) {
          result.refreshed++;
        } else {
          result.failed.push({ id: conn.id, account: conn.platform_account_name ?? null });
          console.error(
            `[instagram-token-sweep] refresh refusé pour ${conn.platform_account_name ?? conn.id} (expire ${conn.token_expires_at})`,
          );
        }
      } catch (e) {
        result.failed.push({ id: conn.id, account: conn.platform_account_name ?? null });
        console.error(`[instagram-token-sweep] erreur pour ${conn.platform_account_name ?? conn.id}:`, e);
      }
    }
  } catch (e) {
    console.error("[instagram-token-sweep] erreur inattendue:", e);
  }
  if (result.checked) console.log("[instagram-token-sweep]", JSON.stringify(result));
  return result;
}
