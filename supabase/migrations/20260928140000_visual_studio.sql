-- Additive first Studio photo slice; existing media remain untouched.
CREATE TABLE public.visual_studio_sessions (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, source_photo_id uuid REFERENCES public.user_photos(id) ON DELETE SET NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), source_path text NOT NULL,
 source_metadata jsonb NOT NULL DEFAULT '{}',
 messages jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(messages)='array' AND octet_length(messages::text)<100000),
 proposal jsonb, revision integer NOT NULL DEFAULT 0, source_ready boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.visual_studio_versions (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.visual_studio_sessions(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('processing','ready','failed')), proposal jsonb NOT NULL,
 result_path text NOT NULL, error_message text, library_photo_id uuid REFERENCES public.user_photos(id),
 charge_usage boolean NOT NULL, base_total_limit integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX visual_studio_sessions_space ON public.visual_studio_sessions(workspace_id,updated_at DESC);
CREATE INDEX visual_studio_versions_session ON public.visual_studio_versions(session_id,created_at);
CREATE INDEX visual_studio_versions_pending ON public.visual_studio_versions(workspace_id) WHERE status='processing';
ALTER TABLE public.visual_studio_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_studio_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visual_studio_sessions, public.visual_studio_versions FROM anon,authenticated;
GRANT SELECT ON public.visual_studio_sessions, public.visual_studio_versions TO authenticated;
GRANT ALL ON public.visual_studio_sessions, public.visual_studio_versions TO service_role;
CREATE POLICY studio_session_read ON public.visual_studio_sessions FOR SELECT TO authenticated
 USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY studio_version_read ON public.visual_studio_versions FOR SELECT TO authenticated
 USING (public.user_has_workspace_access(workspace_id));
-- Private bucket; no client write or listing policy. The edge signs scoped reads.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('visual-studio','visual-studio',false,15000000,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION public.studio_confirm_generation(p_actor uuid,p_session uuid,p_proposal uuid,
 p_total_limit integer,p_image_limit integer,p_charge boolean,p_base_total integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s visual_studio_sessions; v visual_studio_versions; total_used integer; images_used integer;
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
   OR s.proposal->>'operation' IS DISTINCT FROM 'background' THEN RAISE EXCEPTION 'studio_proposal_changed'; END IF;
 IF EXISTS(SELECT 1 FROM visual_studio_versions WHERE workspace_id=s.workspace_id AND status='processing') THEN RAISE EXCEPTION 'studio_busy'; END IF;
 IF p_charge IS NULL OR p_total_limit IS NULL OR p_image_limit IS NULL OR p_base_total IS NULL THEN RAISE EXCEPTION 'studio_invalid_quota'; END IF;
 SELECT count(*),count(*) FILTER(WHERE category='photo_retouch') INTO total_used,images_used FROM ai_usage
 WHERE workspace_id=s.workspace_id AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF p_charge AND (total_used>=p_total_limit OR images_used>=p_image_limit) THEN RAISE EXCEPTION 'studio_quota'; END IF;
 INSERT INTO visual_studio_versions(id,session_id,workspace_id,user_id,status,proposal,result_path,charge_usage,base_total_limit)
 VALUES(p_proposal,s.id,s.workspace_id,p_actor,'processing',s.proposal,
 s.workspace_id::text||'/'||s.id::text||'/'||p_proposal::text||'.jpg',p_charge,p_base_total) RETURNING * INTO v;
 UPDATE visual_studio_sessions SET proposal=NULL,revision=revision+1,updated_at=now() WHERE id=s.id;
 RETURN jsonb_build_object('version',to_jsonb(v),'claimed',true);
END $$;

CREATE FUNCTION public.studio_complete_generation(p_version uuid)
RETURNS public.visual_studio_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v visual_studio_versions; used integer;
BEGIN
 SELECT * INTO v FROM visual_studio_versions WHERE id=p_version FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'studio_missing'; END IF;
 IF v.status='ready' THEN RETURN v; END IF;
 IF v.status IS DISTINCT FROM 'processing' THEN RAISE EXCEPTION 'studio_not_processing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='visual-studio' AND name=v.result_path) THEN RAISE EXCEPTION 'studio_result_not_stored'; END IF;
 -- Durable version and usage commit together; replay never debits again.
 IF v.charge_usage THEN
   INSERT INTO ai_usage(user_id,workspace_id,category,action_type,model_used)
   VALUES(v.user_id,v.workspace_id,'photo_retouch','studio_background','photoroom-v2');
   SELECT count(*) INTO used FROM ai_usage WHERE workspace_id=v.workspace_id
   AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
   IF used>v.base_total_limit THEN PERFORM public.consume_bonus_credit(v.user_id); END IF;
 END IF;
 UPDATE visual_studio_versions SET status='ready',completed_at=now(),error_message=NULL WHERE id=v.id RETURNING * INTO v;
 UPDATE visual_studio_sessions SET updated_at=now() WHERE id=v.session_id;
 RETURN v;
END $$;

CREATE FUNCTION public.studio_save_library(p_actor uuid,p_version uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v visual_studio_versions; s visual_studio_sessions; target_path text; original_path text;
BEGIN
 SELECT * INTO v FROM visual_studio_versions WHERE id=p_version FOR UPDATE;
 IF v.id IS NULL OR NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=v.workspace_id
 AND user_id=p_actor AND role IN ('owner','manager','editor')) THEN RAISE EXCEPTION 'studio_forbidden' USING ERRCODE='42501'; END IF;
 IF v.status IS DISTINCT FROM 'ready' THEN RAISE EXCEPTION 'studio_not_ready'; END IF;
 IF v.library_photo_id IS NOT NULL THEN RETURN v.library_photo_id; END IF;
 SELECT * INTO s FROM visual_studio_sessions WHERE id=v.session_id;
 target_path := v.user_id::text||'/studio_'||v.id::text||'.jpg';
 original_path := v.user_id::text||'/studio_'||v.id::text||'_original.jpg';
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='user-photos' AND name=target_path)
 OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='user-photos' AND name=original_path) THEN RAISE EXCEPTION 'studio_library_files_missing'; END IF;
 INSERT INTO user_photos(id,user_id,workspace_id,name,status,storage_path,original_storage_path,source_type,description,kind,tags)
 VALUES(v.id,v.user_id,v.workspace_id,left(s.name||' — Studio',120),'ready',target_path,original_path,'upload',left(v.proposal->>'summary',300),s.source_metadata->>'kind',ARRAY['studio']);
 UPDATE visual_studio_versions SET library_photo_id=v.id WHERE id=v.id;
 RETURN v.id;
END $$;
REVOKE ALL ON FUNCTION public.studio_confirm_generation(uuid,uuid,uuid,integer,integer,boolean,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.studio_complete_generation(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.studio_save_library(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_confirm_generation(uuid,uuid,uuid,integer,integer,boolean,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_complete_generation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.studio_save_library(uuid,uuid) TO service_role;

-- The conversation has a separate server cost: durable limits survive edge restarts.
CREATE TABLE public.visual_studio_interpretations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES visual_studio_sessions(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visual_studio_interpretations_actor ON visual_studio_interpretations(user_id,created_at);
ALTER TABLE visual_studio_interpretations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON visual_studio_interpretations FROM anon,authenticated;
GRANT ALL ON visual_studio_interpretations TO service_role;
CREATE FUNCTION studio_reserve_interpretation(p_actor uuid,p_session uuid,p_request uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM visual_studio_sessions s JOIN workspace_members m ON m.workspace_id=s.workspace_id
 WHERE s.id=p_session AND m.user_id=p_actor AND m.role IN ('owner','manager','editor')) THEN
 RAISE EXCEPTION 'studio_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,282027));
 IF EXISTS(SELECT 1 FROM visual_studio_interpretations WHERE id=p_request) THEN RETURN false; END IF;
 IF (SELECT count(*) FROM visual_studio_interpretations WHERE user_id=p_actor AND created_at>now()-interval '24 hours')>=100
 OR (SELECT count(*) FROM visual_studio_interpretations WHERE user_id=p_actor AND created_at>now()-interval '1 minute')>=6
 THEN RAISE EXCEPTION 'studio_interpretation_limit'; END IF;
 INSERT INTO visual_studio_interpretations(id,user_id,session_id) VALUES(p_request,p_actor,p_session);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION studio_reserve_interpretation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION studio_reserve_interpretation(uuid,uuid,uuid) TO service_role;
