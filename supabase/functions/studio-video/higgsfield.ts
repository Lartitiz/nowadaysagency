// Server-only Seedance 2.5 adapter. No generation POST is retried here.
export const MODELS = {
  image: "bytedance/seedance-2.5/image-to-video",
  text: "bytedance/seedance-2.5/text-to-video",
  references: "bytedance/seedance-2.5/reference-to-video",
} as const;
export const MODEL = MODELS.image;
const BASE = "https://api.higgsfield.ai";
export type VideoInput = ({ image_url: string; image_urls?: never; aspect_ratio?: never } |
  { image_urls: string[]; image_url?: never; aspect_ratio: "9:16" | "16:9" | "1:1" } |
  { image_url?: never; image_urls?: never; aspect_ratio: "9:16" | "16:9" | "1:1" }) & {
  prompt: string;
  duration: number;
  resolution: "480p" | "720p";
  output_format: "mp4";
  generate_audio: false;
};
export type VideoModel = typeof MODELS[keyof typeof MODELS];
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

// Approximate credits per USD, from the documented example (1.5 credits = $0.094).
const CREDITS_PER_USD = 16;

// Some models (Seedance 2.5) answer with a textual rate instead of numbers:
// {"type":"description","pricing_description":"... roughly $0.2056 per second ... at 480p, $0.4622 at 720p ..."}
export function priceFromDescription(text: unknown, input: VideoInput) {
  if (typeof text !== "string") return null;
  const perSecond = text.match(/\$([\d.]+) per second of generated video at 480p,\s*\$([\d.]+) at 720p/i);
  if (!perSecond) return null;
  const rate = Number(input.resolution === "720p" ? perSecond[2] : perSecond[1]);
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(input.duration) || input.duration <= 0) return null;
  // 10% safety margin, rounded up to the cent: the quote must never be lower than the real cost.
  const usd = Math.ceil(rate * input.duration * 1.1 * 100) / 100;
  return { usd, credits: Math.ceil(usd * CREDITS_PER_USD * 1000) / 1000 };
}

export async function estimate(input: VideoInput, fetcher = fetch, model: VideoModel = MODEL) {
  const { data } = await api(`estimate/${model}`, "POST", input, fetcher);
  if (data?.type === "description") {
    const derived = priceFromDescription(data.pricing_description, input);
    if (!derived) throw new Error("higgsfield_estimate_invalid");
    return derived;
  }
  const usd = Number(data.usd), credits = Number(data.credits);
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(credits) || credits <= 0)
    throw new Error("higgsfield_estimate_invalid");
  return { usd, credits };
}

export async function submit(input: VideoInput, webhookUrl?: string, fetcher = fetch, model: VideoModel = MODEL) {
  const endpoint = webhookUrl ? `${model}?hf_webhook=${encodeURIComponent(webhookUrl)}` : model;
  const { data, correlationId } = await api(endpoint, "POST", input, fetcher);
  // Only the request ID matters: status is always read from our own
  // authenticated endpoint. The provider's status_url format may vary.
  if (typeof data?.request_id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.request_id))
    throw new Error("higgsfield_submit_response_uncertain");
  return { requestId: data.request_id as string, statusUrl: `${BASE}/requests/${data.request_id}/status`, correlationId };
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
