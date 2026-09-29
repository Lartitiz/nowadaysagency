-- Keep historical clips as they are. A session is attached only to new work.
CREATE TABLE public.studio_video_sessions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nouvelle idée' CHECK (length(title) BETWEEN 1 AND 120),
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id)
);
CREATE INDEX studio_video_sessions_workspace ON public.studio_video_sessions(workspace_id, updated_at DESC);
CREATE TABLE public.studio_video_session_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('request','proposal')),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, workspace_id)
    REFERENCES public.studio_video_sessions(id, workspace_id) ON DELETE CASCADE
);
CREATE INDEX studio_video_events_session ON public.studio_video_session_events(session_id, created_at, id);
ALTER TABLE public.studio_video_jobs ADD COLUMN session_id uuid;
ALTER TABLE public.studio_video_jobs ADD COLUMN display_name text;
ALTER TABLE public.studio_video_jobs ADD COLUMN quote_key text UNIQUE;
ALTER TABLE public.studio_video_jobs ADD CONSTRAINT studio_video_job_session_workspace
  FOREIGN KEY (session_id, workspace_id)
  REFERENCES public.studio_video_sessions(id, workspace_id);
UPDATE public.studio_video_jobs SET display_name = left(
  coalesce(nullif(trim(preparation->>'idea'), ''), nullif(trim(source_name), ''), 'Clip vidéo'), 120)
WHERE display_name IS NULL;
CREATE INDEX studio_video_ready_library ON public.studio_video_jobs(workspace_id, created_at DESC, id)
  WHERE status = 'ready';
ALTER TABLE public.studio_video_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_video_session_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_video_sessions, public.studio_video_session_events FROM anon, authenticated;
GRANT ALL ON public.studio_video_sessions, public.studio_video_session_events TO service_role;
