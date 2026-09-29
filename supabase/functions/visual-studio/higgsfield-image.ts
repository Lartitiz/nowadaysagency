import { getServiceClient } from "../_shared/plan-limiter.ts";
import { imagePrompt, type Proposal } from "./media.ts";
type DB = ReturnType<typeof getServiceClient>;
const BASE = "https://api.higgsfield.ai";
export const IMAGE_MODELS = [
  "higgsfield-ai/soul/v2/standard",
  "marketing-studio/image/flare",
  "marketing-studio/image/sunburst",
] as const;
export const SOUL2_MODEL = "higgsfield-ai/soul/v2/standard";
export function soul2Eligible(proposal: Proposal) {
  return proposal.operation === "create" && proposal.visual_kind === "photo" &&
    !proposal.exact_text?.length && !proposal.references?.length &&
    !proposal.input_path && !proposal.composition;
}
export function higgsfieldImagesEnabled() {
  return Deno.env.get("HIGGSFIELD_IMAGE_ENABLED") === "true" &&
    Deno.env.get("HIGGSFIELD_DATA_USE_REVIEWED") === "true";
}
export function soul2Enabled() {
  return Deno.env.get("HIGGSFIELD_SOUL2_ENABLED") === "true" &&
    Deno.env.get("HIGGSFIELD_DATA_USE_REVIEWED") === "true";
}
function credentials() {
  const value = Deno.env.get("HIGGSFIELD_API_KEY");
  if (!value || !/^[^:\s]+:[^:\s]+$/.test(value)) {
    throw new Error("studio_provider_unavailable");
  }
  return `Key ${value}`;
}
function publicUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && !u.hostname.includes(":") &&
      !/(^localhost$|\.localhost$|\.local$|\.internal$)/.test(u.hostname);
  } catch {
    return false;
  }
}
class ProviderHttpError extends Error {
  constructor(public status: number) {
    super(`higgsfield_http_${status}`);
  }
}
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${BASE}/${path}`, {
    method,
    headers: {
      Authorization: credentials(),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw new ProviderHttpError(response.status);
  return await response.json();
}
export function imageInput(proposal: Proposal, urls: string[]) {
  if (!IMAGE_MODELS.some((model) => model === proposal.model)) {
    throw new Error("studio_provider_model");
  }
  if (proposal.model === SOUL2_MODEL) {
    if (urls.length || !soul2Eligible(proposal)) {
      throw new Error("studio_provider_model");
    }
    return {
      prompt: imagePrompt(proposal),
      batch_size: 1,
      resolution: "1080p",
      aspect_ratio: proposal.format === "portrait"
        ? "2:3"
        : proposal.format === "landscape"
        ? "3:2"
        : "1:1",
      enhance_prompt: false,
      image_urls: undefined,
    };
  }
  return {
    prompt: imagePrompt(proposal),
    quality: "high",
    resolution: "2k",
    aspect_ratio: proposal.format === "portrait"
      ? "2:3"
      : proposal.format === "landscape"
      ? "3:2"
      : "1:1",
    enhance_prompt: false,
    moderation: "auto",
    ...(urls.length ? { image_urls: urls } : {}),
  };
}
async function upload(blob: Blob) {
  const data = await api("files/generate-upload-url", "POST", {
    content_type: blob.type,
  });
  if (
    !publicUrl(data.upload_url) || !publicUrl(data.public_url) ||
    !data.upload_headers || typeof data.upload_headers !== "object"
  ) throw new Error("studio_provider_upload");
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(data.upload_headers)) {
    if (
      typeof value !== "string" || !/^[a-z0-9-]+$/i.test(key) ||
      /authorization|cookie|proxy/i.test(key)
    ) throw new Error("studio_provider_upload");
    headers[key] = value;
  }
  const response = await fetch(data.upload_url, {
    method: "PUT",
    headers,
    body: blob,
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error("studio_provider_upload");
  return data.public_url;
}
export async function failHiggsfieldImage(db: DB, versionId: string) {
  const result = await db.from("visual_studio_versions").update({
    status: "failed",
    error_message: "La création a échoué. Aucune image décomptée.",
    completed_at: new Date().toISOString(),
  }).eq("id", versionId).eq("status", "processing");
  if (result.error) throw result.error;
  const request = await db.from("studio_image_requests").update({
    status: "failed",
  }).eq("version_id", versionId);
  if (request.error) throw request.error;
}
/** Polling and callbacks only recover an existing request; never submit a second generation. */
export async function reconcileHiggsfieldImage(
  db: DB,
  versionId: string,
  callbackId?: string,
) {
  const { data: job, error } = await db.from("studio_image_requests").select(
    "*",
  ).eq("version_id", versionId).maybeSingle();
  if (error) throw error;
  if (!job || ["completed", "failed"].includes(job.status)) return;
  const requestId = job.provider_id || callbackId;
  if (!requestId) return; // Lost submit response: callback or manual reconciliation, not a paid retry.
  if (
    !/^[0-9a-f-]{36}$/i.test(requestId) ||
    (job.provider_id && callbackId && job.provider_id !== callbackId)
  ) throw new Error("studio_provider_receipt");
  const result = await api(`requests/${requestId}/status`);
  if (
    result.request_id !== requestId ||
    !["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]
      .includes(result.status)
  ) throw new Error("studio_provider_receipt");
  const saved = await db.from("studio_image_requests").update({
    provider_id: requestId,
    status: ["failed", "nsfw", "canceled"].includes(result.status)
      ? "in_progress"
      : result.status === "completed"
      ? "in_progress"
      : result.status,
  }).eq("version_id", versionId).in("status", [
    "preparing",
    "submitting",
    "uncertain",
    "queued",
    "in_progress",
  ]);
  if (saved.error) throw saved.error;
  if (["failed", "nsfw", "canceled"].includes(result.status)) {
    await failHiggsfieldImage(db, versionId);
    return;
  }
  if (result.status !== "completed") return;
  const { data: version, error: ve } = await db.from("visual_studio_versions")
    .select("result_path,status").eq("id", versionId).single();
  if (ve || !version) throw ve || new Error("studio_missing");
  if (version.status === "processing") {
    const stored = await db.storage.from("visual-studio").info(
      version.result_path,
    );
    if (stored.error) {
      const url = result.images?.[0]?.url;
      if (!publicUrl(url)) throw new Error("studio_provider_output");
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      });
      if (
        !response.ok ||
        Number(response.headers.get("content-length")) > 15_000_000
      ) throw new Error("studio_provider_output");
      const blob = await response.blob();
      if (
        !/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 15_000_000 ||
        !blob.size
      ) throw new Error("studio_provider_output");
      const uploaded = await db.storage.from("visual-studio").upload(
        version.result_path,
        blob,
        { contentType: blob.type, upsert: true },
      );
      if (uploaded.error) throw uploaded.error;
    }
    const complete = await db.rpc("studio_complete_generation", {
      p_version: versionId,
    });
    if (complete.error) throw complete.error;
  }
  const done = await db.from("studio_image_requests").update({
    status: "completed",
  }).eq("version_id", versionId);
  if (done.error) throw done.error;
}
export async function submitHiggsfieldImage(
  db: DB,
  version: { id: string; workspace_id: string; proposal: Proposal },
  inputs: Blob[],
) {
  let submitted = false, accepted = false;
  try {
    if (version.proposal.model === SOUL2_MODEL
      ? !soul2Enabled()
      : !higgsfieldImagesEnabled()) {
      throw new Error("studio_provider_unavailable");
    }
    if (version.proposal.model === SOUL2_MODEL &&
      (inputs.length || !soul2Eligible(version.proposal))) {
      throw new Error("studio_provider_model");
    }
    credentials();
    const monthly = Number(Deno.env.get("HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD"));
    if (!Number.isFinite(monthly) || monthly <= 0) {
      throw new Error("studio_provider_budget");
    }
    const inserted = await db.from("studio_image_requests").insert({
      version_id: version.id,
      workspace_id: version.workspace_id,
    }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code === "23505") return;
      throw inserted.error;
    }
    const urls = await Promise.all(inputs.map(upload));
    const input = imageInput(version.proposal, urls);
    const quote = await api(
      `estimate/${version.proposal.model}`,
      "POST",
      input,
    );
    const estimate = Number(quote.usd);
    if (!Number.isFinite(estimate) || estimate <= 0 || estimate > 2) {
      throw new Error("studio_provider_budget");
    }
    const reserved = await db.rpc("studio_reserve_image_cost", {
      p_version: version.id,
      p_estimate: estimate,
      p_monthly_limit: monthly,
    });
    if (reserved.error) throw reserved.error;
    if (!reserved.data) return;
    const callback = `${
      Deno.env.get("SUPABASE_URL")
    }/functions/v1/visual-studio?image_callback=${version.id}&token=${inserted.data.callback_token}`;
    submitted = true;
    const result = await api(
      `${version.proposal.model}?hf_webhook=${encodeURIComponent(callback)}`,
      "POST",
      input,
    );
    if (
      typeof result.request_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(result.request_id)
    ) throw new Error("studio_provider_receipt");
    accepted = true;
    const saved = await db.from("studio_image_requests").update({
      provider_id: result.request_id,
      status: "queued",
    }).eq("version_id", version.id).in("status", ["submitting", "uncertain"]);
    if (saved.error) throw saved.error;
    await reconcileHiggsfieldImage(db, version.id);
  } catch (error) {
    if (
      !submitted ||
      (!accepted && error instanceof ProviderHttpError &&
        [400, 401, 402, 403, 404, 422, 429].includes(error.status))
    ) await failHiggsfieldImage(db, version.id);
    else {
      const uncertain = await db.from("studio_image_requests").update({ status: "uncertain" })
        .eq("version_id", version.id).in("status", ["submitting", "queued"]);
      if (uncertain.error) throw uncertain.error;
    }
    console.error(
      "[studio:higgsfield]",
      error instanceof Error ? error.message : "provider error",
    );
  }
}
export async function imageCallback(req: Request): Promise<Response | null> {
  const url = new URL(req.url),
    version = url.searchParams.get("image_callback");
  if (!version) return null;
  const token = url.searchParams.get("token");
  if (
    req.method !== "POST" || !/^[0-9a-f-]{36}$/i.test(version) || !token ||
    !/^[0-9a-f-]{36}$/i.test(token)
  ) return new Response(null, { status: 400 });
  const db = getServiceClient();
  const { data, error } = await db.from("studio_image_requests").select(
    "version_id",
  ).eq("version_id", version).eq("callback_token", token).maybeSingle();
  if (error || !data) return new Response(null, { status: 403 });
  try {
    const body = await req.json();
    await reconcileHiggsfieldImage(db, version, body.request_id);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
