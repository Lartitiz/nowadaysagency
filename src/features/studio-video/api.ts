import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

export interface StudioVideoJob {
  id: string;
  workspace_id: string;
  session_id?: string | null;
  display_name?: string | null;
  source_kind: "photo" | "studio_version" | "text" | "references";
  source_id: string | null;
  source_name: string;
  source_refs?: Array<{ kind: "photo" | "studio_version"; id: string; role: string; name: string }>;
  prompt: string;
  preparation?: { idea: string; summary: string; continuity: string[]; allowed_changes: string; forbidden_changes: string } | null;
  duration: number;
  resolution: "480p" | "720p";
  aspect_ratio?: "9:16" | "16:9" | "1:1";
  model?: string;
  status: "quoted" | "submitting_uncertain" | "queued" | "in_progress" | "archiving" | "ready" | "failed" | "nsfw" | "canceled";
  estimated_usd: number | string;
  estimated_credits: number | string;
  quote_expires_at: string;
  created_at: string;
  error_code: string | null;
  video_url: string | null;
  can_submit?: boolean;
}
export function videoTitle(job: StudioVideoJob) {
  return (job.display_name || job.preparation?.idea || job.source_name || "Clip vidéo").trim();
}

export interface StudioVideoSession {
  id: string; workspace_id: string; title: string; draft: Record<string, unknown>;
  archived_at: string | null; created_at: string; updated_at: string;
}
export interface StudioVideoEvent {
  id: string; kind: "request" | "proposal"; created_at: string;
  content: { idea?: string; references?: Array<{ kind: string; id: string; role: string; name?: string }>;
    summary?: string; continuity?: string[]; allowed_changes?: string; forbidden_changes?: string };
}

export async function videoRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await invokeWithTimeout("studio-video", { body }, 65_000);
  // A failed submission can still return its durable job (including uncertain status).
  if (data?.job) return data as T;
  if (error || data?.error) throw new Error(data?.message || data?.error || error?.message || "Le Studio vidéo est indisponible. Réessaie.");
  return data as T;
}

export function listStudioVideos(workspaceId: string) {
  return videoRequest<{ jobs: StudioVideoJob[]; enabled?: boolean; access_reason?: "off" | "plan_required" | null; plan_clips?: number }>({ action: "list", workspace_id: workspaceId });
}

export function listStudioVideoSources(workspaceId: string) {
  return videoRequest<{ sources: { kind: "studio_version"; id: string; name: string; previewUrl: string | null }[] }>(
    { action: "list_sources", workspace_id: workspaceId },
  );
}

export function readStudioVideo(workspaceId: string, jobId: string) {
  return videoRequest<{ job: StudioVideoJob; error?: string }>({ action: "status", workspace_id: workspaceId, job_id: jobId });
}

export function listVideoSessions(workspaceId: string, page = 0) {
  return videoRequest<{ sessions: StudioVideoSession[]; total: number }>({ action: "session_list", workspace_id: workspaceId, page });
}
export function getVideoSession(workspaceId: string, sessionId: string) {
  return videoRequest<{ session: StudioVideoSession; events: StudioVideoEvent[]; jobs: StudioVideoJob[]; enabled: boolean; access_reason?: "off" | "plan_required" | null }>(
    { action: "session_get", workspace_id: workspaceId, session_id: sessionId });
}
export function createVideoSession(workspaceId: string, sessionId: string, title?: string) {
  return videoRequest<{ session: StudioVideoSession }>({ action: "session_create", workspace_id: workspaceId, session_id: sessionId, title });
}
const draftSaveQueues = new Map<string, Promise<unknown>>();
export function saveVideoSession(workspaceId: string, sessionId: string, draft: Record<string, unknown>, title?: string) {
  // A late response from an earlier edit must not overwrite a later draft,
  // including after navigating A → B → A in the same browser.
  const key = `${workspaceId}:${sessionId}`;
  const previous = draftSaveQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(() => videoRequest<{ session: StudioVideoSession }>(
    { action: "session_save", workspace_id: workspaceId, session_id: sessionId, draft, title }));
  draftSaveQueues.set(key, next);
  void next.finally(() => { if (draftSaveQueues.get(key) === next) draftSaveQueues.delete(key); }).catch(() => undefined);
  return next;
}
export function archiveVideoSession(workspaceId: string, sessionId: string, archive: boolean) {
  return videoRequest<{ session: StudioVideoSession }>({ action: archive ? "session_archive" : "session_restore",
    workspace_id: workspaceId, session_id: sessionId });
}
export function listVideoLibrary(workspaceId: string, page: number, search: string, sort: "newest" | "oldest") {
  return videoRequest<{ jobs: StudioVideoJob[]; total: number; enabled?: boolean; access_reason?: "off" | "plan_required" | null }>({ action: "library", workspace_id: workspaceId, page, search, sort });
}
export function listLegacyVideoJobs(workspaceId: string, page = 0) {
  return videoRequest<{ jobs: StudioVideoJob[]; total: number; enabled: boolean }>(
    { action: "legacy_jobs", workspace_id: workspaceId, page });
}
