CREATE TABLE public.studio_image_requests (
 version_id uuid PRIMARY KEY REFERENCES public.visual_studio_versions(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 provider_id uuid UNIQUE,
 callback_token uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','submitting','uncertain','queued','in_progress','completed','failed')),
 estimated_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(estimated_usd>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.studio_image_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_image_requests FROM anon,authenticated;
GRANT ALL ON public.studio_image_requests TO service_role;
CREATE OR REPLACE FUNCTION public.studio_reserve_image_cost(p_version uuid,p_estimate numeric,p_monthly_limit numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r studio_image_requests; used numeric;
BEGIN
 IF p_estimate IS NULL OR p_estimate<=0 OR p_monthly_limit IS NULL OR p_monthly_limit<=0 THEN RAISE EXCEPTION 'studio_provider_budget'; END IF;
 PERFORM pg_advisory_xact_lock(282026,2028);
 SELECT * INTO r FROM studio_image_requests WHERE version_id=p_version FOR UPDATE;
 IF r.version_id IS NULL OR r.status IS DISTINCT FROM 'preparing' THEN RETURN false; END IF;
 SELECT coalesce(sum(estimated_usd),0) INTO used FROM studio_image_requests
 WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND status<>'failed';
 IF used+p_estimate>p_monthly_limit THEN RAISE EXCEPTION 'studio_provider_budget'; END IF;
 UPDATE studio_image_requests SET status='submitting',estimated_usd=p_estimate WHERE version_id=p_version;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.studio_reserve_image_cost(uuid,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_reserve_image_cost(uuid,numeric,numeric) TO service_role;
