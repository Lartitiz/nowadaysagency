-- Additive: historic values and tenant assignments are untouched.
ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS metric_provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Older writers cannot leave a changed number labelled as an unchanged GA4 reading.
CREATE OR REPLACE FUNCTION public.invalidate_stats_provenance() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['website_visitors','ga4_users','traffic_search','traffic_social','traffic_pinterest','traffic_instagram'] LOOP
    IF to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k AND
       NEW.metric_provenance->k IS NOT DISTINCT FROM OLD.metric_provenance->k THEN
      NEW.metric_provenance := jsonb_set(NEW.metric_provenance,ARRAY[k],jsonb_build_object('source','manual','at',now()));
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER monthly_stats_provenance BEFORE UPDATE ON public.monthly_stats
FOR EACH ROW EXECUTE FUNCTION public.invalidate_stats_provenance();

-- Shared save contract: locked snapshot + partial patch, never a blind row replacement.
CREATE OR REPLACE FUNCTION public.save_monthly_stats(
  p_workspace_id uuid, p_month date, p_expected jsonb, p_patch jsonb,
  p_source text, p_observation jsonb DEFAULT NULL, p_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE actor uuid := auth.uid(); role_name text; rows_now jsonb; old_row jsonb;
  provenance jsonb; result_row jsonb; k text; cols text; vals text; assigns text; affected int;
  ga4_fields text[] := ARRAY['website_visitors','ga4_users','traffic_search','traffic_social','traffic_pinterest','traffic_instagram'];
  property text; connection_property text;
BEGIN
  IF current_user='service_role' THEN actor:=p_user_id;
  ELSIF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Actor mismatch' USING ERRCODE='42501'; END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_workspace_id IS NOT NULL THEN
    SELECT role INTO role_name FROM public.workspace_members WHERE workspace_id=p_workspace_id AND user_id=actor;
    IF role_name IS NULL OR role_name NOT IN ('owner','manager','editor') THEN RAISE EXCEPTION 'Workspace write denied' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_month IS NULL OR extract(day FROM p_month)<>1 OR p_source IS NULL OR p_source NOT IN ('manual','import','ga4') OR
     p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb THEN RAISE EXCEPTION 'Invalid stats patch'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) key WHERE key IN ('id','user_id','workspace_id','month_date','created_at','updated_at','metric_provenance') OR
    NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='monthly_stats' AND column_name=key)) THEN RAISE EXCEPTION 'Unsupported stats field'; END IF;
  IF p_source='ga4' THEN
    property:=p_observation->>'propertyId';
    IF property IS NULL OR property !~ '^[0-9]+$' OR p_observation->>'startDate' IS DISTINCT FROM p_month::text OR
       (p_observation->>'endDate')::date < p_month OR (p_observation->>'endDate')::date >= (p_month+interval '1 month')::date OR
       p_observation->>'endDate' IS NULL OR p_observation->>'fetchedAt' IS NULL OR p_observation->>'timeZone' IS NULL OR
       p_observation->>'periodState' IS NULL OR p_observation->>'periodState' NOT IN ('partial','complete') OR
       p_observation->>'reportState' IS NULL OR p_observation->>'reportState' NOT IN ('partial','complete') THEN RAISE EXCEPTION 'Invalid GA4 observation'; END IF;
    -- Locks the connection against a simultaneous property change/disconnect.
    SELECT platform_account_id INTO connection_property FROM public.social_connections
      WHERE platform='google' AND user_id=actor AND workspace_id IS NOT DISTINCT FROM p_workspace_id FOR SHARE;
    IF NOT FOUND OR (connection_property IS NOT NULL AND connection_property<>'' AND connection_property IS DISTINCT FROM property) THEN
      RAISE EXCEPTION 'La propriété Google a changé. Relance la récupération.' USING ERRCODE='40001';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(p_patch) e WHERE NOT e.key=ANY(ga4_fields) OR jsonb_typeof(e.value)<>'number' OR
      e.value::text !~ '^[0-9]+$') THEN RAISE EXCEPTION 'Invalid GA4 metric'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly_stats:'||coalesce(p_workspace_id,actor)::text||':'||p_month::text,0));
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO rows_now FROM
    (SELECT * FROM public.monthly_stats WHERE month_date=p_month AND
      ((p_workspace_id IS NOT NULL AND workspace_id=p_workspace_id) OR (p_workspace_id IS NULL AND workspace_id IS NULL AND user_id=actor)) FOR UPDATE) t;
  IF jsonb_array_length(rows_now)>1 THEN RAISE EXCEPTION 'Plusieurs relevés existent pour ce mois. Aucun écrasement.'; END IF;
  old_row:=rows_now->0;
  IF old_row IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Les statistiques ont changé. Recharge le relevé avant de réessayer.' USING ERRCODE='40001'; END IF;
  provenance:=coalesce(old_row->'metric_provenance','{}'::jsonb);
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF k=ANY(ga4_fields) THEN
      provenance:=jsonb_set(provenance,ARRAY[k],CASE WHEN p_source='ga4' THEN
        p_observation||jsonb_build_object('source','ga4','value',p_patch->k,'unit',CASE WHEN k IN ('website_visitors','ga4_users') THEN 'users' ELSE 'sessions' END)
        ELSE jsonb_build_object('source',p_source,'at',now()) END);
    END IF;
  END LOOP;
  SELECT string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(NULL::public.monthly_stats,$1)).%I',key),','),
    string_agg(format('%I=(jsonb_populate_record(NULL::public.monthly_stats,$1)).%I',key,key),',') INTO cols,vals,assigns FROM jsonb_object_keys(p_patch) key;
  IF old_row IS NULL THEN
    EXECUTE format('INSERT INTO public.monthly_stats(user_id,workspace_id,month_date,metric_provenance,%s) SELECT $2,$3,$4,$5,%s RETURNING to_jsonb(monthly_stats)',cols,vals)
      INTO result_row USING p_patch,actor,p_workspace_id,p_month,provenance;
  ELSE
    EXECUTE format('UPDATE public.monthly_stats SET %s,metric_provenance=$2,updated_at=clock_timestamp() WHERE id=$3 RETURNING to_jsonb(monthly_stats)',assigns)
      INTO result_row USING p_patch,provenance,(old_row->>'id')::uuid;
  END IF;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 OR result_row IS NULL THEN RAISE EXCEPTION 'Aucune statistique enregistrée'; END IF;
  RETURN result_row;
END $$;
REVOKE ALL ON FUNCTION public.save_monthly_stats(uuid,date,jsonb,jsonb,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_monthly_stats(uuid,date,jsonb,jsonb,text,jsonb,uuid) TO authenticated,service_role;