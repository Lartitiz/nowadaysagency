// Server-only Seedance 2.5 adapter. No generation POST is retried here.
export const MODEL = "bytedance/seedance-2.5/image-to-video";
const BASE = "https://api.higgsfield.ai";
export type VideoInput = {
  image_url: string;
  prompt: string;
  duration: number;
  resolution: "480p" | "720p";
  output_format: "mp4";
  generate_audio: false;
};
export type ProviderState = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";
export type ProviderResult = {
  request_id: string;
  status: ProviderState;
  status_url?: string;
  error?: string | null;
  video?: { url: string };
};

export class ProviderError extends Error {
  constructor(public status: number, public correlationId: string | null) {
    super(`higgsfield_http_${status}`);
  }
}

export function credentials() {
  const value = Deno.env.get("HIGGSFIELD_API_KEY");
  if (!value || !/^[^:\s]+:[^:\s]+$/.test(value)) throw new Error("higgsfield_not_configured");
  return `Key ${value}`;
}

async function api(path: string, method: "GET" | "POST", body?: unknown, fetcher = fetch) {
  const response = await fetcher(`${BASE}/${path}`, {
    method,
    headers: { Authorization: credentials(), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(method === "GET" ? 20_000 : 35_000),
  });
  const correlationId = response.headers.get("x-correlation-id");
  if (!response.ok) throw new ProviderError(response.status, correlationId);
  return { data: await response.json(), correlationId };
}

export function publicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password &&
      host !== "localhost" && !host.endsWith(".localhost") && !host.endsWith(".local") &&
      !host.endsWith(".internal") && !/^\d+\.\d+\.\d+\.\d+$/.test(host) &&
      !host.includes(":");
  } catch { return false; }
}

export async function uploadImage(blob: Blob, fetcher = fetch) {
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 15_000_000 || blob.size < 32)
    throw new Error("studio_video_image_invalid");
  const { data } = await api("files/generate-upload-url", "POST", { content_type: blob.type }, fetcher);
  if (!publicHttpsUrl(data.upload_url) || !publicHttpsUrl(data.public_url) ||
    !data.upload_headers || typeof data.upload_headers !== "object")
    throw new Error("higgsfield_upload_response_invalid");
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(data.upload_headers)) {
    if (typeof value !== "string" || !/^[a-z0-9-]+$/i.test(key)) throw new Error("higgsfield_upload_headers_invalid");
    headers[key] = value;
  }
  const response = await fetcher(data.upload_url, {
    method: "PUT", headers, body: blob, redirect: "error", signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new ProviderError(response.status, null);
  return data.public_url as string;
}

export async function estimate(input: VideoInput, fetcher = fetch) {
  const { data } = await api(`estimate/${MODEL}`, "POST", input, fetcher);
  const usd = Number(data.usd), credits = Number(data.credits);
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(credits) || credits <= 0)
    throw new Error("higgsfield_estimate_invalid");
  return { usd, credits };
}

export async function submit(input: VideoInput, webhookUrl?: string, fetcher = fetch) {
  const endpoint = webhookUrl ? `${MODEL}?hf_webhook=${encodeURIComponent(webhookUrl)}` : MODEL;
  const { data, correlationId } = await api(endpoint, "POST", input, fetcher);
  if (typeof data.request_id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.request_id) ||
    typeof data.status_url !== "string" ||
    data.status_url !== `${BASE}/requests/${data.request_id}/status`)
    throw new Error("higgsfield_submit_response_uncertain");
  return { requestId: data.request_id as string, statusUrl: data.status_url as string, correlationId };
}

export async function status(requestId: string, fetcher = fetch): Promise<ProviderResult> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("higgsfield_request_id_invalid");
  const { data } = await api(`requests/${requestId}/status`, "GET", undefined, fetcher);
  if (data.request_id !== requestId || !["queued", "in_progress", "completed", "failed", "nsfw", "canceled"].includes(data.status))
    throw new Error("higgsfield_status_invalid");
  if (data.status === "completed" && !publicHttpsUrl(data.video?.url))
    throw new Error("higgsfield_video_url_invalid");
  return data as ProviderResult;
}
