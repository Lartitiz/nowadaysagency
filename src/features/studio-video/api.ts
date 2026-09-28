import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

export interface StudioVideoJob {
  id: string;
  workspace_id: string;
  source_kind: "photo" | "studio_version";
  source_id: string;
  source_name: string;
  prompt: string;
  duration: number;
  resolution: "480p" | "720p";
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
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const detail = await context.json().catch(() => null);
      if (detail?.error) throw new Error(detail.error);
    }
    throw new Error("Le Studio vidéo est indisponible. Réessaie.");
  }
  if (data?.error && !data?.job) throw new Error(data.error);
  return data as T;
}

export function listStudioVideos(workspaceId: string) {
  return videoRequest<{ jobs: StudioVideoJob[]; enabled?: boolean }>({ action: "list", workspace_id: workspaceId });
}

export function readStudioVideo(workspaceId: string, jobId: string) {
  return videoRequest<{ job: StudioVideoJob; error?: string }>({ action: "status", workspace_id: workspaceId, job_id: jobId });
}
