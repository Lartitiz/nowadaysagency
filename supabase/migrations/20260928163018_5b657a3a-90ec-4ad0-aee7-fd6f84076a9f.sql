-- Seedance clips live independently of photo versions and Reel projects.
-- Provision the private `studio-video` Storage bucket natively with a 150 MB
-- file limit before deploying the function; this platform rejects bucket SQL.
CREATE TABLE public.studio_video_jobs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('photo','studio_version')),
  source_id uuid NOT NULL,
  source_name text NOT NULL CHECK (length(source_name) BETWEEN 1 AND 120),
  person_free_attested boolean NOT NULL CHECK (person_free_attested),
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 3 AND 1000),
  duration integer NOT NULL CHECK (duration BETWEEN 4 AND 10),
  resolution text NOT NULL CHECK (resolution IN ('480p','720p')),
  model text NOT NULL DEFAULT 'bytedance/seedance-2.5/image-to-video',
  estimated_usd numeric(10,4) NOT NULL CHECK (estimated_usd > 0),
  estimated_credits numeric(12,3) NOT NULL CHECK (estimated_credits > 0),
  input_url text NOT NULL,
  webhook_token uuid NOT NULL,
  status text NOT NULL CHECK (status IN
    ('quoted','submitting_uncertain','queued','in_progress','archiving','ready','failed','nsfw','canceled')),
  provider_request_id uuid UNIQUE,
  provider_correlation_id text,
  provider_video_url text,
  result_path text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  quote_expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  completed_at timestamptz,
  CHECK ((status <> 'ready') OR result_path IS NOT NULL)
);
CREATE INDEX studio_video_jobs_workspace ON public.studio_video_jobs(workspace_id,created_at DESC);
CREATE UNIQUE INDEX studio_video_one_active ON public.studio_video_jobs ((true))
  WHERE status IN ('submitting_uncertain','queued','in_progress','archiving');
ALTER TABLE public.studio_video_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_video_jobs FROM anon,authenticated;
GRANT ALL ON public.studio_video_jobs TO service_role;

-- Claim exactly once, and reserve the full estimated cost before the paid POST.
-- An uncertain submission remains reserved until reconciled manually.
CREATE FUNCTION public.studio_video_claim(p_actor uuid,p_job uuid,p_monthly_limit numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j studio_video_jobs; reserved numeric; global_reserved numeric;
BEGIN
  IF p_monthly_limit IS NULL OR p_monthly_limit <= 0 THEN RAISE EXCEPTION 'video_budget_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('studio-video-global',282028));
  SELECT * INTO j FROM studio_video_jobs WHERE id=p_job FOR UPDATE;
  IF j.id IS NULL OR j.user_id IS DISTINCT FROM p_actor OR NOT EXISTS (
    SELECT 1 FROM workspace_members WHERE workspace_id=j.workspace_id AND user_id=p_actor
    AND role IN ('owner','manager','editor')) THEN
    RAISE EXCEPTION 'video_forbidden' USING ERRCODE='42501';
  END IF;
  IF j.status <> 'quoted' THEN RETURN false; END IF;
  IF j.quote_expires_at <= now() THEN RAISE EXCEPTION 'video_quote_expired'; END IF;
  SELECT coalesce(sum(estimated_usd),0) INTO reserved FROM studio_video_jobs
   WHERE workspace_id=j.workspace_id AND submitted_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
     AND status IN ('submitting_uncertain','queued','in_progress','archiving','ready');
  SELECT coalesce(sum(estimated_usd),0) INTO global_reserved FROM studio_video_jobs
   WHERE submitted_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
     AND status IN ('submitting_uncertain','queued','in_progress','archiving','ready');
  IF reserved+j.estimated_usd > p_monthly_limit OR global_reserved+j.estimated_usd > p_monthly_limit
   THEN RAISE EXCEPTION 'video_budget_exceeded'; END IF;
  UPDATE studio_video_jobs SET status='submitting_uncertain',submitted_at=now() WHERE id=j.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.studio_video_claim(uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_video_claim(uuid,uuid,numeric) TO service_role;