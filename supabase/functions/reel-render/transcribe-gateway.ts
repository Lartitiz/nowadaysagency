/**
 * Écoute de la voix d'un reel parlé par le relais Google Cloud (`/transcribe`,
 * service Whisper `reel-transcribe`). Rend, pour chaque piste, le moment de
 * chaque mot ; null si l'écoute échoue : index.ts repasse alors par JSON2Video
 * (qui sous-titre lui-même), aucune cliente ne reste sans reel.
 */

import { HYPERFRAMES_GATEWAY_URL } from "./hyperframes-gateway.ts";
import type { CaptionWord, VoiceTrack } from "./captions.ts";

type FetchLike = typeof fetch;

export async function transcribeVoiceTracks(
  tracks: VoiceTrack[],
  authorization: string | null,
  fetcher: FetchLike = fetch,
): Promise<CaptionWord[][] | null> {
  if (!authorization || tracks.length === 0) return null;
  try {
    const res = await fetcher(`${HYPERFRAMES_GATEWAY_URL}/transcribe`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ items: tracks.map(({ url, seek, duration }) => ({ url, seek, duration })) }),
      // Machine froide (~20 s) + écoute d'un reel d'une minute (~10 s) : large marge.
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data?.items) || data.items.length !== tracks.length) {
      console.error(JSON.stringify({ event: "reel_transcribe_unavailable", status: res.status, error: data?.error ?? null }));
      return null;
    }
    const words = data.items.map((item: { words?: unknown }) => (Array.isArray(item?.words) ? (item.words as CaptionWord[]) : []));
    // Une voix où rien n'a été entendu n'a pas de sous-titres utiles : JSON2Video prend le relais.
    return words.some((w: CaptionWord[]) => w.length > 0) ? words : null;
  } catch (e) {
    console.error(JSON.stringify({ event: "reel_transcribe_unavailable", message: String(e).slice(0, 200) }));
    return null;
  }
}
