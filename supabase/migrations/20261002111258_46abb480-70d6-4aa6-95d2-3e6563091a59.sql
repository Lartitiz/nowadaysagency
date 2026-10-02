-- Vidéo Studio : le verrou « un seul clip en cours pour TOUTE l'application »
-- (V1, index unique sur (true)) bloquait toutes les abonnées dès qu'une seule
-- générait un clip, depuis l'ouverture de la vidéo aux forfaits (01/10/2026).
-- Nouveau verrou : un clip en cours PAR ESPACE. Les plafonds de dépense restent
-- sérialisés par le verrou consultatif des fonctions de réservation, et le
-- nombre de clips simultanés au titre des forfaits est borné globalement dans
-- studio_video_claim_plan (Higgsfield peut limiter la concurrence par compte).
DROP INDEX IF EXISTS public.studio_video_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS studio_video_one_active_workspace ON public.studio_video_jobs (workspace_id)
  WHERE status IN ('submitting_uncertain','queued','in_progress','archiving');

-- Même corps que la version du 01/10, plus un plafond de clips simultanés
-- (tous espaces confondus) au titre des forfaits : p_max_active.
-- Nouvelle surcharge à 7 arguments : l'ancienne (6 arguments) reste en place
-- pour que la version déployée de studio-video continue de fonctionner entre
-- l'application de cette migration et son redéploiement.
CREATE OR REPLACE FUNCTION public.studio_video_claim_plan(p_actor uuid, p_job uuid, p_workspace uuid,
  p_month_max_submissions integer, p_clip_limit numeric, p_month_total_limit numeric, p_max_active integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j studio_video_jobs; month_start timestamptz; spent numeric; ws_count integer; active integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'video_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_month_max_submissions IS NULL OR p_month_max_submissions <= 0 OR p_clip_limit IS NULL OR p_clip_limit <= 0
    OR p_month_total_limit IS NULL OR p_month_total_limit <= 0 OR p_max_active IS NULL OR p_max_active <= 0 THEN
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
  SELECT count(*) INTO active FROM studio_video_jobs
    WHERE billing_lane='plan' AND status IN ('submitting_uncertain','queued','in_progress','archiving');
  IF active >= p_max_active THEN RAISE EXCEPTION 'video_busy'; END IF;
  SELECT coalesce(sum(estimated_usd),0) INTO spent FROM studio_video_jobs
    WHERE billing_lane='plan' AND submitted_at >= month_start AND status NOT IN ('failed','nsfw','canceled');
  IF spent + j.estimated_usd > p_month_total_limit THEN RAISE EXCEPTION 'video_budget_exceeded'; END IF;
  UPDATE studio_video_jobs SET status='submitting_uncertain', submitted_at=now(), billing_lane='plan' WHERE id=j.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.studio_video_claim_plan(uuid,uuid,uuid,integer,numeric,numeric,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_video_claim_plan(uuid,uuid,uuid,integer,numeric,numeric,integer) TO service_role;