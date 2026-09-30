-- Forfaits (grille du 01/10/2026) : la vidéo Studio est incluse dans les plans
-- payants — Premium 3 clips/mois, Binôme 6 (PLAN_LIMITS.video côté edge).
-- Chaque clip lancé au titre d'un forfait est marqué billing_lane = 'plan' : il
-- compte dans le quota MENSUEL de son espace et dans le garde-fou global du
-- mois, et plus jamais dans le budget d'essai historique.
ALTER TABLE public.studio_video_jobs ADD COLUMN IF NOT EXISTS billing_lane text;

-- Réservation atomique d'un clip de forfait : nombre de clips du mois dans
-- l'espace, prix maximal d'un clip, garde-fou global du mois (tous forfaits).
CREATE OR REPLACE FUNCTION public.studio_video_claim_plan(p_actor uuid, p_job uuid, p_workspace uuid,
  p_month_max_submissions integer, p_clip_limit numeric, p_month_total_limit numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j studio_video_jobs; month_start timestamptz; spent numeric; ws_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'video_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_month_max_submissions IS NULL OR p_month_max_submissions <= 0 OR p_clip_limit IS NULL OR p_clip_limit <= 0
    OR p_month_total_limit IS NULL OR p_month_total_limit <= 0 THEN
    RAISE EXCEPTION 'video_budget_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('studio-video-global',282028));
  SELECT * INTO j FROM studio_video_jobs WHERE id=p_job FOR UPDATE;
  IF j.id IS NULL OR j.user_id IS DISTINCT FROM p_actor OR j.workspace_id IS DISTINCT FROM p_workspace
    OR NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id=j.workspace_id AND user_id=p_actor
      AND role IN ('owner','manager','editor')) THEN
    RAISE EXCEPTION 'video_forbidden' USING ERRCODE='42501';
  END IF;
  IF j.status <> 'quoted' THEN RETURN false; END IF;
  IF j.quote_expires_at <= now() THEN RAISE EXCEPTION 'video_quote_expired'; END IF;
  IF j.estimated_usd > p_clip_limit THEN RAISE EXCEPTION 'video_clip_too_expensive'; END IF;
  month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT count(*) INTO ws_count FROM studio_video_jobs
    WHERE workspace_id=p_workspace AND billing_lane='plan' AND submitted_at >= month_start
      AND status NOT IN ('failed','nsfw','canceled');
  IF ws_count >= p_month_max_submissions THEN RAISE EXCEPTION 'video_month_exhausted'; END IF;
  SELECT coalesce(sum(estimated_usd),0) INTO spent FROM studio_video_jobs
    WHERE billing_lane='plan' AND submitted_at >= month_start AND status NOT IN ('failed','nsfw','canceled');
  IF spent + j.estimated_usd > p_month_total_limit THEN RAISE EXCEPTION 'video_budget_exceeded'; END IF;
  UPDATE studio_video_jobs SET status='submitting_uncertain', submitted_at=now(), billing_lane='plan' WHERE id=j.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.studio_video_claim_plan(uuid,uuid,uuid,integer,numeric,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_video_claim_plan(uuid,uuid,uuid,integer,numeric,numeric) TO service_role;

-- L'essai historique ne compte plus les clips lancés au titre d'un forfait
-- (sinon les abonnées consommeraient le budget d'essai). Corps identique à la
-- version du 29/09, avec le filtre billing_lane en plus.
CREATE OR REPLACE FUNCTION public.studio_video_claim_trial(p_actor uuid, p_job uuid, p_allowed_workspace uuid, p_total_limit numeric, p_max_submissions integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j studio_video_jobs; spent numeric; submissions integer;
BEGIN
  IF p_total_limit IS NULL OR p_total_limit <= 0 OR p_max_submissions IS NULL OR p_max_submissions <= 0 THEN
    RAISE EXCEPTION 'video_budget_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('studio-video-global',282028));
  SELECT * INTO j FROM studio_video_jobs WHERE id=p_job FOR UPDATE;
  IF j.id IS NULL OR j.user_id IS DISTINCT FROM p_actor OR j.workspace_id IS DISTINCT FROM p_allowed_workspace
    OR NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id=j.workspace_id AND user_id=p_actor
      AND role IN ('owner','manager','editor')) THEN
    RAISE EXCEPTION 'video_forbidden' USING ERRCODE='42501';
  END IF;
  IF j.status <> 'quoted' THEN RETURN false; END IF;
  IF j.quote_expires_at <= now() THEN RAISE EXCEPTION 'video_quote_expired'; END IF;
  SELECT count(*), coalesce(sum(estimated_usd),0) INTO submissions, spent
    FROM studio_video_jobs WHERE submitted_at IS NOT NULL
      AND status NOT IN ('failed','nsfw','canceled')
      AND coalesce(billing_lane, '') <> 'plan'
      AND workspace_id NOT IN (SELECT workspace_id FROM studio_video_cohort_access);
  IF submissions >= p_max_submissions THEN RAISE EXCEPTION 'video_trial_exhausted'; END IF;
  IF spent + j.estimated_usd > p_total_limit THEN RAISE EXCEPTION 'video_budget_exceeded'; END IF;
  UPDATE studio_video_jobs SET status='submitting_uncertain', submitted_at=now() WHERE id=j.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.studio_video_claim_trial(uuid,uuid,uuid,numeric,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_video_claim_trial(uuid,uuid,uuid,numeric,integer) TO service_role;