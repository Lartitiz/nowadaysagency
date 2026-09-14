-- LinkedIn-only atomic persistence. No historic row is reassigned or deleted by migration.
ALTER TABLE public.linkedin_recommendations ADD COLUMN IF NOT EXISTS sort_order integer;

CREATE OR REPLACE FUNCTION public.linkedin_save_state(
  p_table text, p_workspace_id uuid DEFAULT NULL, p_week date DEFAULT NULL,
  p_expected jsonb DEFAULT NULL, p_rows jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid(); current_rows jsonb; result_rows jsonb;
  entry jsonb; old_row jsonb; merged jsonb; row_id uuid; allowed text[];
  cols text; vals text; assignments text; affected int; role_name text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  CASE p_table
    WHEN 'linkedin_experiences' THEN allowed := ARRAY['job_title','company','description_raw','description_optimized','sort_order'];
    WHEN 'linkedin_recommendations' THEN allowed := ARRAY['person_name','person_type','request_sent','reco_received','sort_order'];
    WHEN 'linkedin_comment_strategy' THEN allowed := ARRAY['accounts'];
    WHEN 'linkedin_profile' THEN allowed := ARRAY['title','custom_url','photo_done','banner_done','summary_storytelling','summary_pro','summary_final','title_done','url_done','featured_done','creator_mode_done'];
    WHEN 'engagement_weekly_linkedin' THEN
      allowed := ARRAY['objective','comments_target','comments_done','messages_target','messages_done','total_done','commented_accounts'];
      IF p_week IS NULL THEN RAISE EXCEPTION 'Week required'; END IF;
    ELSE RAISE EXCEPTION 'Unsupported LinkedIn table';
  END CASE;
  IF p_workspace_id IS NOT NULL THEN
    SELECT role INTO role_name FROM public.workspace_members WHERE workspace_id=p_workspace_id AND user_id=actor;
    IF role_name IS NULL OR (p_rows IS NOT NULL AND role_name NOT IN ('owner','manager','editor')) THEN
      RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501';
    END IF;
  END IF;
  -- Serializes first inserts and list saves in this exact tenant/table/week.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table || ':' || coalesce(p_workspace_id,actor)::text || ':' || coalesce(p_week::text,''),0));
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),''[]''::jsonb) FROM (SELECT * FROM public.%I WHERE (($1 IS NOT NULL AND workspace_id=$1) OR ($1 IS NULL AND workspace_id IS NULL AND user_id=$2)) %s FOR UPDATE) t',
    p_table, CASE WHEN p_table='engagement_weekly_linkedin' THEN 'AND week_start=$3' ELSE '' END)
    INTO current_rows USING p_workspace_id,actor,p_week;
  IF p_table IN ('linkedin_profile','engagement_weekly_linkedin','linkedin_comment_strategy') AND jsonb_array_length(current_rows)>1 THEN RAISE EXCEPTION 'Plusieurs fiches existent : aucune ne sera écrasée.'; END IF;
  IF p_rows IS NULL THEN RETURN jsonb_build_object('rows',current_rows); END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR p_expected IS NULL OR jsonb_typeof(p_expected) <> 'array' THEN RAISE EXCEPTION 'Snapshot required'; END IF;
  IF current_rows IS DISTINCT FROM (SELECT coalesce(jsonb_agg(e ORDER BY e->>'id'),'[]'::jsonb) FROM jsonb_array_elements(p_expected) e) THEN
    RAISE EXCEPTION 'Ces données ont changé. Recharge la page avant de réessayer.' USING ERRCODE='40001';
  END IF;
  IF p_table IN ('linkedin_profile','engagement_weekly_linkedin','linkedin_comment_strategy') AND (jsonb_array_length(p_rows)<>1 OR jsonb_array_length(current_rows)>1) THEN RAISE EXCEPTION 'Ambiguous singleton'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) e GROUP BY e->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate IDs'; END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    row_id := (entry->>'id')::uuid;
    IF row_id IS NULL THEN RAISE EXCEPTION 'ID required'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k <> 'id' AND NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Unsupported fields'; END IF;
    SELECT e INTO old_row FROM jsonb_array_elements(current_rows) e WHERE e->>'id'=row_id::text;
    -- Only supplied editable fields are touched; metadata and other variants survive.
    SELECT string_agg(format('%I',k),','),string_agg(format('(jsonb_populate_record(NULL::public.%I,$1)).%I',p_table,k),','),
      string_agg(format('%I=(jsonb_populate_record(NULL::public.%I,$1)).%I',k,p_table,k),',')
      INTO cols,vals,assignments FROM jsonb_object_keys(entry) k WHERE k=ANY(allowed);
    IF old_row IS NOT NULL THEN
      IF assignments IS NOT NULL THEN
        IF p_table IN ('linkedin_profile','engagement_weekly_linkedin','linkedin_comment_strategy') THEN assignments := assignments || ',updated_at=now()'; END IF;
        EXECUTE format('UPDATE public.%I SET %s WHERE id=$2',p_table,assignments) USING entry,row_id;
        GET DIAGNOSTICS affected=ROW_COUNT;
        IF affected<>1 THEN RAISE EXCEPTION 'No row saved'; END IF;
      END IF;
    ELSE
      EXECUTE format('INSERT INTO public.%I (id,user_id,workspace_id%s%s) SELECT $2,$3,$4%s%s',p_table,
        CASE WHEN p_table='engagement_weekly_linkedin' THEN ',week_start' ELSE '' END,
        CASE WHEN cols IS NOT NULL THEN ','||cols ELSE '' END,
        CASE WHEN p_table='engagement_weekly_linkedin' THEN ',$5' ELSE '' END,
        CASE WHEN vals IS NOT NULL THEN ','||vals ELSE '' END) USING entry,row_id,actor,p_workspace_id,p_week;
      GET DIAGNOSTICS affected=ROW_COUNT;
      IF affected<>1 THEN RAISE EXCEPTION 'No row saved'; END IF;
    END IF;
  END LOOP;
  -- Delete only explicitly removed, previously read IDs, after all writes succeed.
  FOR old_row IN SELECT e FROM jsonb_array_elements(current_rows) e WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) n WHERE n->>'id'=e->>'id') LOOP
    EXECUTE format('DELETE FROM public.%I WHERE id=$1',p_table) USING (old_row->>'id')::uuid;
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>1 THEN RAISE EXCEPTION 'No row deleted'; END IF;
  END LOOP;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),''[]''::jsonb) FROM public.%I t WHERE (($1 IS NOT NULL AND workspace_id=$1) OR ($1 IS NULL AND workspace_id IS NULL AND user_id=$2)) %s',p_table,
    CASE WHEN p_table='engagement_weekly_linkedin' THEN 'AND week_start=$3' ELSE '' END) INTO result_rows USING p_workspace_id,actor,p_week;
  IF jsonb_array_length(result_rows)<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Incomplete receipt'; END IF;
  RETURN jsonb_build_object('rows',result_rows);
END $$;
REVOKE ALL ON FUNCTION public.linkedin_save_state(text,uuid,date,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.linkedin_save_state(text,uuid,date,jsonb,jsonb) TO authenticated;
