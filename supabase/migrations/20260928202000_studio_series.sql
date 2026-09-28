CREATE OR REPLACE FUNCTION public.studio_confirm_generation(p_actor uuid,p_session uuid,p_proposal uuid,
 p_total_limit integer,p_image_limit integer,p_charge boolean,p_base_total integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s visual_studio_sessions; v visual_studio_versions; total_used integer; images_used integer;
 n integer; i integer; item jsonb; plan jsonb; created jsonb:='[]'::jsonb;
BEGIN
 SELECT * INTO s FROM visual_studio_sessions WHERE id=p_session;
 IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=s.workspace_id
   AND user_id=p_actor AND role IN ('owner','manager','editor')) THEN RAISE EXCEPTION 'studio_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.workspace_id::text,282026));
 SELECT * INTO s FROM visual_studio_sessions WHERE id=p_session FOR UPDATE;
 SELECT * INTO v FROM visual_studio_versions WHERE id=p_proposal;
 IF v.id IS NOT NULL THEN
   IF v.session_id IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'studio_conflict'; END IF;
   RETURN jsonb_build_object('version',to_jsonb(v),'claimed',false);
 END IF;
 IF NOT s.source_ready OR s.proposal IS NULL OR s.proposal->>'id' IS DISTINCT FROM p_proposal::text
   OR s.proposal->>'operation' IS NULL OR s.proposal->>'operation' NOT IN ('background','create','edit','product') THEN RAISE EXCEPTION 'studio_proposal_changed'; END IF;
 IF EXISTS(SELECT 1 FROM visual_studio_versions WHERE workspace_id=s.workspace_id AND status='processing') THEN RAISE EXCEPTION 'studio_busy'; END IF;
 IF p_charge IS NULL OR p_total_limit IS NULL OR p_image_limit IS NULL OR p_base_total IS NULL THEN RAISE EXCEPTION 'studio_invalid_quota'; END IF;
 plan:=coalesce(s.proposal->'shots','[]'::jsonb);
 IF jsonb_typeof(plan)<>'array' OR jsonb_array_length(plan)>3 THEN RAISE EXCEPTION 'studio_proposal_changed'; END IF;
 n:=1+jsonb_array_length(plan);
 SELECT count(*),count(*) FILTER(WHERE category='photo_retouch') INTO total_used,images_used FROM ai_usage
 WHERE workspace_id=s.workspace_id AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF p_charge AND (total_used+n>p_total_limit OR images_used+n>p_image_limit) THEN RAISE EXCEPTION 'studio_quota'; END IF;
 FOR i IN 0..n-1 LOOP
  item:=s.proposal-'shots';
  IF i>0 THEN
   item:=item||jsonb_build_object('id',plan->(i-1)->>'id','image_prompt',plan->(i-1)->>'image_prompt','summary',plan->(i-1)->>'summary','format',plan->(i-1)->>'format');
   IF length(coalesce(item->>'image_prompt',''))<3 THEN RAISE EXCEPTION 'studio_proposal_changed'; END IF;
  END IF;
  IF n>1 THEN item:=item||jsonb_build_object('series_id',p_proposal,'series_index',i,'series_size',n); END IF;
  item:=item||jsonb_build_object('cost',1);
  INSERT INTO visual_studio_versions(id,session_id,workspace_id,user_id,status,proposal,result_path,charge_usage,base_total_limit,created_at)
   VALUES((item->>'id')::uuid,s.id,s.workspace_id,p_actor,'processing',item,
    s.workspace_id::text||'/'||s.id::text||'/'||(item->>'id')||'.jpg',p_charge,p_base_total,now()+i*interval '1 millisecond') RETURNING * INTO v;
  created:=created||jsonb_build_array(to_jsonb(v));
 END LOOP;
 UPDATE visual_studio_sessions SET proposal=NULL,revision=revision+1,updated_at=now() WHERE id=s.id;
 RETURN jsonb_build_object('version',created->0,'versions',created,'claimed',true);
END $$;
REVOKE ALL ON FUNCTION public.studio_confirm_generation(uuid,uuid,uuid,integer,integer,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_confirm_generation(uuid,uuid,uuid,integer,integer,boolean,integer) TO service_role;
