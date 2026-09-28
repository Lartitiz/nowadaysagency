-- A lost synchronous image response cannot be called a definite failure.
-- Uncertain versions are not retryable and do not block unrelated creations.
ALTER TABLE public.visual_studio_versions
  DROP CONSTRAINT visual_studio_versions_status_check;
ALTER TABLE public.visual_studio_versions
  ADD CONSTRAINT visual_studio_versions_status_check
  CHECK(status IN ('processing','ready','failed','uncertain'));

CREATE OR REPLACE FUNCTION public.studio_complete_generation(p_version uuid)
RETURNS public.visual_studio_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v visual_studio_versions; used integer;
BEGIN
 SELECT * INTO v FROM visual_studio_versions WHERE id=p_version FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'studio_missing'; END IF;
 IF v.status='ready' THEN RETURN v; END IF;
 IF v.status NOT IN ('processing','uncertain') THEN RAISE EXCEPTION 'studio_not_processing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='visual-studio' AND name=v.result_path) THEN RAISE EXCEPTION 'studio_result_not_stored'; END IF;
 -- A stored result may arrive after an uncertain acknowledgement. Charge once.
 IF v.charge_usage THEN
   INSERT INTO ai_usage(user_id,workspace_id,category,action_type,model_used)
   VALUES(v.user_id,v.workspace_id,'photo_retouch','studio_'||(v.proposal->>'operation'),coalesce(v.proposal->>'model','photoroom-v2'));
   SELECT count(*) INTO used FROM ai_usage WHERE workspace_id=v.workspace_id
   AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
   IF used>v.base_total_limit THEN PERFORM public.consume_bonus_credit(v.user_id); END IF;
 END IF;
 UPDATE visual_studio_versions SET status='ready',completed_at=now(),error_message=NULL WHERE id=v.id RETURNING * INTO v;
 UPDATE visual_studio_sessions SET updated_at=now() WHERE id=v.session_id;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.studio_complete_generation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_complete_generation(uuid) TO service_role;
