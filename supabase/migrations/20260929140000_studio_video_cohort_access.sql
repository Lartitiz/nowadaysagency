-- Ouverture de la vidéo Studio à une cohorte (ex. BDMMA), avec budget séparé de l'essai historique.
CREATE TABLE IF NOT EXISTS public.studio_video_cohort_access (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  cohort text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.studio_video_cohort_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_video_cohort_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.studio_video_cohort_access TO service_role;

-- Réservation atomique d'un clip de cohorte : plafond global de cohorte, plafond et nombre de clips par espace.
CREATE OR REPLACE FUNCTION public.studio_video_claim_cohort(p_actor uuid, p_job uuid, p_workspace uuid, p_cohort_limit numeric, p_workspace_limit numeric, p_workspace_max_submissions integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j studio_video_jobs; c text; spent numeric; ws_spent numeric; ws_count integer;
BEGIN
  IF p_cohort_limit IS NULL OR p_cohort_limit <= 0 OR p_workspace_limit IS NULL OR p_workspace_limit <= 0
    OR p_workspace_max_submissions IS NULL OR p_workspace_max_submissions <= 0 THEN
    RAISE EXCEPTION 'video_budget_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('studio-video-global',282028));
  SELECT * INTO j FROM studio_video_jobs WHERE id=p_job FOR UPDATE;
  SELECT cohort INTO c FROM studio_video_cohort_access WHERE workspace_id=p_workspace;
  IF j.id IS NULL OR c IS NULL OR j.user_id IS DISTINCT FROM p_actor OR j.workspace_id IS DISTINCT FROM p_workspace
    OR NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id=j.workspace_id AND user_id=p_actor
      AND role IN ('owner','manager','editor')) THEN
    RAISE EXCEPTION 'video_forbidden' USING ERRCODE='42501';
  END IF;
  IF j.status <> 'quoted' THEN RETURN false; END IF;
  IF j.quote_expires_at <= now() THEN RAISE EXCEPTION 'video_quote_expired'; END IF;
  SELECT coalesce(sum(v.estimated_usd),0) INTO spent
    FROM studio_video_jobs v JOIN studio_video_cohort_access a ON a.workspace_id=v.workspace_id
    WHERE a.cohort=c AND v.submitted_at IS NOT NULL AND v.status NOT IN ('failed','nsfw','canceled');
  SELECT count(*), coalesce(sum(estimated_usd),0) INTO ws_count, ws_spent
    FROM studio_video_jobs WHERE workspace_id=p_workspace AND submitted_at IS NOT NULL
      AND status NOT IN ('failed','nsfw','canceled');
  IF ws_count >= p_workspace_max_submissions THEN RAISE EXCEPTION 'video_trial_exhausted'; END IF;
  IF ws_spent + j.estimated_usd > p_workspace_limit THEN RAISE EXCEPTION 'video_budget_workspace'; END IF;
  IF spent + j.estimated_usd > p_cohort_limit THEN RAISE EXCEPTION 'video_budget_exceeded'; END IF;
  UPDATE studio_video_jobs SET status='submitting_uncertain', submitted_at=now() WHERE id=j.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.studio_video_claim_cohort(uuid,uuid,uuid,numeric,numeric,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_video_claim_cohort(uuid,uuid,uuid,numeric,numeric,integer) TO service_role;

-- L'essai historique ne compte plus les clips de la cohorte (deux budgets indépendants).
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
      AND workspace_id NOT IN (SELECT workspace_id FROM studio_video_cohort_access);
  IF submissions >= p_max_submissions THEN RAISE EXCEPTION 'video_trial_exhausted'; END IF;
  IF spent + j.estimated_usd > p_total_limit THEN RAISE EXCEPTION 'video_budget_exceeded'; END IF;
  UPDATE studio_video_jobs SET status='submitting_uncertain', submitted_at=now() WHERE id=j.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.studio_video_claim_trial(uuid,uuid,uuid,numeric,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_video_claim_trial(uuid,uuid,uuid,numeric,integer) TO service_role;

-- Outil d'ouverture, à lancer à la main dans l'éditeur SQL une fois les comptes créés :
--   SELECT public.studio_video_grant_cohort('bdmma', ARRAY['mail1@exemple.fr','mail2@exemple.fr']);
-- Retourne le nombre d'espaces ouverts (espaces dont la personne est propriétaire).
CREATE OR REPLACE FUNCTION public.studio_video_grant_cohort(p_cohort text, p_emails text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  INSERT INTO studio_video_cohort_access (workspace_id, cohort)
  SELECT DISTINCT m.workspace_id, p_cohort
    FROM workspace_members m JOIN auth.users u ON u.id = m.user_id
    WHERE m.role = 'owner' AND lower(u.email) = ANY (SELECT lower(e) FROM unnest(p_emails) e)
  ON CONFLICT (workspace_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.studio_video_grant_cohort(text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.studio_video_grant_cohort(text,text[]) TO service_role;
