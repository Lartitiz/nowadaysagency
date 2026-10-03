-- Higgsfield Marketing Studio for carousel-slide-image and product-on-model
-- (03/10/2026, direct OpenAI credit exhausted). Those functions are synchronous
-- and have no visual_studio_versions row, so their budget reservations live
-- here. HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD stays ONE monthly budget: both
-- reservation functions sum both tables under the same advisory lock.
CREATE TABLE IF NOT EXISTS public.higgsfield_image_spend (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source text NOT NULL CHECK(source IN ('carousel-slide-image','product-on-model')),
 user_id uuid NOT NULL,
 workspace_id uuid,
 provider_id uuid UNIQUE,
 status text NOT NULL DEFAULT 'submitting' CHECK(status IN ('submitting','queued','uncertain','completed','failed')),
 estimated_usd numeric(12,6) NOT NULL CHECK(estimated_usd>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS higgsfield_image_spend_created_idx ON public.higgsfield_image_spend(created_at);
ALTER TABLE public.higgsfield_image_spend ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.higgsfield_image_spend FROM anon,authenticated;
GRANT ALL ON public.higgsfield_image_spend TO service_role;

CREATE OR REPLACE FUNCTION public.higgsfield_image_month_used()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT
  (SELECT coalesce(sum(estimated_usd),0) FROM studio_image_requests
    WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND status<>'failed')
  +(SELECT coalesce(sum(estimated_usd),0) FROM higgsfield_image_spend
    WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND status<>'failed')
$$;
REVOKE ALL ON FUNCTION public.higgsfield_image_month_used() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.higgsfield_image_month_used() TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_higgsfield_image_cost(p_source text,p_user uuid,p_workspace uuid,p_estimate numeric,p_monthly_limit numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid;
BEGIN
 IF p_estimate IS NULL OR p_estimate<=0 OR p_estimate>2 OR p_monthly_limit IS NULL OR p_monthly_limit<=0 THEN RAISE EXCEPTION 'studio_provider_budget'; END IF;
 PERFORM pg_advisory_xact_lock(282026,2028);
 IF higgsfield_image_month_used()+p_estimate>p_monthly_limit THEN RAISE EXCEPTION 'studio_provider_budget'; END IF;
 INSERT INTO higgsfield_image_spend(source,user_id,workspace_id,estimated_usd)
 VALUES(p_source,p_user,p_workspace,p_estimate) RETURNING id INTO new_id;
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_higgsfield_image_cost(text,uuid,uuid,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_higgsfield_image_cost(text,uuid,uuid,numeric,numeric) TO service_role;

-- Studio reservations now count the synchronous spend too (same lock, same limit).
CREATE OR REPLACE FUNCTION public.studio_reserve_image_cost(p_version uuid,p_estimate numeric,p_monthly_limit numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r studio_image_requests;
BEGIN
 IF p_estimate IS NULL OR p_estimate<=0 OR p_monthly_limit IS NULL OR p_monthly_limit<=0 THEN RAISE EXCEPTION 'studio_provider_budget'; END IF;
 PERFORM pg_advisory_xact_lock(282026,2028);
 SELECT * INTO r FROM studio_image_requests WHERE version_id=p_version FOR UPDATE;
 IF r.version_id IS NULL OR r.status IS DISTINCT FROM 'preparing' THEN RETURN false; END IF;
 IF higgsfield_image_month_used()+p_estimate>p_monthly_limit THEN RAISE EXCEPTION 'studio_provider_budget'; END IF;
 UPDATE studio_image_requests SET status='submitting',estimated_usd=p_estimate WHERE version_id=p_version;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.studio_reserve_image_cost(uuid,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_reserve_image_cost(uuid,numeric,numeric) TO service_role;
