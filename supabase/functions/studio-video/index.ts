import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { getEffectivePlan, getServiceClient, PLAN_LIMITS } from "../_shared/plan-limiter.ts";
import { estimate, MODEL, MODELS, ProviderError, publicHttpsUrl, status as providerStatus, submit, uploadImage, type VideoInput, type VideoModel } from "./higgsfield.ts";
import { buildVideoPrompt, prepareVideo, signPreparation, verifyPreparation } from "./prepare.ts";
import { preparationAspectRatio, videoInputForQuote, videoInputFromJob } from "./payload.ts";

const BUCKET = "studio-video";
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const quoteSchema = z.object({
  action: z.literal("quote"), workspace_id: z.string().uuid(),
  session_id: z.string().uuid().optional(),
  source_kind: z.enum(["photo", "studio_version", "text", "references"]), source_id: z.string().uuid().optional(),
  references: z.array(z.object({ kind: z.enum(["photo", "studio_version"]), id: z.string().uuid(),
    role: z.enum(["subject", "product", "person", "casting", "background", "style", "composition"]) })).min(2).max(4).optional(),
  prompt: z.string().trim().min(3).max(3000), duration: z.number().int().min(4).max(10),
  resolution: z.enum(["480p", "720p"]), aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  person_free_attested: z.boolean(), prepared_token: z.string().max(100).optional(),
  idea: z.string().trim().min(3).max(1000).optional(),
  user_idea: z.string().trim().min(3).max(1000).optional(),
  display_name: z.string().trim().min(1).max(120).optional(),
  summary: z.string().trim().min(20).max(1200).optional(),
  continuity: z.array(z.string().trim().min(8).max(180)).min(1).max(4).optional(),
  allowed_changes: z.string().trim().min(8).max(400).optional(),
  forbidden_changes: z.string().trim().min(8).max(500).optional(),
});
const prepareSchema = quoteSchema.extend({ action: z.literal("prepare"),
  prompt: z.string().trim().min(3).max(1000), prepared_token: z.never().optional() });
function validateQuote(p: z.infer<typeof quoteSchema> | z.infer<typeof prepareSchema>, ctx: z.RefinementCtx) {
  const image = p.source_kind === "photo" || p.source_kind === "studio_version";
  const attested = p.person_free_attested;
  if (image && (!p.source_id || p.references?.length || !attested)) ctx.addIssue({ code: "custom", message: "Image invalide" });
  if (p.source_kind === "text" && (p.source_id || p.references?.length)) ctx.addIssue({ code: "custom", message: "Texte invalide" });
  if (p.source_kind === "references" && (p.source_id || !p.references || !attested ||
    new Set(p.references.map(r => `${r.kind}:${r.id}`)).size !== p.references.length))
    ctx.addIssue({ code: "custom", message: "Références invalides" });
}
const submitSchema = z.object({ action: z.literal("submit"), workspace_id: z.string().uuid(), job_id: z.string().uuid() });
const statusSchema = z.object({ action: z.literal("status"), workspace_id: z.string().uuid(), job_id: z.string().uuid() });
const listSchema = z.object({ action: z.literal("list"), workspace_id: z.string().uuid() });
const listSourcesSchema = z.object({ action: z.literal("list_sources"), workspace_id: z.string().uuid() });
const sessionId = z.string().uuid();
const sessionCreateSchema = z.object({ action: z.literal("session_create"), workspace_id: sessionId,
  session_id: sessionId, title: z.string().trim().min(1).max(120).optional() });
const sessionListSchema = z.object({ action: z.literal("session_list"), workspace_id: sessionId,
  page: z.number().int().min(0).max(10000).default(0) });
const sessionGetSchema = z.object({ action: z.literal("session_get"), workspace_id: sessionId, session_id: sessionId });
const sessionSaveSchema = z.object({ action: z.literal("session_save"), workspace_id: sessionId,
  session_id: sessionId, draft: z.record(z.unknown()), title: z.string().trim().min(1).max(120).optional() });
const sessionArchiveSchema = z.object({ action: z.literal("session_archive"),
  workspace_id: sessionId, session_id: sessionId });
const sessionRestoreSchema = z.object({ action: z.literal("session_restore"),
  workspace_id: sessionId, session_id: sessionId });
const librarySchema = z.object({ action: z.literal("library"), workspace_id: sessionId,
  page: z.number().int().min(0).max(10000).default(0),
  search: z.string().trim().max(100).default(""), sort: z.enum(["newest", "oldest"]).default("newest") });
const legacyJobsSchema = z.object({ action: z.literal("legacy_jobs"), workspace_id: sessionId,
  page: z.number().int().min(0).max(10000).default(0) });
const bodySchema = z.discriminatedUnion("action", [prepareSchema, quoteSchema, submitSchema, statusSchema, listSchema,
  listSourcesSchema, sessionCreateSchema, sessionListSchema, sessionGetSchema, sessionSaveSchema,
  sessionArchiveSchema, sessionRestoreSchema, librarySchema, legacyJobsSchema])
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
// Cohorte (ex. BDMMA) : espaces inscrits dans studio_video_cohort_access. Budget propre, séparé de l'essai
// ci-dessus. Deux clés à tourner pour l'ouvrir : HIGGSFIELD_VIDEO_ENABLED=true ET une limite d'environnement
// HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD > 0 (qui ne peut que baisser ces plafonds).
export const COHORT_TOTAL_LIMIT_USD = 110;
export const COHORT_WORKSPACE_LIMIT_USD = 8;
export const COHORT_WORKSPACE_MAX_SUBMISSIONS = 2;
// Forfaits (grille du 01/10/2026) : la vidéo est incluse dans les plans payants,
// PLAN_LIMITS[plan].video clips par mois et par espace (Premium 3, Binôme 6).
// Un clip de forfait coûte au plus PLAN_CLIP_LIMIT_USD (≈ 480p jusqu'à 8 s au
// tarif Seedance 2.5 relevé le 29/09 : 0,2056 $/s + 10 % de marge = 1,81 $).
// PLAN_TOTAL_LIMIT_USD = garde-fou GLOBAL du mois pour toutes les abonnées
// réunies (la variable d'environnement peut seulement l'abaisser).
export const PLAN_CLIP_LIMIT_USD = 2;
export const PLAN_TOTAL_LIMIT_USD = 100;
export type VideoLane = "trial" | "cohort" | "plan";
export interface VideoAccess { lane: VideoLane; planClips: number }
export function planVideoClips(plan: string) { return PLAN_LIMITS[plan]?.video ?? 0; }
// Priorité : l'espace d'essai (réglages de test) > le forfait payant > la cohorte.
async function videoAccess(db: DB, workspace: string, userId: string): Promise<VideoAccess | null> {
  if (workspaceAllowed(workspace)) return { lane: "trial", planClips: 0 };
  const planClips = planVideoClips(await getEffectivePlan(db, userId, workspace));
  if (planClips > 0) return { lane: "plan", planClips };
  const { data, error } = await db.from("studio_video_cohort_access").select("workspace_id")
    .eq("workspace_id", workspace).maybeSingle();
  if (error) throw error;
  return data ? { lane: "cohort", planClips: 0 } : null;
}
function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
function switchedOn() {
  return Deno.env.get("HIGGSFIELD_VIDEO_ENABLED") === "true" && !!Deno.env.get("HIGGSFIELD_API_KEY");
}
export function ceilingUsd(lane: VideoLane | null) {
  const limit = Number(Deno.env.get("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD"));
  // The configured value can only lower the ceiling, never raise it.
  if (!lane || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(limit, lane === "cohort" ? COHORT_TOTAL_LIMIT_USD : lane === "plan" ? PLAN_TOTAL_LIMIT_USD : TRIAL_TOTAL_LIMIT_USD);
}
export function maxQuoteUsd(lane: VideoLane | null) {
  if (lane === "cohort") return Math.min(COHORT_WORKSPACE_LIMIT_USD, ceilingUsd(lane));
  if (lane === "plan") return Math.min(PLAN_CLIP_LIMIT_USD, ceilingUsd(lane));
  return ceilingUsd(lane);
}
async function submittedCount(db: DB, lane: VideoLane, workspace: string) {
  let query = db.from("studio_video_jobs").select("id", { count: "exact", head: true })
    .not("submitted_at", "is", null).not("status", "in", `(${NON_BILLED_STATUSES.join(",")})`);
  if (lane === "cohort") query = query.eq("workspace_id", workspace);
  // Forfait : clips de CE mois, lancés au titre du forfait, dans cet espace.
  else if (lane === "plan") query = query.eq("workspace_id", workspace).eq("billing_lane", "plan").gte("submitted_at", monthStartIso());
  else {
    // L'essai ne compte pas les clips lancés au titre d'un forfait.
    query = query.or("billing_lane.is.null,billing_lane.neq.plan");
    // L'essai historique ne compte pas les clips de la cohorte.
    const { data, error: cohortError } = await db.from("studio_video_cohort_access").select("workspace_id");
    if (cohortError) throw cohortError;
    const ids = (data || []).map(r => r.workspace_id as string);
    if (ids.length) query = query.not("workspace_id", "in", `(${ids.join(",")})`);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}
function maxSubmissions(lane: VideoLane, planClips = 0) {
  return lane === "cohort" ? COHORT_WORKSPACE_MAX_SUBMISSIONS : lane === "plan" ? planClips : TRIAL_MAX_SUBMISSIONS;
}
export function exhaustedMessage(lane: VideoLane, planClips = 0) {
  return lane === "plan"
    ? `Tu as utilisé tes ${planClips} vidéos du mois. Elles se renouvellent le 1er du mois.`
    : "Le nombre de lancements d’essai est atteint.";
}
export function overQuoteMessage(lane: VideoLane) {
  return lane === "plan"
    ? "Avec ton forfait, un clip va jusqu’à 8 secondes en 480p. Raccourcis-le ou passe en 480p."
    : "Ce devis dépasse le plafond de la recette vidéo.";
}
export function claimFailureMessage(error: { message: string; code?: string }) {
  if (error.code === "23505" && error.message.includes("studio_video_one_active"))
    return "Un autre clip est en cours. Attends son résultat avant de lancer celui-ci ; si le devis expire, vérifie à nouveau le prix.";
  if (error.message.includes("video_month_exhausted")) return "Tu as utilisé tes vidéos du mois. Elles se renouvellent le 1er du mois.";
  if (error.message.includes("video_clip_too_expensive")) return overQuoteMessage("plan");
  if (error.message.includes("video_trial_exhausted")) return "Le nombre de lancements d’essai est atteint.";
  if (error.message.includes("video_budget_workspace")) return "Tu as atteint ton plafond de clips vidéo pour cet atelier.";
  if (error.message.includes("video_budget")) return "Le plafond vidéo de cet espace est atteint.";
  if (error.message.includes("video_quote_expired")) return "Ce devis a expiré. Vérifie à nouveau le prix.";
  return "La génération ne peut pas démarrer.";
}
function safeJob(row: Record<string, unknown>, signedUrl: string | null = null, actor?: string) {
  return {
    id: row.id, workspace_id: row.workspace_id, source_kind: row.source_kind,
    session_id: row.session_id, display_name: row.display_name,
    source_id: row.source_id, source_name: row.source_name, source_refs: row.source_refs,
    prompt: row.prompt, duration: row.duration, resolution: row.resolution,
    preparation: row.preparation,
    aspect_ratio: row.aspect_ratio, model: row.model, status: row.status,
    estimated_usd: row.estimated_usd, estimated_credits: row.estimated_credits,
    quote_expires_at: row.quote_expires_at, created_at: row.created_at,
    error_code: row.error_code, video_url: signedUrl,
    can_submit: !!actor && row.user_id === actor,
  };
}
async function quoteKey(token: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
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
    return { bucket: "user-photos", path: data.storage_path as string, name: (data.name || "Photo").slice(0, 120) };
  }
  const { data, error } = await db.from("visual_studio_versions")
    .select("id,status,result_path,visual_studio_sessions!inner(name)")
    .eq("id", id).eq("workspace_id", workspace).maybeSingle();
  if (error || !data || data.status !== "ready") throw new Error("studio_video_source_unavailable");
  const session = data.visual_studio_sessions as unknown as { name?: string };
  return { bucket: "visual-studio", path: data.result_path as string, name: (session?.name || "Création du Studio").slice(0, 120) };
}
type SourceRef = { kind: "photo" | "studio_version"; id: string; role: string; name?: string };
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
    if (["prepare", "quote", "submit", "session_create", "session_save", "session_archive", "session_restore"].includes(p.action) && !writable)
      return json({ error: "Cet espace est en lecture seule." }, 403);
    const access = await videoAccess(db, p.workspace_id, pipe.userId);
    const lane = access?.lane ?? null, planClips = access?.planClips ?? 0;
    const on = !!lane && switchedOn() && ceilingUsd(lane) > 0;
    // Pourquoi la création est fermée : pas de forfait qui inclut la vidéo, ou interrupteur coupé.
    const accessReason = on ? null : lane ? "off" : "plan_required";

    if (p.action === "session_create") {
      const { error } = await db.from("studio_video_sessions").insert({ id: p.session_id,
        workspace_id: p.workspace_id, user_id: pipe.userId, title: p.title || "Nouvelle idée" });
      if (error && error.code !== "23505") throw error;
      const { data } = await db.from("studio_video_sessions").select("*")
        .eq("id", p.session_id).eq("workspace_id", p.workspace_id).maybeSingle();
      if (!data) return json({ error: "Session indisponible." }, 404);
      return json({ session: data });
    }
    if (p.action === "session_list") {
      const start = p.page * 40;
      const { data, count, error } = await db.from("studio_video_sessions").select("id,title,archived_at,created_at,updated_at", { count: "exact" })
        .eq("workspace_id", p.workspace_id).order("updated_at", { ascending: false }).range(start, start + 39);
      if (error) throw error;
      return json({ sessions: data || [], total: count || 0 });
    }
    if (p.action === "session_get" || p.action === "session_save" || p.action === "session_archive" || p.action === "session_restore") {
      const { data: session, error: sessionError } = await db.from("studio_video_sessions").select("*")
        .eq("id", p.session_id).eq("workspace_id", p.workspace_id).maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) return json({ error: "Session indisponible dans cet espace." }, 404);
      if (p.action === "session_save") {
        if (session.archived_at) return json({ error: "Restaure cette session avant de la modifier." }, 409);
        if (JSON.stringify(p.draft).length > 12_000) return json({ error: "Brouillon trop long." }, 400);
        const { data, error } = await db.from("studio_video_sessions").update({ draft: p.draft,
          title: p.title || session.title, updated_at: new Date().toISOString() })
          .eq("id", p.session_id).eq("workspace_id", p.workspace_id).is("archived_at", null).select("*").single();
        if (error) throw error;
        return json({ session: data });
      }
      if (p.action === "session_archive" || p.action === "session_restore") {
        const { data, error } = await db.from("studio_video_sessions")
          .update({ archived_at: p.action === "session_archive" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString() })
          .eq("id", p.session_id).eq("workspace_id", p.workspace_id).select("*").single();
        if (error) throw error;
        return json({ session: data });
      }
      const { data: events, error: eventError } = await db.from("studio_video_session_events").select("id,kind,content,created_at")
        .eq("session_id", p.session_id).eq("workspace_id", p.workspace_id)
        .order("created_at", { ascending: true }).limit(300);
      if (eventError) throw eventError;
      const { data: rows, error: jobsError } = await db.from("studio_video_jobs").select("*")
        .eq("workspace_id", p.workspace_id).eq("session_id", p.session_id)
        .order("created_at", { ascending: true }).limit(300);
      if (jobsError) throw jobsError;
      return json({ session, events: events || [], enabled: on, access_reason: accessReason, plan_clips: planClips, jobs: await Promise.all((rows || []).map(async row =>
        safeJob(row, row.status === "ready" ? await signed(db, row) : null, pipe.userId))) });
    }
    if (p.action === "library") {
      const start = p.page * 24;
      let query = db.from("studio_video_jobs").select("*", { count: "exact" })
        .eq("workspace_id", p.workspace_id).eq("status", "ready");
      if (p.search) query = query.ilike("display_name", `%${p.search.replace(/[%_,()]/g, " ")}%`);
      const { data, count, error } = await query.order("created_at", { ascending: p.sort === "oldest" })
        .order("id", { ascending: p.sort === "oldest" }).range(start, start + 23);
      if (error) throw error;
      return json({ jobs: await Promise.all((data || []).map(async row => safeJob(row, await signed(db, row), pipe.userId))), total: count || 0 });
    }
    if (p.action === "legacy_jobs") {
      const start = p.page * 24;
      const { data, count, error } = await db.from("studio_video_jobs").select("*", { count: "exact" })
        .eq("workspace_id", p.workspace_id).is("session_id", null).neq("status", "ready")
        .order("created_at", { ascending: false }).range(start, start + 23);
      if (error) throw error;
      return json({ jobs: (data || []).map(row => safeJob(row, null, pipe.userId)), total: count || 0, enabled: on, access_reason: accessReason, plan_clips: planClips });
    }

    if (p.action === "list") {
      const { data, error } = await db.from("studio_video_jobs").select("*").eq("workspace_id", p.workspace_id)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return json({ enabled: on, access_reason: accessReason, plan_clips: planClips,
        jobs: await Promise.all((data || []).map(async (row) => safeJob(row, row.status === "ready" ? await signed(db, row) : null, pipe.userId))) });
    }
    if (p.action === "list_sources") {
      const { data, error } = await db.from("visual_studio_versions")
        .select("id,result_path,visual_studio_sessions!inner(name)")
        .eq("workspace_id", p.workspace_id).eq("status", "ready")
        .is("library_photo_id", null).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const eligible = data || [];
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
      if (p.session_id) {
        const { data: session } = await db.from("studio_video_sessions").select("id,archived_at")
          .eq("id", p.session_id).eq("workspace_id", p.workspace_id).maybeSingle();
        if (!session || session.archived_at) return json({ error: "Cette session vidéo doit être active dans cet espace." }, 409);
      }
      if (!on || !lane) return json({ error: "La création vidéo n’est pas encore activée." }, 503);
      if (await submittedCount(db, lane, p.workspace_id) >= maxSubmissions(lane, planClips))
        return json({ error: exhaustedMessage(lane, planClips) }, 409);
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
        duration: p.duration, resolution: p.resolution,
        aspect_ratio: preparationAspectRatio(p.source_kind, p.aspect_ratio) }, vision);
      const prompt = buildVideoPrompt(prepared, p.duration, images);
      const preparedInput = { ...p, idea: p.prompt, prompt, summary: prepared.summary, continuity: prepared.invariants,
        allowed_changes: prepared.allowed_changes, forbidden_changes: prepared.forbidden_changes };
      const token = await signPreparation(preparedInput, pipe.userId, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      if (p.session_id) {
        const { data: stillActive } = await db.from("studio_video_sessions").select("id")
          .eq("id", p.session_id).eq("workspace_id", p.workspace_id).is("archived_at", null).maybeSingle();
        if (!stillActive) return json({ error: "Cette session a été archivée pendant la préparation. Restaure-la pour continuer." }, 409);
        const { error: eventError } = await db.from("studio_video_session_events").insert([
          { id: crypto.randomUUID(), session_id: p.session_id, workspace_id: p.workspace_id,
            user_id: pipe.userId, kind: "request", content: { idea: p.user_idea || p.prompt,
              references: resolved.length ? resolved.map(({ kind, id, role, name }) => ({ kind, id, role, name }))
                : single ? [{ kind: p.source_kind, id: p.source_id, role: "subject", name: single.name }] : [],
              duration: p.duration, resolution: p.resolution, aspect_ratio: p.aspect_ratio } },
          { id: crypto.randomUUID(), session_id: p.session_id, workspace_id: p.workspace_id,
            user_id: pipe.userId, kind: "proposal", content: { summary: prepared.summary,
              continuity: prepared.invariants, allowed_changes: prepared.allowed_changes,
              forbidden_changes: prepared.forbidden_changes } },
        ]);
        if (eventError) throw eventError;
        const { error: touchError } = await db.from("studio_video_sessions").update({ updated_at: new Date().toISOString() })
          .eq("id", p.session_id).eq("workspace_id", p.workspace_id);
        if (touchError) throw touchError;
      }
      return json({ summary: prepared.summary, continuity: prepared.invariants,
        allowed_changes: prepared.allowed_changes, forbidden_changes: prepared.forbidden_changes,
        prompt, prepared_token: token });
    }
    if (p.action === "quote") {
      if (p.session_id) {
        const { data: session } = await db.from("studio_video_sessions").select("id,archived_at")
          .eq("id", p.session_id).eq("workspace_id", p.workspace_id).maybeSingle();
        if (!session || session.archived_at) return json({ error: "Cette session vidéo doit être active dans cet espace." }, 409);
      }
      if (!on || !lane) return json({ error: "La création vidéo n’est pas encore activée." }, 503);
      const preparationSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const signedForSession = !!p.prepared_token && await verifyPreparation(p.prepared_token, p, pipe.userId, preparationSecret);
      // A still-valid local preparation made before video sessions existed may
      // be brought into a new session without paying Claude a second time.
      const signedBeforeSessions = !!p.session_id && !!p.prepared_token && !signedForSession &&
        await verifyPreparation(p.prepared_token, { ...p, session_id: undefined }, pipe.userId, preparationSecret);
      if (!p.prepared_token || !p.idea || !p.summary || !p.continuity || !p.allowed_changes || !p.forbidden_changes ||
        (!signedForSession && !signedBeforeSessions))
        return json({ error: "La proposition vidéo a changé. Prépare et valide de nouveau le clip." }, 409);
      const idempotencyKey = await quoteKey(p.prepared_token);
      const { data: previousQuote, error: previousError } = await db.from("studio_video_jobs").select("*")
        .eq("quote_key", idempotencyKey).eq("workspace_id", p.workspace_id).eq("user_id", pipe.userId).maybeSingle();
      if (previousError) throw previousError;
      if (previousQuote && previousQuote.session_id !== (p.session_id || null))
        return json({ error: "Ce devis est déjà lié à une autre session." }, 409);
      if (previousQuote) return json({ job: safeJob(previousQuote,
        previousQuote.status === "ready" ? await signed(db, previousQuote) : null, pipe.userId), monthly_limit_usd: maxQuoteUsd(lane) });
      if (await submittedCount(db, lane, p.workspace_id) >= maxSubmissions(lane, planClips))
        return json({ error: exhaustedMessage(lane, planClips) }, 409);
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
      const input: VideoInput = videoInputForQuote(p.source_kind, actualPrompt,
        p.duration, p.resolution, p.aspect_ratio, inputUrls);
      const price = await estimate(input, fetch, model);
      if (price.usd > maxQuoteUsd(lane)) return json({ error: overQuoteMessage(lane) }, 409);
      if (p.session_id) {
        const { data: stillActive } = await db.from("studio_video_sessions").select("id")
          .eq("id", p.session_id).eq("workspace_id", p.workspace_id).is("archived_at", null).maybeSingle();
        if (!stillActive) return json({ error: "Cette session a été archivée pendant le devis. Restaure-la pour continuer." }, 409);
      }
      const id = crypto.randomUUID();
      const webhookToken = crypto.randomUUID();
      const { data, error } = await db.from("studio_video_jobs").insert({
        id, workspace_id: p.workspace_id, user_id: pipe.userId, session_id: p.session_id || null,
        quote_key: idempotencyKey,
        display_name: (p.display_name || p.idea || single?.name || "Clip vidéo").trim().slice(0, 120), source_kind: p.source_kind,
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
      if (error?.code === "23505" && error.message.includes("quote_key")) {
        const { data: concurrentQuote } = await db.from("studio_video_jobs").select("*")
          .eq("quote_key", idempotencyKey).eq("workspace_id", p.workspace_id).eq("user_id", pipe.userId).maybeSingle();
        if (concurrentQuote && concurrentQuote.session_id !== (p.session_id || null))
          return json({ error: "Ce devis est déjà lié à une autre session." }, 409);
        if (concurrentQuote) return json({ job: safeJob(concurrentQuote, null, pipe.userId), monthly_limit_usd: maxQuoteUsd(lane) });
      }
      if (error || !data) throw new Error("studio_video_quote_store_failed");
      return json({ job: safeJob(data), monthly_limit_usd: maxQuoteUsd(lane) });
    }

    let row = await job(db, p.workspace_id, p.job_id);
    if (p.action === "submit") {
      if (row.session_id) {
        const { data: stillActive } = await db.from("studio_video_sessions").select("id")
          .eq("id", row.session_id).eq("workspace_id", p.workspace_id).is("archived_at", null).maybeSingle();
        if (!stillActive) return json({ error: "Restaure cette session avant de lancer son devis." }, 409);
      }
      if (!on || !lane) return json({ error: "La création vidéo n’est pas encore activée." }, 503);
      if (row.status !== "quoted") return json({ job: safeJob(row, row.status === "ready" ? await signed(db, row) : null) });
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (!supabaseUrl || !supabaseUrl.startsWith("https://")) return json({ error: "Le suivi vidéo n’est pas configuré." }, 503);
      const callback = new URL(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/studio-video`);
      callback.searchParams.set("job_id", row.id);
      callback.searchParams.set("token", row.webhook_token);
      const { data: claimed, error: claimError } = await (lane === "plan"
        ? db.rpc("studio_video_claim_plan", {
          p_actor: pipe.userId, p_job: p.job_id, p_workspace: p.workspace_id,
          p_month_max_submissions: planClips, p_clip_limit: maxQuoteUsd(lane),
          p_month_total_limit: ceilingUsd(lane),
        })
        : lane === "cohort"
        ? db.rpc("studio_video_claim_cohort", {
          p_actor: pipe.userId, p_job: p.job_id, p_workspace: p.workspace_id,
          p_cohort_limit: ceilingUsd(lane), p_workspace_limit: maxQuoteUsd(lane),
          p_workspace_max_submissions: COHORT_WORKSPACE_MAX_SUBMISSIONS,
        })
        : db.rpc("studio_video_claim_trial", {
          p_actor: pipe.userId, p_job: p.job_id, p_allowed_workspace: p.workspace_id,
          p_total_limit: ceilingUsd(lane), p_max_submissions: TRIAL_MAX_SUBMISSIONS,
        }));
      if (claimError) {
        return json({ error: claimFailureMessage(claimError) }, 409);
      }
      if (!claimed) return json({ job: safeJob(await job(db, p.workspace_id, p.job_id)) });
      const input = videoInputFromJob(row);
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
    // Keep diagnosis useful without logging a user's prompt, image, or provider response.
    console.error(JSON.stringify({
      type: "studio_video_error", action: p.action,
      name: error instanceof Error ? error.name : "unknown",
      status: typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status : undefined,
      code: /^studio_video_[a-z_]+$/.test(code) ? code : undefined,
      issues: error instanceof z.ZodError
        ? error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code }))
        : undefined,
    }));
    const userMessage = code === "studio_video_source_unavailable" ? "Cette image n’est plus disponible dans cet espace." :
      code === "studio_video_grounding_conflict" ?
        "La préparation ajoute peut-être un décor, un support ou une action non demandés. Précise l’idée puis prépare à nouveau le clip." :
      error instanceof ProviderError && error.status === 403 ? "Solde API Higgsfield insuffisant." :
      "Le Studio vidéo est momentanément indisponible. Réessaie sans relancer une génération en cours.";
    return json({ error: userMessage, code: code.slice(0, 80) },
      code === "studio_video_grounding_conflict" ? 422 : 503);
  }
}

if (import.meta.main) serve(handleVideoRequest);
