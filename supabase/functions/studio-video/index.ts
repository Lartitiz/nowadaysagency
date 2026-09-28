import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { getServiceClient } from "../_shared/plan-limiter.ts";
import { estimate, MODEL, ProviderError, publicHttpsUrl, status as providerStatus, submit, uploadImage, type VideoInput } from "./higgsfield.ts";

const BUCKET = "studio-video";
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const quoteSchema = z.object({
  action: z.literal("quote"), workspace_id: z.string().uuid(),
  source_kind: z.enum(["photo", "studio_version"]), source_id: z.string().uuid(),
  prompt: z.string().trim().min(3).max(1000), duration: z.number().int().min(4).max(10),
  resolution: z.enum(["480p", "720p"]), person_free_attested: z.literal(true),
});
const submitSchema = z.object({ action: z.literal("submit"), workspace_id: z.string().uuid(), job_id: z.string().uuid() });
const statusSchema = z.object({ action: z.literal("status"), workspace_id: z.string().uuid(), job_id: z.string().uuid() });
const listSchema = z.object({ action: z.literal("list"), workspace_id: z.string().uuid() });
const bodySchema = z.discriminatedUnion("action", [quoteSchema, submitSchema, statusSchema, listSchema]);
type DB = ReturnType<typeof getServiceClient>;

function enabled() {
  return Deno.env.get("HIGGSFIELD_VIDEO_ENABLED") === "true" && !!Deno.env.get("HIGGSFIELD_API_KEY");
}
function monthlyLimit() {
  const limit = Number(Deno.env.get("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD"));
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}
function safeJob(row: Record<string, unknown>, signedUrl: string | null = null) {
  return {
    id: row.id, workspace_id: row.workspace_id, source_kind: row.source_kind,
    source_id: row.source_id, source_name: row.source_name, prompt: row.prompt,
    duration: row.duration, resolution: row.resolution, status: row.status,
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
  if (proposal?.requires_real_subject === true || proposal?.subject_kind === "portrait")
    throw new Error("studio_video_person_unsupported");
  const session = data.visual_studio_sessions as unknown as { name?: string };
  return { bucket: "visual-studio", path: data.result_path as string, name: (session?.name || "Création du Studio").slice(0, 120) };
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
    if (["quote", "submit"].includes(p.action) && !writable) return json({ error: "Cet espace est en lecture seule." }, 403);

    if (p.action === "list") {
      const { data, error } = await db.from("studio_video_jobs").select("*").eq("workspace_id", p.workspace_id)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return json({ jobs: await Promise.all((data || []).map(async (row) => safeJob(row, row.status === "ready" ? await signed(db, row) : null))) });
    }
    if (p.action === "quote") {
      if (!enabled() || !monthlyLimit()) return json({ error: "La création vidéo n’est pas encore activée." }, 503);
      const { count } = await db.from("studio_video_jobs").select("id", { count: "exact", head: true })
        .eq("user_id", pipe.userId).gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
      if ((count || 0) >= 10) return json({ error: "Limite de devis atteinte pour aujourd’hui." }, 429);
      const src = await source(db, p.workspace_id, p.source_kind, p.source_id);
      const { data: media, error: mediaError } = await db.storage.from(src.bucket).download(src.path);
      if (mediaError || !media) throw new Error("studio_video_source_unavailable");
      // The user has explicitly requested this quote and attested that the image
      // contains no identifiable person. The image is sent to Higgsfield here.
      const imageUrl = await uploadImage(media);
      const input: VideoInput = { image_url: imageUrl, prompt: p.prompt, duration: p.duration,
        resolution: p.resolution, output_format: "mp4", generate_audio: false };
      const price = await estimate(input);
      const id = crypto.randomUUID();
      const webhookToken = crypto.randomUUID();
      const { data, error } = await db.from("studio_video_jobs").insert({
        id, workspace_id: p.workspace_id, user_id: pipe.userId, source_kind: p.source_kind,
        source_id: p.source_id, source_name: src.name, prompt: p.prompt, duration: p.duration,
        resolution: p.resolution, person_free_attested: true, model: MODEL,
        input_url: imageUrl, estimated_usd: price.usd, estimated_credits: price.credits,
        status: "quoted", webhook_token: webhookToken,
        quote_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }).select("*").single();
      if (error || !data) throw new Error("studio_video_quote_store_failed");
      return json({ job: safeJob(data), monthly_limit_usd: monthlyLimit() });
    }

    let row = await job(db, p.workspace_id, p.job_id);
    if (p.action === "submit") {
      if (!enabled() || !monthlyLimit()) return json({ error: "La création vidéo n’est pas encore activée." }, 503);
      if (row.status !== "quoted") return json({ job: safeJob(row, row.status === "ready" ? await signed(db, row) : null) });
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (!supabaseUrl || !supabaseUrl.startsWith("https://")) return json({ error: "Le suivi vidéo n’est pas configuré." }, 503);
      const callback = new URL(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/studio-video`);
      callback.searchParams.set("job_id", row.id);
      callback.searchParams.set("token", row.webhook_token);
      const { data: claimed, error: claimError } = await db.rpc("studio_video_claim", {
        p_actor: pipe.userId, p_job: p.job_id, p_monthly_limit: monthlyLimit(),
      });
      if (claimError) {
        const message = claimError.message.includes("video_budget") ? "Le plafond vidéo de cet espace est atteint." :
          claimError.message.includes("video_quote_expired") ? "Ce devis a expiré. Vérifie à nouveau le prix." : "La génération ne peut pas démarrer.";
        return json({ error: message }, 409);
      }
      if (!claimed) return json({ job: safeJob(await job(db, p.workspace_id, p.job_id)) });
      const input: VideoInput = { image_url: row.input_url, prompt: row.prompt, duration: row.duration,
        resolution: row.resolution, output_format: "mp4", generate_audio: false };
      try {
        const accepted = await submit(input, callback.toString());
        const updated = await db.from("studio_video_jobs").update({ status: "queued",
          provider_request_id: accepted.requestId, provider_correlation_id: accepted.correlationId,
        }).eq("id", row.id).eq("status", "submitting_uncertain").select("*").single();
        if (updated.error || !updated.data) throw new Error("studio_video_receipt_uncertain");
        return json({ job: safeJob(updated.data) });
      } catch (error) {
        if (error instanceof ProviderError && error.status >= 400 && error.status < 500) {
          await db.from("studio_video_jobs").update({ status: "failed", error_code: `provider_http_${error.status}`,
            provider_correlation_id: error.correlationId }).eq("id", row.id).eq("status", "submitting_uncertain");
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
        if (state.status !== row.status) await db.from("studio_video_jobs").update({ status: state.status }).eq("id", row.id);
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

serve(handleVideoRequest);
