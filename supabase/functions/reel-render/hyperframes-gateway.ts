/**
 * Appels au relais de rendu HyperFrames (Google Cloud Run, projet
 * nowadays-reels-1113 ; code : services/reel-render-gateway/).
 *
 * Aucun secret : le relais vérifie lui-même le jeton de session de la cliente
 * auprès de Supabase. On lui transmet donc l'en-tête Authorization reçu.
 *
 * Un échec au LANCEMENT n'est jamais bloquant : index.ts repasse alors par
 * JSON2Video, pour qu'aucune cliente ne reste sans reel.
 */

/** Interrupteur : false = tout repasse par JSON2Video, sans autre changement. */
export const HYPERFRAMES_ENABLED = true;

export const HYPERFRAMES_GATEWAY_URL = "https://reel-render-gateway-506640252167.europe-west1.run.app";

/** Préfixe des identifiants de rendu HyperFrames (ceux de JSON2Video n'en ont pas). */
const PROJECT_PREFIX = "hf:";

export function isHyperframesProject(project: string): boolean {
  return project.startsWith(PROJECT_PREFIX);
}

type FetchLike = typeof fetch;

export async function submitHyperframes(
  composition: { html: string; duration: number },
  authorization: string | null,
  fetcher: FetchLike = fetch,
): Promise<{ ok: true; project: string } | { ok: false; reason: string }> {
  if (!authorization) return { ok: false, reason: "no_auth" };
  try {
    const res = await fetcher(`${HYPERFRAMES_GATEWAY_URL}/render`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify(composition),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data?.id !== "string") return { ok: false, reason: `http_${res.status}:${data?.error ?? ""}` };
    return { ok: true, project: PROJECT_PREFIX + data.id };
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 200) };
  }
}

export interface GatewayStatus {
  status: "running" | "done" | "error" | "unknown";
  url: string | null;
  message: string;
  duration: number | null;
}

export async function hyperframesStatus(
  project: string,
  authorization: string | null,
  fetcher: FetchLike = fetch,
): Promise<GatewayStatus> {
  const id = project.slice(PROJECT_PREFIX.length);
  try {
    const res = await fetcher(`${HYPERFRAMES_GATEWAY_URL}/status?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: authorization ?? "" },
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Avancement illisible un instant : l'écran réinterroge, ce n'est pas un échec du montage.
      return { status: "running", url: null, message: "", duration: null };
    }
    if (data?.status === "done" && typeof data.url === "string") {
      return { status: "done", url: data.url, message: "", duration: null };
    }
    if (data?.status === "error") {
      return { status: "error", url: null, message: String(data.message ?? "Le montage a échoué."), duration: null };
    }
    return { status: "running", url: null, message: "", duration: null };
  } catch {
    return { status: "running", url: null, message: "", duration: null };
  }
}
