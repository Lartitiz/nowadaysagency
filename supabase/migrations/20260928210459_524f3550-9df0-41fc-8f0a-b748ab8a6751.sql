CREATE OR REPLACE FUNCTION public.studio_video_claim_trial(p_actor uuid, p_job uuid, p_allowed_workspace uuid, p_total_limit numeric, p_max_submissions integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j studio_video_jobs; spent numeric; submissions integer;
BEGIN
  IF p_total_limit IS NULL OR p_total_limit <= 0 OR p_max_submissions IS NULL OR p_max_submissions <= 0 THEN
    RAISE EXCEPTION 'video_budget_unavailable'; END IF;
  -- Same lock as studio_video_claim: every claim is serialized globally.
  PERFORM pg_advisory_xact_lock(hashtextextended('studio-video-global',282028));
  SELECT * INTO j FROM studio_video_jobs WHERE id=p_job FOR UPDATE;
  IF j.id IS NULL OR j.user_id IS DISTINCT FROM p_actor OR j.workspace_id IS DISTINCT FROM p_allowed_workspace
    OR NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id=j.workspace_id AND user_id=p_actor
      AND role IN ('owner','manager','editor')) THEN
    RAISE EXCEPTION 'video_forbidden' USING ERRCODE='42501';
  END IF;
  IF j.status <> 'quoted' THEN RETURN false; END IF;
  IF j.quote_expires_at <= now() THEN RAISE EXCEPTION 'video_quote_expired'; END IF;
  -- Lifetime totals (no monthly reset); every submitted job counts, whatever its outcome.
  SELECT count(*), coalesce(sum(estimated_usd),0) INTO submissions, spent
    FROM studio_video_jobs WHERE submitted_at IS NOT NULL;
  IF submissions >= p_max_submissions THEN RAISE EXCEPTION 'video_trial_exhausted'; END IF;
  IF spent + j.estimated_usd > p_total_limit THEN RAISE EXCEPTION 'video_budget_exceeded'; END IF;
  UPDATE studio_video_jobs SET status='submitting_uncertain', submitted_at=now() WHERE id=j.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.studio_video_claim_trial(uuid,uuid,uuid,numeric,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_video_claim_trial(uuid,uuid,uuid,numeric,integer) TO service_role;