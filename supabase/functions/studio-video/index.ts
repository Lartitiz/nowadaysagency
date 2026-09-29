import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { getServiceClient } from "../_shared/plan-limiter.ts";
import { estimate, MODEL, MODELS, ProviderError, publicHttpsUrl, status as providerStatus, submit, uploadImage, type VideoInput, type VideoModel } from "./higgsfield.ts";
import { buildVideoPrompt, prepareVideo, signPreparation, verifyPreparation } from "./prepare.ts";

const BUCKET = "studio-video";
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const quoteSchema = z.object({
  action: z.literal("quote"), workspace_id: z.string().uuid(),
  source_kind: z.enum(["photo", "studio_version", "text", "references"]), source_id: z.string().uuid().optional(),
  references: z.array(z.object({ kind: z.enum(["photo", "studio_version"]), id: z.string().uuid(),
    role: z.enum(["subject", "product", "person", "casting", "background", "style", "composition"]) })).min(2).max(4).optional(),
  prompt: z.string().trim().min(3).max(3000), duration: z.number().int().min(4).max(10),
  resolution: z.enum(["480p", "720p"]), aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  person_free_attested: z.boolean(), prepared_token: z.string().max(100).optional(),
  idea: z.string().trim().min(3).max(1000).optional(),
  summary: z.string().trim().min(20).max(1200).optional(),
  continuity: z.array(z.string().trim().min(8).max(180)).min(1).max(4).optional(),
  allowed_changes: z.string().trim().min(8).max(180).optional(),
  forbidden_changes: z.string().trim().min(8).max(250).optional(),
});
const prepareSchema = quoteSchema.extend({ action: z.literal("prepare"), prepared_token: z.never().optional() });
function validateQuote(p: z.infer<typeof quoteSchema> | z.infer<typeof prepareSchema>, ctx: z.RefinementCtx) {
  const image = p.source_kind === "photo" || p.source_kind === "studio_version";
  const attested = p.person_free_attested;
  if (image && (!p.source_id || p.references?.length || !attested)) ctx.addIssue({ code: "custom", message: "Image invalide" });
  if (p.source_kind === "text" && (p.source_id || p.references?.length)) ctx.addIssue({ code: "custom", message: "Texte invalide" });
  if (p.source_kind === "references" && (p.source_id || !p.references || !attested ||
    p.references.some(r => r.role === "person") ||
    new Set(p.references.map(r => `${r.kind}:${r.id}`)).size !== p.references.length))
    ctx.addIssue({ code: "custom", message: "Références invalides" });
}
const submitSchema = z.object({ action: z.literal("submit"), workspace_id: z.string().uuid(), job_id: z.string().uuid() });
const statusSchema = z.object({ action: z.literal("status"), workspace_id: z.string().uuid(), job_id: z.string().uuid() });
const listSchema = z.object({ action: z.literal("list"), workspace_id: z.string().uuid() });
const listSourcesSchema = z.object({ action: z.literal("list_sources"), workspace_id: z.string().uuid() });
const bodySchema = z.discriminatedUnion("action", [prepareSchema, quoteSchema, submitSchema, statusSchema, listSchema, listSourcesSchema])
  .superRefine((p, ctx) => { if (p.action === "quote" || p.action === "prepare") validateQuote(p, ctx); });
type DB = ReturnType<typeof getServiceClient>;

// Limited trial: only these workspaces may quote or submit, whatever the
// global switch says. Budget is lifetime (no monthly reset) and enforced
// atomically by studio_video_claim_trial.
export const TRIAL_WORKSPACES = new Set(["76af5fa5-3e3a-481f-b6a6-41cc16f3d73b"]);
// Plafond demandé : 10 € au total, soit ≈ 11 $ au taux d'affichage (1 $ ≈ 0,92 €).
export const TRIAL_TOTAL_LIMIT_USD = 11;
// Plusieurs lancements possibles : le plafond de dépense reste le vrai garde-fou.
export const TRIAL_MAX_SUBMISSIONS = 20;
// Les clips échoués, refusés ou annulés ne comptent ni dans les lancements ni dans la dépense.
const NON_BILLED_STATUSES = ["failed", "nsfw", "canceled"];
export function workspaceAllowed(workspace: string) { return TRIAL_WORKSPACES.has(workspace); }
function enabled(workspace: string) {
  return workspaceAllowed(workspace) && Deno.env.get("HIGGSFIELD_VIDEO_ENABLED") === "true" && !!Deno.env.get("HIGGSFIELD_API_KEY");
}
function monthlyLimit() {
  const limit = Number(Deno.env.get("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD"));
  // The configured value can only lower the trial ceiling, never raise it.
  return Number.isFinite(limit) && limit > 0 ? Math.min(limit, TRIAL_TOTAL_LIMIT_USD) : 0;
}
async function trialSubmittedCount(db: DB) {
  const { count, error } = await db.from("studio_video_jobs").select("id", { count: "exact", head: true })
    .not("submitted_at", "is", null).not("status", "in", `(${NON_BILLED_STATUSES.join(",")})`);
  if (error) throw error;
  return count || 0;
}
function safeJob(row: Record<string, unknown>, signedUrl: string | null = null) {
  return {
    id: row.id, workspace_id: row.workspace_id, source_kind: row.source_kind,
    source_id: row.source_id, source_name: row.source_name, source_refs: row.source_refs,
    prompt: row.prompt, duration: row.duration, resolution: row.resolution,
    preparation: row.preparation,
    aspect_ratio: row.aspect_ratio, model: row.model, status: row.status,
    estimated_usd: row.estimated_usd, estimated_credits: row.estimated_credits,
    quote_expires_at: row.quote_expires_at, created_at: row.created_at,
    error_code: row.error_code, video_url: signedUrl,
  };
}
async function signed(db: DB, row: { result_path?: string | null }) {
  if (!row.result_path) return null;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(row.result_path, 3600);
  if (error || !data?.signedUrl) throw new Error("studio_video_sign_failed");
  return data.signedUrl;
}
export function allowedStudioVersion(proposal: Record<string, unknown> | null) {
  return proposal?.requires_real_subject !== true && proposal?.subject_kind !== "portrait";
}
async function source(db: DB, workspace: string, kind: "photo" | "studio_version", id: string) {
  if (kind === "photo") {
    const { data, error } = await db.from("user_photos").select("id,name,kind,status,storage_path,removed_from_library_at")
      .eq("id", id).eq("workspace_id", workspace).maybeSingle();
    if (error || !data || data.status !== "ready" || data.removed_from_library_at)
      throw new Error("studio_video_source_unavailable");
    if (data.kind === "portrait" || data.kind === "produit_porte") throw new Error("studio_video_person_unsupported");
    return { bucket: "user-photos", path: data.storage_path as string, name: (data.name || "Photo").slice(0, 120) };
  }
  const { data, error } = await db.from("visual_studio_versions")
    .select("id,status,result_path,proposal,visual_studio_sessions!inner(name)")
    .eq("id", id).eq("workspace_id", workspace).maybeSingle();
  if (error || !data || data.status !== "ready") throw new Error("studio_video_source_unavailable");
  const proposal = data.proposal as Record<string, unknown> | null;
  if (!allowedStudioVersion(proposal))
    throw new Error("studio_video_person_unsupported");
  const session = data.visual_studio_sessions as unknown as { name?: string };
  return { bucket: "visual-studio", path: data.result_path as string, name: (session?.name || "Création du Studio").slice(0, 120) };
}
type SourceRef = { kind: "photo" | "studio_version"; id: string; role: string; name?: string };
function inputFromJob(row: Record<string, unknown>): VideoInput {
  const common = { prompt: String(row.prompt), duration: Number(row.duration),
    resolution: row.resolution as "480p" | "720p", output_format: "mp4" as const,
    generate_audio: false as const };
  if (row.source_kind === "text") return { ...common, aspect_ratio: row.aspect_ratio as "9:16" | "16:9" | "1:1" };
  if (row.source_kind === "references") return { ...common,
    image_urls: row.input_urls as string[], aspect_ratio: row.aspect_ratio as "9:16" | "16:9" | "1:1" };
  return { ...common, image_url: String(row.input_url) };
}
async function job(db: DB, workspace: string, id: string) {
  const { data, error } = await db.from("studio_video_jobs").select("*").eq("id", id).eq("workspace_id", workspace).maybeSingle();
  if (error || !data) throw new Error("studio_video_job_unavailable");
  return data;
}
async function archive(db: DB, row: Record<string, unknown>) {
  const url = row.provider_video_url;
  if (!publicHttpsUrl(url)) throw new Error("studio_video_result_unavailable");
  const path = `${row.workspace_id}/${row.id}/clip.mp4`;
  const already = await db.storage.from(BUCKET).info(path);
  if (already.error) {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error("studio_video_download_failed");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_VIDEO_BYTES) throw new Error("studio_video_too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 12 || bytes.length > MAX_VIDEO_BYTES ||
      String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") throw new Error("studio_video_invalid_mp4");
    const uploaded = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: false });
    if (uploaded.error && !/already exists/i.test(uploaded.error.message)) throw new Error("studio_video_store_failed");
  }
  const { data, error } = await db.from("studio_video_jobs").update({ status: "ready", result_path: path, completed_at: new Date().toISOString(), error_code: null })
    .eq("id", row.id).eq("status", "archiving").select("*").single();
  if (error || !data) throw new Error("studio_video_finalize_failed");
  return data;
}

async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const url = new URL(req.url);
  const id = url.searchParams.get("job_id");
  const token = url.searchParams.get("token");
  const envelope = await req.json().catch(() => null);
  if (!id || !token || !z.string().uuid().safeParse(id).success ||
    !z.string().uuid().safeParse(token).success ||
    !envelope || !z.string().uuid().safeParse(envelope.request_id).success ||
    !["completed", "failed", "nsfw"].includes(envelope.status))
    return new Response(null, { status: 400 });
  const db = getServiceClient();
  const { data: row, error } = await db.from("studio_video_jobs").select("*").eq("id", id).eq("webhook_token", token).maybeSingle();
  if (error || !row) return new Response(null, { status: 404 });
  if (row.provider_request_id && row.provider_request_id !== envelope.request_id)
    return new Response(null, { status: 409 });
  if (["ready", "failed", "nsfw", "canceled"].includes(row.status)) return new Response(null, { status: 204 });
  try {
    // The callback has no documented signature. Verify its request ID and
    // terminal status through our authenticated provider GET before writing.
    const verified = await providerStatus(envelope.request_id);
    if (verified.status !== envelope.status) return new Response(null, { status: 503 });
    if (verified.status === "completed") {
      const updated = await db.from("studio_video_jobs").update({ status: "archiving",
        provider_request_id: verified.request_id, provider_video_url: verified.video!.url })
        .eq("id", id).select("*").single();
      if (updated.error || !updated.data) throw new Error("studio_video_webhook_store_failed");
      await archive(db, updated.data);
    } else {
      const updated = await db.from("studio_video_jobs").update({
        provider_request_id: verified.request_id, status: verified.status,
        error_code: verified.status === "nsfw" ? "content_policy" : verified.status,
        completed_at: new Date().toISOString(),
      }).eq("id", id);
      if (updated.error) throw updated.error;
    }
    return new Response(null, { status: 204 });
  } catch {
    // Higgsfield retries 5xx delivery; the authenticated user status path also
    // reconciles the job if the callback retry window closes.
    return new Response(null, { status: 503 });
  }
}

export async function handleVideoRequest(req: Request): Promise<Response> {
  if (new URL(req.url).searchParams.has("job_id")) return handleWebhook(req);
  const pipe = await runPipeline(req, { skipQuota: true, rateLimit: { max: 30, windowMs: 60_000 } });
  if (!pipe.ok) return pipe.response;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...pipe.corsHeaders, "Content-Type": "application/json" },
  });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Demande vidéo invalide." }, 400);
  const p = parsed.data, db = getServiceClient();
  try {
    const { data: member, error: memberError } = await db.from("workspace_members").select("role")
      .eq("workspace_id", p.workspace_id).eq("user_id", pipe.userId).maybeSingle();
    if (memberError || !member) return json({ error: "Espace indisponible." }, 403);
    const writable = ["owner", "manager", "editor"].includes(member.role);
    if (["prepare", "quote", "submit"].includes(p.action) && !writable) return json({ error: "Cet espace est en lecture seule." }, 403);

    if (p.action === "list") {
      const { data, error } = await db.from("studio_video_jobs").select("*").eq("workspace_id", p.workspace_id)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return json({ enabled: enabled(p.workspace_id) && monthlyLimit() > 0,
        jobs: await Promise.all((data || []).map(async (row) => safeJob(row, row.status === "ready" ? await signed(db, row) : null))) });
    }
    if (p.action === "list_sources") {
      const { data, error } = await db.from("visual_studio_versions")
        .select("id,result_path,proposal,visual_studio_sessions!inner(name)")
        .eq("workspace_id", p.workspace_id).eq("status", "ready")
        .is("library_photo_id", null).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const eligible = (data || []).filter(row => allowedStudioVersion(row.proposal as Record<string, unknown> | null));
      const paths = eligible.map(row => row.result_path as string);
      const signedImages = paths.length ? await db.storage.from("visual-studio").createSignedUrls(paths, 3600) : null;
      if (signedImages?.error) throw signedImages.error;
      return json({ sources: eligible.map((row, index) => ({
        kind: "studio_version", id: row.id,
        name: ((row.visual_studio_sessions as unknown as { name?: string })?.name || "Création du Studio").slice(0, 120),
        previewUrl: signedImages?.data?.[index]?.signedUrl || null,
      })) });
    }
    if (p.action === "prepare") {
      if (!enabled(p.workspace_id) || !monthlyLimit()) return json({ error: "La création vidéo n’est pas encore activée." }, 503);
      if (await trialSubmittedCount(db) >= TRIAL_MAX_SUBMISSIONS)
        return json({ error: "Le nombre de lancements d’essai est atteint." }, 409);
      const refs: SourceRef[] = p.source_kind === "references" ? p.references! : [];
      const resolved = await Promise.all(refs.map(async ref => ({ ...ref,
        ...(await source(db, p.workspace_id, ref.kind, ref.id)) })));
      const single = p.source_kind === "photo" || p.source_kind === "studio_version"
        ? await source(db, p.workspace_id, p.source_kind, p.source_id!) : null;
      const images = single ? [{ ...single, role: "subject" }] : resolved;
      const vision = await Promise.all(images.map(async image => {
        const { data, error } = await db.storage.from(image.bucket).download(image.path,
          { transform: { width: 1200, quality: 75, resize: "contain" } });
        if (error || !data) throw new Error("studio_video_source_unavailable");
        return { name: image.name, role: image.role, blob: data };
      }));
      const prepared = await prepareVideo({ idea: p.prompt, source_kind: p.source_kind,
        references: resolved.map(({ kind, id, role, name }, i) => ({ image: i + 1, kind, id, role, name })),
        duration: p.duration, resolution: p.resolution, aspect_ratio: p.aspect_ratio }, vision);
      const prompt = buildVideoPrompt(prepared, p.duration, images);
      const preparedInput = { ...p, idea: p.prompt, prompt, summary: prepared.summary, continuity: prepared.invariants,
        allowed_changes: prepared.allowed_changes, forbidden_changes: prepared.forbidden_changes };
      const token = await signPreparation(preparedInput, pipe.userId, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      return json({ summary: prepared.summary, continuity: prepared.invariants,
        allowed_changes: prepared.allowed_changes, forbidden_changes: prepared.forbidden_changes,
        prompt, prepared_token: token });
    }
    if (p.action === "quote") {
      if (!enabled(p.workspace_id) || !monthlyLimit()) return json({ error: "La création vidéo n’est pas encore activée." }, 503);
      if (!p.prepared_token || !p.idea || !p.summary || !p.continuity || !p.allowed_changes || !p.forbidden_changes ||
        !await verifyPreparation(p.prepared_token, p, pipe.userId,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!))
        return json({ error: "La proposition vidéo a changé. Prépare et valide de nouveau le clip." }, 409);
      if (await trialSubmittedCount(db) >= TRIAL_MAX_SUBMISSIONS)
        return json({ error: "Le nombre de lancements d’essai est atteint." }, 409);
      const { count, error: quoteLimitError } = await db.from("studio_video_jobs").select("id", { count: "exact", head: true })
        .eq("user_id", pipe.userId).gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
      if (quoteLimitError) throw quoteLimitError;
      if ((count || 0) >= 10) return json({ error: "Limite de devis atteinte pour aujourd’hui." }, 429);
      const model: VideoModel = p.source_kind === "text" ? MODELS.text :
        p.source_kind === "references" ? MODELS.references : MODEL;
      const refs: SourceRef[] = p.source_kind === "references" ? p.references! : [];
      const resolved = await Promise.all(refs.map(async ref => ({ ...ref,
        ...(await source(db, p.workspace_id, ref.kind, ref.id)) })));
      const single = p.source_kind === "photo" || p.source_kind === "studio_version"
        ? await source(db, p.workspace_id, p.source_kind, p.source_id!) : null;
      const images = single ? [single] : resolved;
      const actualPrompt = p.prompt;
      const inputUrls: string[] = [];
      for (const image of images) {
        const { data: media, error: mediaError } = await db.storage.from(image.bucket).download(image.path);
        if (mediaError || !media) throw new Error("studio_video_source_unavailable");
        // Each private image is sent only after a price request and the user's
        // attestation; text-only requests do not transmit an image.
        inputUrls.push(await uploadImage(media));
      }
      const common = { prompt: actualPrompt, duration: p.duration, resolution: p.resolution,
        output_format: "mp4" as const, generate_audio: false as const };
      const input: VideoInput = single ? { ...common, image_url: inputUrls[0] } :
        refs.length ? { ...common, image_urls: inputUrls, aspect_ratio: p.aspect_ratio } :
          { ...common, aspect_ratio: p.aspect_ratio };
      const price = await estimate(input, fetch, model);
      if (price.usd > monthlyLimit()) return json({ error: "Ce devis dépasse le plafond de la recette vidéo." }, 409);
      const id = crypto.randomUUID();
      const webhookToken = crypto.randomUUID();
      const { data, error } = await db.from("studio_video_jobs").insert({
        id, workspace_id: p.workspace_id, user_id: pipe.userId, source_kind: p.source_kind,
        source_id: p.source_id || null, source_name: single?.name || (refs.length ? `${refs.length} références` : "Idée seule"),
        source_refs: resolved.map(({ kind, id, role, name }) => ({ kind, id, role, name })),
        preparation: { idea: p.idea, summary: p.summary, continuity: p.continuity,
          allowed_changes: p.allowed_changes, forbidden_changes: p.forbidden_changes },
        prompt: actualPrompt, duration: p.duration, aspect_ratio: p.aspect_ratio,
        resolution: p.resolution, person_free_attested: p.person_free_attested, model,
        input_url: single ? inputUrls[0] : null, input_urls: refs.length ? inputUrls : [],
        estimated_usd: price.usd, estimated_credits: price.credits,
        status: "quoted", webhook_token: webhookToken,
        quote_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }).select("*").single();
      if (error || !data) throw new Error("studio_video_quote_store_failed");
      return json({ job: safeJob(data), monthly_limit_usd: monthlyLimit() });
    }

    let row = await job(db, p.workspace_id, p.job_id);
    if (p.action === "submit") {
      if (!enabled(p.workspace_id) || !monthlyLimit()) return json({ error: "La création vidéo n’est pas encore activée." }, 503);
      if (row.status !== "quoted") return json({ job: safeJob(row, row.status === "ready" ? await signed(db, row) : null) });
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (!supabaseUrl || !supabaseUrl.startsWith("https://")) return json({ error: "Le suivi vidéo n’est pas configuré." }, 503);
      const callback = new URL(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/studio-video`);
      callback.searchParams.set("job_id", row.id);
      callback.searchParams.set("token", row.webhook_token);
      const { data: claimed, error: claimError } = await db.rpc("studio_video_claim_trial", {
        p_actor: pipe.userId, p_job: p.job_id, p_allowed_workspace: p.workspace_id,
        p_total_limit: monthlyLimit(), p_max_submissions: TRIAL_MAX_SUBMISSIONS,
      });
      if (claimError) {
        const message = claimError.message.includes("video_trial_exhausted") ? "Le nombre de lancements d’essai est atteint." :
          claimError.message.includes("video_budget") ? "Le plafond vidéo de cet espace est atteint." :
          claimError.message.includes("video_quote_expired") ? "Ce devis a expiré. Vérifie à nouveau le prix." : "La génération ne peut pas démarrer.";
        return json({ error: message }, 409);
      }
      if (!claimed) return json({ job: safeJob(await job(db, p.workspace_id, p.job_id)) });
      const input = inputFromJob(row);
      try {
        const accepted = await submit(input, callback.toString(), fetch, row.model as VideoModel);
        const updated = await db.from("studio_video_jobs").update({ status: "queued",
          provider_request_id: accepted.requestId, provider_correlation_id: accepted.correlationId,
        }).eq("id", row.id).eq("status", "submitting_uncertain").select("*").single();
        if (updated.error || !updated.data) throw new Error("studio_video_receipt_uncertain");
        return json({ job: safeJob(updated.data) });
      } catch (error) {
        if (error instanceof ProviderError && error.status >= 400 && error.status < 500) {
          const failed = await db.from("studio_video_jobs").update({ status: "failed", error_code: `provider_http_${error.status}`,
            provider_correlation_id: error.correlationId }).eq("id", row.id).eq("status", "submitting_uncertain");
          if (failed.error) throw failed.error;
          return json({ error: error.status === 403 ? "Solde API Higgsfield insuffisant." : "Higgsfield a refusé la demande.",
            job: safeJob(await job(db, p.workspace_id, p.job_id)) }, 409);
        }
        // Network timeout, 5xx, or a lost DB receipt: a POST may have been paid.
        // Preserve the reservation and never submit again automatically.
        return json({ error: "Réponse de génération incertaine. Le suivi reste ouvert sans relance facturable.",
          job: safeJob(await job(db, p.workspace_id, p.job_id)) }, 202);
      }
    }

    if (row.status === "ready") return json({ job: safeJob(row, await signed(db, row)) });
    if (["quoted", "submitting_uncertain", "failed", "nsfw", "canceled"].includes(row.status))
      return json({ job: safeJob(row) });
    if (row.status !== "archiving") {
      if (!row.provider_request_id) throw new Error("studio_video_request_missing");
      const state = await providerStatus(row.provider_request_id);
      if (["failed", "nsfw", "canceled"].includes(state.status)) {
        const updated = await db.from("studio_video_jobs").update({ status: state.status,
          error_code: state.status === "nsfw" ? "content_policy" : state.status,
          completed_at: new Date().toISOString() }).eq("id", row.id).select("*").single();
        if (updated.error || !updated.data) throw new Error("studio_video_status_store_failed");
        return json({ job: safeJob(updated.data) });
      }
      if (state.status === "completed") {
        const updated = await db.from("studio_video_jobs").update({ status: "archiving", provider_video_url: state.video!.url })
          .eq("id", row.id).select("*").single();
        if (updated.error || !updated.data) throw new Error("studio_video_status_store_failed");
        row = updated.data;
      } else {
        if (state.status !== row.status) {
          const updated = await db.from("studio_video_jobs").update({ status: state.status }).eq("id", row.id);
          if (updated.error) throw updated.error;
        }
        return json({ job: safeJob({ ...row, status: state.status }) });
      }
    }
    try {
      row = await archive(db, row);
      return json({ job: safeJob(row, await signed(db, row)) });
    } catch {
      return json({ job: safeJob(row), error: "Le clip est généré mais son enregistrement doit être repris. Réessaie le suivi." }, 202);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "studio_video_unknown";
    const userMessage = code === "studio_video_person_unsupported" ? "Les portraits et photos avec personnes identifiables ne sont pas encore pris en charge." :
      code === "studio_video_source_unavailable" ? "Cette image n’est plus disponible dans cet espace." :
      error instanceof ProviderError && error.status === 403 ? "Solde API Higgsfield insuffisant." :
      "Le Studio vidéo est momentanément indisponible. Réessaie sans relancer une génération en cours.";
    return json({ error: userMessage, code: code.slice(0, 80) }, 503);
  }
}

if (import.meta.main) serve(handleVideoRequest);
