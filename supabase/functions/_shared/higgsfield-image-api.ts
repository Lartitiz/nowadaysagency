/**
 * Higgsfield Marketing Studio — client partagé (03/10/2026).
 *
 * Le crédit OpenAI direct est épuisé (429 credit_balance_exhausted) : derrière
 * HIGGSFIELD_IMAGE_ENABLED=true (+ HIGGSFIELD_DATA_USE_REVIEWED=true), le Studio
 * visuel, carousel-slide-image et product-on-model passent par Higgsfield.
 * Retirer le secret = retour à OpenAI, sans code.
 *
 * L'hébergement ne permet pas d'importer une fonction voisine : ce qui sert à
 * plusieurs fonctions vit ici, visual-studio/higgsfield-image.ts le réexporte.
 *
 * generateHiggsfieldImageSync sert les fonctions SYNCHRONES (la réponse HTTP
 * porte l'image) : envoi, puis suivi de la demande jusqu'au résultat. Le budget
 * mensuel HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD est commun au Studio (même verrou,
 * même somme côté base).
 */
import type { getServiceClient } from "./plan-limiter.ts";

const BASE = "https://api.higgsfield.ai";
export const MARKETING_CREATE_MODEL = "marketing-studio/image/flare";
export const MARKETING_FIDELITY_MODEL = "marketing-studio/image/sunburst";
// Official limit observed on the Marketing Studio estimate route (01/10/2026):
// prompts above 5000 characters are refused with HTTP 400 "is too long".
export const MARKETING_PROMPT_MAX = 5000;

export function higgsfieldImagesEnabled() {
  return Deno.env.get("HIGGSFIELD_IMAGE_ENABLED") === "true" &&
    Deno.env.get("HIGGSFIELD_DATA_USE_REVIEWED") === "true";
}

/** NOT a quote. Marketing Studio's estimate route returns only a pricing
 * description (token-billed, reconciled by the provider on completion), so the
 * real cost cannot be capped in advance. This is a budget RESERVATION computed
 * from the verified official rates (per 1M tokens: text input $5, image input $8,
 * image output $30) with explicit upper-bound token assumptions:
 * prompt <= 5000 chars -> <= 2500 tokens; <= 2000 tokens per input image;
 * <= 10000 output tokens for one 2k high-quality image. Still bounded by the
 * $2 per-image guard and the monthly limit. */
export const MARKETING_RESERVE_BASIS = { text_tokens: 2500, image_input_tokens: 2000, output_tokens: 10000,
  usd_per_m: { text_in: 5, image_in: 8, image_out: 30 } } as const;
export function marketingReserveUsd(imageCount: number) {
  const b = MARKETING_RESERVE_BASIS;
  const usd = (b.text_tokens * b.usd_per_m.text_in + imageCount * b.image_input_tokens * b.usd_per_m.image_in +
    b.output_tokens * b.usd_per_m.image_out) / 1_000_000;
  return Math.min(2, Math.ceil(usd * 100) / 100);
}

export function aspectRatio(format?: string | null) {
  return format === "portrait" ? "2:3" : format === "landscape" ? "3:2" : "1:1";
}

/** Marketing Studio payload: full prompt, no provider-side enhancement. */
export function marketingPayload(prompt: string, format: string | null | undefined, urls: string[], resolution: "1k" | "2k" = "2k") {
  return {
    prompt,
    quality: "high",
    resolution,
    aspect_ratio: aspectRatio(format),
    enhance_prompt: false,
    ...(urls.length ? { image_urls: urls } : {}),
  };
}

export function higgsfieldCredentials() {
  const value = Deno.env.get("HIGGSFIELD_API_KEY");
  if (!value || !/^[^:\s]+:[^:\s]+$/.test(value)) {
    throw new Error("studio_provider_unavailable");
  }
  return `Key ${value}`;
}

export function publicUrl(value: unknown): value is string {
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

export class ProviderHttpError extends Error {
  constructor(public status: number, public path: string) {
    super(`higgsfield_http_${status}`);
  }
}

export async function higgsfieldApi(path: string, method = "GET", body?: unknown, timeoutMs = 35_000) {
  const response = await fetch(`${BASE}/${path}`, {
    method,
    headers: {
      Authorization: higgsfieldCredentials(),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new ProviderHttpError(response.status, path.split("?")[0]);
  return await response.json();
}

export async function higgsfieldUpload(blob: Blob) {
  const data = await higgsfieldApi("files/generate-upload-url", "POST", {
    content_type: blob.type || "image/jpeg",
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
  return data.public_url as string;
}

/** Safe metadata only for logs: no prompt, URL, token or provider body. */
export function higgsfieldErrorMeta(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "provider error",
    ...(error instanceof ProviderHttpError ? {
      status: error.status,
      path: error.path.startsWith("estimate/") ? "estimate" : error.path.startsWith("files/") ? "upload_url"
        : error.path.startsWith("requests/") ? "status" : "submit",
    } : {}),
  };
}

/** Service-role client: the budget RPC and table are service_role only. */
type DB = ReturnType<typeof getServiceClient>;

export interface SyncImageRequest {
  source: "carousel-slide-image" | "product-on-model";
  userId: string;
  workspaceId?: string | null;
  model: typeof MARKETING_CREATE_MODEL | typeof MARKETING_FIDELITY_MODEL;
  prompt: string;
  format: "portrait" | "landscape" | "square";
  inputs: Blob[];
  /** Absolute deadline (ms epoch) for the whole generation, polling included. */
  deadline: number;
  /** Status polling interval (tests only). */
  pollMs?: number;
}

export type SyncImageResult =
  | { ok: true; blob: Blob; requestId: string }
  | { ok: false; reason: SyncImageFailure };
export type SyncImageFailure = "unavailable" | "prompt_too_long" | "budget" | "rejected" | "failed" | "timeout";

/** User-facing French messages, consistent with the Studio wording. */
export const SYNC_IMAGE_MESSAGES: Record<SyncImageFailure, string> = {
  unavailable: "Le service d'images est indisponible pour le moment. Aucune image décomptée.",
  prompt_too_long: "Cette demande est trop longue pour le service d'images : raccourcis l'ambiance ou l'ajustement. Aucune image décomptée.",
  budget: "Le budget images du mois est atteint côté service. Aucune image décomptée.",
  rejected: "Le service d'images a refusé cette demande, réessaie dans quelques instants. Aucune image décomptée.",
  failed: "La création a échoué. Aucune image décomptée.",
  timeout: "La génération prend plus de temps que prévu. Aucune image décomptée, réessaie dans quelques minutes.",
};

const POLL_MS = 3_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setSpendStatus(db: DB, id: string, status: string, providerId?: string) {
  const { error } = await db.from("higgsfield_image_spend")
    .update({ status, ...(providerId ? { provider_id: providerId } : {}) }).eq("id", id);
  if (error) console.error("[higgsfield-sync] spend update", JSON.stringify({ status, error: error.message }));
}

/**
 * One Marketing Studio image, synchronously. Never retries a submitted request
 * (no double payment). A reservation is released (status failed) only when the
 * provider certainly did not accept the request; after acceptance it keeps
 * counting toward the monthly budget, even on timeout.
 */
export async function generateHiggsfieldImageSync(db: DB, req: SyncImageRequest): Promise<SyncImageResult> {
  let stage = "checks", spendId: string | null = null, submitted = false, accepted = false;
  const log = (extra: Record<string, unknown>) => console.error("[higgsfield-sync]", JSON.stringify({
    source: req.source, model: req.model, stage, ...extra,
  }));
  try {
    if (!higgsfieldImagesEnabled()) return { ok: false, reason: "unavailable" };
    if (req.prompt.length > MARKETING_PROMPT_MAX) return { ok: false, reason: "prompt_too_long" };
    higgsfieldCredentials();
    const monthly = Number(Deno.env.get("HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD"));
    if (!Number.isFinite(monthly) || monthly <= 0) return { ok: false, reason: "budget" };

    stage = "upload";
    const urls = await Promise.all(req.inputs.map(higgsfieldUpload));
    // 1k (~832×1248, close to the former OpenAI 1024×1536): the image travels as
    // base64 in the HTTP response; a 2k PNG weighed 6.5 MB and exceeded the
    // 4 MB photo-dump reference cap. The Studio keeps 2k (stored, not returned).
    const input = marketingPayload(req.prompt, req.format, urls, "1k");
    stage = "estimate";
    const quote = await higgsfieldApi(`estimate/${req.model}`, "POST", input);
    const estimate = quote?.usd === undefined && quote?.type === "description"
      ? marketingReserveUsd(urls.length)
      : Number(quote?.usd);
    if (!Number.isFinite(estimate) || estimate <= 0 || estimate > 2) return { ok: false, reason: "budget" };

    stage = "reserve";
    const reserved = await db.rpc("reserve_higgsfield_image_cost", {
      p_source: req.source,
      p_user: req.userId,
      p_workspace: req.workspaceId ?? null,
      p_estimate: estimate,
      p_monthly_limit: monthly,
    });
    if (reserved.error || typeof reserved.data !== "string") {
      log({ error: reserved.error?.message?.includes("studio_provider_budget") ? "budget" : "reserve_failed" });
      return { ok: false, reason: "budget" };
    }
    spendId = reserved.data;
    console.log("[higgsfield-sync:reserve]", JSON.stringify({ source: req.source, basis: "token_rates_upper_bound", reserve_usd: estimate, images: urls.length }));

    stage = "submit";
    submitted = true;
    const result = await higgsfieldApi(req.model, "POST", input, 90_000);
    if (typeof result?.request_id !== "string" || !/^[0-9a-f-]{36}$/i.test(result.request_id)) {
      throw new Error("studio_provider_receipt");
    }
    accepted = true;
    const requestId: string = result.request_id;
    await setSpendStatus(db, spendId, "queued", requestId);

    stage = "status";
    while (Date.now() < req.deadline) {
      await sleep(Math.min(req.pollMs ?? POLL_MS, Math.max(0, req.deadline - Date.now())));
      let status;
      try {
        status = await higgsfieldApi(`requests/${requestId}/status`, "GET", undefined, 15_000);
      } catch (e) {
        // A transient status error must not lose an accepted (paid) request.
        if (e instanceof ProviderHttpError && e.status < 500 && e.status !== 429) throw e;
        continue;
      }
      if (status?.request_id !== requestId) throw new Error("studio_provider_receipt");
      if (["failed", "nsfw", "canceled"].includes(status.status)) {
        await setSpendStatus(db, spendId, "failed");
        log({ error: `provider_${status.status}` });
        return { ok: false, reason: status.status === "nsfw" ? "rejected" : "failed" };
      }
      if (status.status !== "completed") continue;
      stage = "download";
      const url = status.images?.[0]?.url;
      if (!publicUrl(url)) throw new Error("studio_provider_output");
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
      if (!response.ok || Number(response.headers.get("content-length")) > 15_000_000) throw new Error("studio_provider_output");
      const blob = await response.blob();
      if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 15_000_000 || !blob.size) {
        throw new Error("studio_provider_output");
      }
      await setSpendStatus(db, spendId, "completed");
      return { ok: true, blob, requestId };
    }
    await setSpendStatus(db, spendId, "uncertain");
    log({ error: "timeout" });
    return { ok: false, reason: "timeout" };
  } catch (error) {
    // Not accepted and certainly refused → release the reservation.
    const refused = !submitted || (!accepted && error instanceof ProviderHttpError &&
      [400, 401, 402, 403, 404, 422, 429].includes(error.status));
    if (spendId) await setSpendStatus(db, spendId, refused ? "failed" : "uncertain");
    log(higgsfieldErrorMeta(error));
    if (error instanceof Error && error.message === "studio_provider_unavailable") return { ok: false, reason: "unavailable" };
    return { ok: false, reason: refused ? "rejected" : "failed" };
  }
}

export async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}

/**
 * Brings a prompt under `max` by shortening ONE optional section (brand
 * universe, product context…), never the user's request. Below 60 useful
 * characters the section is dropped. The result may still exceed `max`.
 */
export function clipSection(prompt: string, section: string, max = MARKETING_PROMPT_MAX): string {
  if (prompt.length <= max || !section || !prompt.includes(section)) return prompt;
  const keep = section.length - (prompt.length - max) - 1;
  if (keep >= 60) return prompt.replace(section, section.slice(0, keep).trimEnd() + "…");
  return prompt.replace(`\n\n${section}`, "").replace(section, "");
}
