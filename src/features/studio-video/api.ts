import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

export interface StudioVideoJob {
  id: string;
  workspace_id: string;
  source_kind: "photo" | "studio_version" | "text" | "references";
  source_id: string | null;
  source_name: string;
  source_refs?: Array<{ kind: "photo" | "studio_version"; id: string; role: string; name: string }>;
  prompt: string;
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
}

export async function videoRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await invokeWithTimeout("studio-video", { body }, 65_000);
  // A failed submission can still return its durable job (including uncertain status).
  if (data?.job) return data as T;
  if (error || data?.error) throw new Error(data?.message || data?.error || error?.message || "Le Studio vidéo est indisponible. Réessaie.");
  return data as T;
}

export function listStudioVideos(workspaceId: string) {
  return videoRequest<{ jobs: StudioVideoJob[]; enabled?: boolean }>({ action: "list", workspace_id: workspaceId });
}

export function readStudioVideo(workspaceId: string, jobId: string) {
  return videoRequest<{ job: StudioVideoJob; error?: string }>({ action: "status", workspace_id: workspaceId, job_id: jobId });
}
