import { soulPrompt, resolveSoulStyle, SOUL2_STYLES } from "./soul-direction.ts";
import { getServiceClient } from "../_shared/plan-limiter.ts";
import { imagePrompt, type Proposal } from "./media.ts";
import { PHOTO_PRESERVATION } from "./photo-preservation.ts";
type DB = ReturnType<typeof getServiceClient>;
const BASE = "https://api.higgsfield.ai";
export const IMAGE_MODELS = [
  "higgsfield-ai/soul/v2/standard",
  "higgsfield-ai/soul/v2/image-to-image",
  "marketing-studio/image/flare",
  "marketing-studio/image/sunburst",
] as const;
export const SOUL2_MODEL = "higgsfield-ai/soul/v2/standard";
export const SOUL2_I2I_MODEL = "higgsfield-ai/soul/v2/image-to-image";
export function soul2IdentityEligible(proposal: Proposal) {
  return proposal.operation === "create" && proposal.scene_workflow?.phase === "scene" && proposal.visual_kind === "photo" &&
    !proposal.exact_text?.length && !proposal.input_path && !proposal.composition &&
    proposal.references?.length === 1 && ["person", "casting"].includes(proposal.references[0].role);
}
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
// Temporary, reversible routing (01/10/2026): fidelity edits/integrations go to
// Higgsfield Marketing Studio (GPT Image, quality-first) while direct OpenAI is
// exhausted. Switched by HIGGSFIELD_IMAGE_ENABLED alone (+ existing consent flag);
// unset it to return to OpenAI. Soul scenes and Photoroom backgrounds are untouched.
export const MARKETING_FIDELITY_MODEL = "marketing-studio/image/sunburst";
export const MARKETING_MAX_IMAGES = 16;
export function marketingFidelityEligible(proposal: Proposal | null | undefined) {
  if (!proposal || proposal.provider === "higgsfield" || proposal.operation === "background") return false;
  return proposal.operation === "edit" || proposal.operation === "product" ||
    proposal.scene_workflow?.phase === "integration" ||
    (proposal.operation === "create" && proposal.person_reference?.mode === "sheet");
}
// Official limit observed on the Marketing Studio estimate route (01/10/2026):
// prompts above 5000 characters are refused with HTTP 400 "is too long".
export const MARKETING_PROMPT_MAX = 5000;
const STAGING_START = "Stage the exact product in a physically plausible position";
const STAGING_SHORT = "Stage the exact product plausibly: real contact with its confirmed support, believable contact shadow, normal orientation (a plate rests flat or is held, a bowl base-down). Match the setting's perspective, scale, light direction and color temperature. Keep its true profile and markings on the same parts; never invent an unseen side.";
const BRIEF_RULE = "This brief and the confirmed preservation and change lists govern the result. The technical instructions below only explain how to realize them; do not introduce unconfirmed subjects, props, actions, text or style changes.";
/** Higgsfield-only fitting: keeps every confirmed user element (brief, shot
 * instructions, preserve/change lists, reference roles) and condenses only generic
 * boilerplate. Returns null when the confirmed content alone exceeds the limit. */
export function marketingPrompt(proposal: Proposal): string | null {
  let prompt = imagePrompt(proposal);
  if (prompt.length <= MARKETING_PROMPT_MAX) return prompt;
  const hasPerson = (proposal.references || []).some((r) => ["person", "casting", "person_product"].includes(r.role)) ||
    !!proposal.person_reference;
  // Same rules as PHOTO_PRESERVATION, condensed (person rules only when a person is involved).
  prompt = prompt.replace(PHOTO_PRESERVATION, [
    "DEFAULT PHOTO PRESERVATION (an explicit confirmed lighting/style change overrides only the matching rule; references and brand charter are not such a request).",
    "Apply only the requested changes. Keep the source's light direction and hardness, contrast, color temperature, grain and depth of field. Unrequested elements stay as faithful as possible to the original.",
    hasPerson ? "If a person changes, keep source lighting on their morphology and natural face shadows; no automatic fill light, frontal light or beauty retouch; keep natural skin texture without smoothing or invented imperfections. If only the product changes, keep face, identity, expression and skin unchanged; an identity reference does not authorize replacing the person again." : "",
    "Integrate products with reflections, cast and contact shadows matching this light, respecting their visual characteristics.",
  ].filter(Boolean).join("\n"));
  prompt = prompt.split("\n").map((line) => {
    if (!line.startsWith(STAGING_START)) return line;
    const placement = line.indexOf("Confirmed product placement:");
    return placement >= 0 ? `${STAGING_SHORT} ${line.slice(placement)}` : STAGING_SHORT;
  }).join("\n");
  prompt = prompt.replace(BRIEF_RULE, "Follow only this confirmed brief and the confirmed preserve/change lists.");
  return prompt.length <= MARKETING_PROMPT_MAX ? prompt : null;
}
/** Marketing Studio estimates are token-based and return a pricing description,
 * not an amount. Reserve a conservative bound instead (2k high output + inputs). */
export function marketingReserveUsd(imageCount: number) {
  return Math.min(2, Math.round((0.35 + 0.03 * imageCount) * 100) / 100);
}
export function routeToMarketingStudio<T extends Proposal>(proposal: T): T {
  if (!higgsfieldImagesEnabled() || !marketingFidelityEligible(proposal)) return proposal;
  return { ...proposal, provider: "higgsfield", model: MARKETING_FIDELITY_MODEL };
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
  constructor(public status: number, public path: string) {
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
  if (!response.ok) throw new ProviderHttpError(response.status, path.split("?")[0]);
  return await response.json();
}
export function imageInput(proposal: Proposal, urls: string[]) {
  if (!IMAGE_MODELS.some((model) => model === proposal.model)) {
    throw new Error("studio_provider_model");
  }
  if (proposal.model === SOUL2_MODEL || proposal.model === SOUL2_I2I_MODEL) {
    const identity = proposal.model === SOUL2_I2I_MODEL;
    if (identity ? urls.length !== 1 || !publicUrl(urls[0]) || !soul2IdentityEligible(proposal) : urls.length > 0 || !soul2Eligible(proposal)) {
      throw new Error("studio_provider_model");
    }
    if (identity && proposal.soul_style) throw new Error("studio_soul_style_unavailable");
    const style = resolveSoulStyle(proposal.soul_style?.id, SOUL2_STYLES);
    return {
      prompt: soulPrompt(proposal),
      ...(style ? { style_id: style.id } : {}),
      batch_size: 1,
      resolution: "1080p",
      aspect_ratio: proposal.format === "portrait"
        ? "2:3"
        : proposal.format === "landscape"
        ? "3:2"
        : "1:1",
      // Soul i2i currently always enhances the prompt; do not claim otherwise.
      enhance_prompt: identity,
      ...(identity ? { image_url: urls[0] } : {}),
      image_urls: undefined,
    };
  }
  const prompt = marketingPrompt(proposal);
  if (!prompt) throw new Error("studio_prompt_too_long");
  return {
    prompt,
    quality: "high",
    resolution: "2k",
    aspect_ratio: proposal.format === "portrait"
      ? "2:3"
      : proposal.format === "landscape"
      ? "3:2"
      : "1:1",
    enhance_prompt: false,
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
export async function failHiggsfieldImage(db: DB, versionId: string, message = "La création a échoué. Aucune image décomptée.") {
  const result = await db.from("visual_studio_versions").update({
    status: "failed",
    error_message: message,
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
  let submitted = false, accepted = false, stage = "checks";
  try {
    if ([SOUL2_MODEL, SOUL2_I2I_MODEL].includes(version.proposal.model || "")
      ? !soul2Enabled()
      : !higgsfieldImagesEnabled()) {
      throw new Error("studio_provider_unavailable");
    }
    if (version.proposal.model === SOUL2_MODEL &&
      (inputs.length || !soul2Eligible(version.proposal))) {
      throw new Error("studio_provider_model");
    }
    if (version.proposal.model === SOUL2_I2I_MODEL && (inputs.length !== 1 || !soul2IdentityEligible(version.proposal))) throw new Error("studio_provider_model");
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
    stage = "prompt";
    // Validate the prompt before any upload so an oversized request costs nothing.
    imageInput(version.proposal, inputs.map(() => "https://placeholder.invalid/x.png"));
    stage = "upload";
    const urls = await Promise.all(inputs.map(upload));
    const input = imageInput(version.proposal, urls);
    stage = "estimate";
    const quote = await api(
      `estimate/${version.proposal.model}`,
      "POST",
      input,
    );
    const marketing = String(version.proposal.model).startsWith("marketing-studio/");
    const estimate = marketing && quote?.usd === undefined && quote?.type === "description"
      ? marketingReserveUsd(urls.length)
      : Number(quote.usd);
    stage = "reserve";
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
    stage = "submit";
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
    ) await failHiggsfieldImage(db, version.id, error instanceof Error && error.message === "studio_prompt_too_long"
      ? "La demande est trop longue pour le service d’images. Raccourcis-la puis réessaie. Aucune image décomptée."
      : undefined);
    else {
      const uncertain = await db.from("studio_image_requests").update({ status: "uncertain" })
        .eq("version_id", version.id).in("status", ["submitting", "queued"]);
      if (uncertain.error) throw uncertain.error;
    }
    // Safe metadata only: no prompt, URL, token or provider body.
    console.error("[studio:higgsfield]", JSON.stringify({
      stage, model: version.proposal.model,
      error: error instanceof Error ? error.message : "provider error",
      ...(error instanceof ProviderHttpError ? { status: error.status, path: error.path.startsWith("estimate/") ? "estimate" : error.path.startsWith("files/") ? "upload_url" : error.path.startsWith("requests/") ? "status" : "submit" } : {}),
    }));
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
