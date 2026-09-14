-- Existing unscoped links retain their historical owner-wide scope. New ones are personal.
ALTER TABLE public.calendar_shares ADD COLUMN legacy_owner_scope boolean NOT NULL DEFAULT false;
UPDATE public.calendar_shares SET legacy_owner_scope = true WHERE workspace_id IS NULL;
-- The compatibility marker is migration provenance, not a client-controlled permission.
CREATE FUNCTION public.preserve_calendar_share_legacy_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.legacy_owner_scope THEN RAISE EXCEPTION 'legacy_scope_is_migration_only' USING ERRCODE='42501'; END IF;
 ELSIF NEW.legacy_owner_scope IS DISTINCT FROM OLD.legacy_owner_scope THEN
  RAISE EXCEPTION 'legacy_scope_is_immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_calendar_share_legacy_scope BEFORE INSERT OR UPDATE OF legacy_owner_scope ON public.calendar_shares
 FOR EACH ROW EXECUTE FUNCTION public.preserve_calendar_share_legacy_scope();
REVOKE ALL ON FUNCTION public.preserve_calendar_share_legacy_scope() FROM PUBLIC,anon,authenticated;
ALTER TABLE public.calendar_comments ADD COLUMN request_id uuid;
CREATE UNIQUE INDEX calendar_comments_share_request ON public.calendar_comments(share_id, request_id) WHERE request_id IS NOT NULL;

-- Keep every structured key, array element and non-text value. Only editorial text can change.
CREATE FUNCTION public.calendar_share_text_preserved(old_value jsonb, new_value jsonb, field_name text DEFAULT '')
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; i integer;
BEGIN
 IF old_value = new_value THEN RETURN true; END IF;
 IF jsonb_typeof(old_value) IS DISTINCT FROM jsonb_typeof(new_value) THEN RETURN false; END IF;
 IF jsonb_typeof(old_value) = 'object' THEN
   IF (SELECT count(*) FROM jsonb_object_keys(old_value)) <> (SELECT count(*) FROM jsonb_object_keys(new_value)) THEN RETURN false; END IF;
   FOR k IN SELECT jsonb_object_keys(old_value) LOOP
     IF NOT new_value ? k OR NOT public.calendar_share_text_preserved(old_value->k,new_value->k,k) THEN RETURN false; END IF;
   END LOOP;
   RETURN true;
 ELSIF jsonb_typeof(old_value) = 'array' THEN
   IF jsonb_array_length(old_value) <> jsonb_array_length(new_value) THEN RETURN false; END IF;
   FOR i IN 0..jsonb_array_length(old_value)-1 LOOP
     IF NOT public.calendar_share_text_preserved(old_value->i,new_value->i,field_name) THEN RETURN false; END IF;
   END LOOP;
   RETURN true;
 END IF;
 RETURN jsonb_typeof(old_value) = 'string' AND field_name = ANY(ARRAY['title','titre','body','texte','text','content','caption','legende','légende','hook','accroche','cta','subject','objet','preview','preheader','script','description']);
END $$;

-- Restore only the private provenance omitted by the public projection. The
-- structural validator still requires every other key and immutable value.
CREATE FUNCTION public.calendar_share_restore_private(old_value jsonb, new_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; i integer; restored jsonb := new_value; private_keys text[];
BEGIN
 IF jsonb_typeof(old_value)='object' AND jsonb_typeof(new_value)='object' THEN
  private_keys := CASE WHEN old_value->>'type'='crosspost'
    THEN ARRAY['_crosspost','source_text','source_files','previous_revisions','source_type','input_mode','result','versions'] ELSE ARRAY['_crosspost'] END;
  FOR k IN SELECT jsonb_object_keys(old_value) LOOP
   IF k=ANY(private_keys) THEN restored:=jsonb_set(restored,ARRAY[k],old_value->k);
   ELSIF restored ? k THEN restored:=jsonb_set(restored,ARRAY[k],public.calendar_share_restore_private(old_value->k,restored->k)); END IF;
  END LOOP;
 ELSIF jsonb_typeof(old_value)='array' AND jsonb_typeof(new_value)='array' AND jsonb_array_length(old_value)=jsonb_array_length(new_value) THEN
  FOR i IN 0..jsonb_array_length(old_value)-1 LOOP
   restored:=jsonb_set(restored,ARRAY[i::text],public.calendar_share_restore_private(old_value->i,restored->i));
  END LOOP;
 END IF;
 RETURN restored;
END $$;

-- Called only by the edge functions using service_role. Lock share then post, so
-- revocation, scope checks, quota, post update and audit receipt commit together.
CREATE FUNCTION public.public_calendar_write(p_token text, p_post_id uuid, p_action text, p_value text,
 p_author text DEFAULT NULL, p_request_id uuid DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.calendar_shares; p public.calendar_posts; c public.calendar_comments;
 old_json jsonb; new_json jsonb; old_structured boolean := false; n integer;
BEGIN
 SELECT * INTO s FROM public.calendar_shares WHERE share_token=p_token FOR UPDATE;
 IF NOT FOUND OR s.is_active IS NOT TRUE THEN RETURN jsonb_build_object('error','invalid_token','status',404); END IF;
 IF s.expires_at IS NOT NULL AND s.expires_at <= clock_timestamp() THEN RETURN jsonb_build_object('error','expired','status',404); END IF;
 SELECT * INTO p FROM public.calendar_posts WHERE id=p_post_id AND user_id=s.user_id
 AND ((s.workspace_id IS NOT NULL AND workspace_id=s.workspace_id) OR
      (s.workspace_id IS NULL AND (s.legacy_owner_scope OR workspace_id IS NULL)))
 AND (s.canal_filter IS NULL OR s.canal_filter='all' OR canal=s.canal_filter) FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','post_not_found','status',404); END IF;
 IF p_action NOT IN ('comment','status','wording') OR p_value IS NULL THEN RETURN jsonb_build_object('error','invalid_field','status',400); END IF;
 IF (p_action='status' AND s.guest_can_edit_status IS NOT TRUE) OR
    (p_action='wording' AND (s.guest_can_edit_wording IS NOT TRUE OR s.show_content_draft IS NOT TRUE)) THEN
   RETURN jsonb_build_object('error','permission_denied','status',403);
 END IF;
 IF p_request_id IS NOT NULL THEN
   SELECT * INTO c FROM public.calendar_comments WHERE share_id=s.id AND request_id=p_request_id;
   IF FOUND THEN
     IF p_action='comment' AND c.calendar_post_id=p.id AND c.content=p_value AND c.author_name=left(p_author,100) THEN RETURN to_jsonb(c); END IF;
     RETURN jsonb_build_object('error','request_conflict','status',409);
   END IF;
 END IF;
 IF p_action='comment' THEN
   IF length(trim(p_value))=0 OR length(p_value)>2000 OR length(trim(coalesce(p_author,'')))=0 THEN RETURN jsonb_build_object('error','invalid_comment','status',400); END IF;
   SELECT count(*) INTO n FROM public.calendar_comments WHERE share_id=s.id AND created_at>=date_trunc('day',now()) AND author_role='guest';
   IF n>=20 THEN RETURN jsonb_build_object('error','rate_limit','status',429); END IF;
   INSERT INTO public.calendar_comments(calendar_post_id,share_id,author_name,author_role,content,request_id)
   VALUES(p.id,s.id,left(p_author,100),'guest',p_value,p_request_id) RETURNING * INTO c;
   RETURN to_jsonb(c);
 END IF;
 IF (p_action='status' AND p.status=p_value) OR (p_action='wording' AND p.content_draft IS NOT DISTINCT FROM p_value) THEN RETURN jsonb_build_object('success',true,'updated_at',p.updated_at); END IF;
 IF p_action='status' AND p_expected_updated_at IS NOT NULL AND p.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN jsonb_build_object('error','conflict','status',409); END IF;
 SELECT count(*) INTO n FROM public.calendar_comments WHERE share_id=s.id AND created_at>=date_trunc('day',now()) AND content LIKE '[EDIT]%';
 IF n>=50 THEN RETURN jsonb_build_object('error','rate_limit','status',429); END IF;
 IF p_action='status' THEN
   IF p_value NOT IN ('idea','a_rediger','drafting','ready','draft_ready','published') THEN RETURN jsonb_build_object('error','invalid_status','status',400); END IF;
   IF p.status=p_value THEN RETURN jsonb_build_object('success',true,'updated_at',p.updated_at); END IF;
   UPDATE public.calendar_posts SET status=p_value, updated_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;
 ELSE
   IF length(p_value)>10000 THEN RETURN jsonb_build_object('error','content_too_long','status',400); END IF;
   BEGIN old_json:=p.content_draft::jsonb; old_structured:=jsonb_typeof(old_json) IN ('array','object'); EXCEPTION WHEN invalid_text_representation THEN NULL; END;
   IF old_structured THEN
     BEGIN new_json:=p_value::jsonb; EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('error','structured_content_required','status',409); END;
     new_json:=public.calendar_share_restore_private(old_json,new_json);
     IF NOT public.calendar_share_text_preserved(old_json,new_json) THEN RETURN jsonb_build_object('error','structured_content_required','status',409); END IF;
     IF old_json=new_json THEN RETURN jsonb_build_object('success',true,'updated_at',p.updated_at); END IF;
     p_value:=new_json::text;
   END IF;
   IF p_expected_updated_at IS NOT NULL AND p.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN jsonb_build_object('error','conflict','status',409); END IF;
   IF p.content_draft IS NOT DISTINCT FROM p_value THEN RETURN jsonb_build_object('success',true,'updated_at',p.updated_at); END IF;
   UPDATE public.calendar_posts SET content_draft=p_value, updated_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;
 END IF;
 INSERT INTO public.calendar_comments(calendar_post_id,share_id,author_name,author_role,content)
 VALUES(p.id,s.id,coalesce(nullif(p_author,''),s.guest_name,'Client·e'),'guest',
 CASE WHEN p_action='status' THEN '[EDIT] Statut changé en "'|| CASE p_value WHEN 'idea' THEN 'Pas commencé' WHEN 'a_rediger' THEN 'À rédiger' WHEN 'drafting' THEN 'En cours' WHEN 'ready' THEN 'À valider' WHEN 'draft_ready' THEN 'Validé' ELSE 'Posté' END ||'"' ELSE '[EDIT] Wording modifié' END);
 RETURN jsonb_build_object('success',true,'updated_at',p.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.public_calendar_write(text,uuid,text,text,text,uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_calendar_write(text,uuid,text,text,text,uuid,timestamptz) TO service_role;
-- Existing owner/manager policies still determine who may write. Add scope only.
CREATE POLICY calendar_comment_scope ON public.calendar_comments AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.calendar_shares s JOIN public.calendar_posts p
 ON p.id=calendar_post_id AND p.user_id=s.user_id WHERE s.id=share_id AND s.is_active
 AND (s.expires_at IS NULL OR s.expires_at>now())
 AND ((s.workspace_id IS NOT NULL AND p.workspace_id=s.workspace_id) OR
 (s.workspace_id IS NULL AND (s.legacy_owner_scope OR p.workspace_id IS NULL)))
 AND (s.canal_filter IS NULL OR s.canal_filter='all' OR p.canal=s.canal_filter)));

REVOKE ALL ON FUNCTION public.calendar_share_text_preserved(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.calendar_share_restore_private(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
