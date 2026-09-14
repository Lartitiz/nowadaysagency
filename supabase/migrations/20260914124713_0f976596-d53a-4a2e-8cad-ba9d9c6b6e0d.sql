-- New workspace documents belong to the workspace owner. Historical ownership is unchanged.
-- SECURITY INVOKER: existing row policies still apply, including tenant_immovable.
CREATE OR REPLACE FUNCTION public.crosspost_can_write(ws uuid, personal_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND CASE WHEN ws IS NULL THEN personal_owner = auth.uid()
  ELSE EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id = ws AND user_id = auth.uid()
    AND role IN ('owner','manager','editor')) END;
$$;
REVOKE ALL ON FUNCTION public.crosspost_can_write(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crosspost_can_write(uuid,uuid) TO authenticated;

-- One transaction for the calendar record and its source links. SECURITY INVOKER
-- deliberately preserves the existing workspace RLS on every affected table.
CREATE OR REPLACE FUNCTION public.save_calendar_content(
  p_post_id uuid, p_payload jsonb, p_create boolean,
  p_brief_id uuid DEFAULT NULL, p_idea_id uuid DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  old_post public.calendar_posts%ROWTYPE;
  new_post public.calendar_posts%ROWTYPE;
  fields jsonb;
  found_post boolean;
  affected integer;
  target_workspace uuid;
  target_owner uuid;
  owner_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'calendar_auth_required'; END IF;
  IF p_create IS NULL OR p_post_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'calendar_invalid_payload';
  END IF;
  -- Serializes duplicate calls, including the first insert when no row exists.
  PERFORM pg_advisory_xact_lock(hashtextextended('calendar-save:' || p_post_id::text, 0));
  SELECT * INTO old_post FROM public.calendar_posts WHERE id = p_post_id FOR UPDATE;
  found_post := FOUND;
  IF NOT p_create AND NOT found_post THEN RAISE EXCEPTION 'calendar_not_found'; END IF;
  target_workspace := CASE WHEN p_create THEN nullif(p_payload->>'workspace_id','')::uuid ELSE old_post.workspace_id END;
  IF NOT public.crosspost_can_write(target_workspace, CASE WHEN p_create THEN auth.uid() ELSE old_post.user_id END) THEN
    RAISE EXCEPTION 'calendar_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_create AND found_post THEN
    IF old_post.workspace_id IS DISTINCT FROM target_workspace THEN
      RAISE EXCEPTION 'calendar_scope_mismatch' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('id', old_post.id, 'replayed', true,
      'scheduled', old_post.auto_publish AND old_post.publish_status = 'scheduled',
      'updated_at', old_post.updated_at);
  END IF;
  IF NOT p_create THEN
    IF NOT found_post THEN RAISE EXCEPTION 'calendar_not_found'; END IF;
    IF old_post.publish_status IN ('publishing','published') OR old_post.status = 'published' THEN
      RAISE EXCEPTION 'calendar_publication_locked';
    END IF;
    IF p_expected_updated_at IS NULL OR old_post.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'calendar_version_conflict';
    END IF;
  END IF;
  -- No owner, workspace move, publication receipt, or arbitrary column from input.
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO fields
  FROM jsonb_each(p_payload) WHERE key = ANY(ARRAY[
    'date','theme','canal','format','objectif','angle','content_draft','accroche','notes',
    'story_sequence_detail','media_urls','stories_count','stories_structure','stories_objective',
    'generated_content_id','generated_content_type','auto_publish','scheduled_publish_at']);
  IF p_create THEN
    target_owner := auth.uid();
    IF target_workspace IS NOT NULL THEN
      SELECT count(*), (array_agg(user_id))[1] INTO owner_count, target_owner
      FROM public.workspace_members WHERE workspace_id = target_workspace AND role = 'owner';
      IF owner_count <> 1 THEN RAISE EXCEPTION 'calendar_owner_unavailable'; END IF;
    END IF;
    fields := fields || jsonb_build_object('id',p_post_id,'user_id',target_owner,
      'workspace_id',p_payload->'workspace_id','status','drafting',
      'created_at',now(),'updated_at',now(),'auto_publish',coalesce((fields->>'auto_publish')::boolean,false));
    new_post := jsonb_populate_record(NULL::public.calendar_posts, fields);
  ELSE
    new_post := jsonb_populate_record(old_post, fields);
    new_post.updated_at := clock_timestamp();
  END IF;
  IF new_post.auto_publish THEN
    IF new_post.scheduled_publish_at IS NULL THEN RAISE EXCEPTION 'calendar_schedule_required'; END IF;
    IF new_post.canal = 'instagram' AND coalesce(cardinality(new_post.media_urls),0) = 0 THEN
      RAISE EXCEPTION 'calendar_media_required';
    END IF;
    -- A scheduled caption differs from the editable calendar document: require rescheduling.
    IF NOT p_create AND NOT (fields ? 'scheduled_publish_at') THEN
      RAISE EXCEPTION 'calendar_scheduled_edit_requires_reschedule';
    END IF;
    IF new_post.scheduled_publish_at <= now() THEN RAISE EXCEPTION 'calendar_schedule_in_past'; END IF;
    new_post.publish_status := 'scheduled';
    new_post.publish_error := NULL;
  END IF;
  IF p_create THEN
    INSERT INTO public.calendar_posts SELECT new_post.* RETURNING * INTO new_post;
  ELSE
    UPDATE public.calendar_posts SET
      date=new_post.date, theme=new_post.theme, canal=new_post.canal, format=new_post.format,
      objectif=new_post.objectif, angle=new_post.angle, content_draft=new_post.content_draft,
      accroche=new_post.accroche, notes=new_post.notes, story_sequence_detail=new_post.story_sequence_detail,
      media_urls=new_post.media_urls, stories_count=new_post.stories_count,
      stories_structure=new_post.stories_structure, stories_objective=new_post.stories_objective,
      generated_content_id=new_post.generated_content_id, generated_content_type=new_post.generated_content_type,
      auto_publish=new_post.auto_publish, scheduled_publish_at=new_post.scheduled_publish_at,
      publish_status=new_post.publish_status, publish_error=new_post.publish_error,
      updated_at=new_post.updated_at
    WHERE id=p_post_id RETURNING * INTO new_post;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'calendar_not_found'; END IF;
  END IF;
  IF p_brief_id IS NOT NULL THEN
    UPDATE public.content_briefs SET calendar_post_id=p_post_id WHERE id=p_brief_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'calendar_brief_not_found'; END IF;
  END IF;
  IF p_idea_id IS NOT NULL THEN
    UPDATE public.saved_ideas SET calendar_post_id=p_post_id,status='planned',planned_date=new_post.date,
      updated_at=now() WHERE id=p_idea_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'calendar_idea_not_found'; END IF;
  END IF;
  RETURN jsonb_build_object('id',p_post_id,'replayed',false,
    'scheduled',new_post.auto_publish AND new_post.publish_status='scheduled','updated_at',new_post.updated_at);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_calendar_content(uuid,jsonb,boolean,uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_calendar_content(uuid,jsonb,boolean,uuid,uuid,timestamptz) TO authenticated;
-- These maintenance privileges have no purpose on the browser-facing table.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.calendar_posts FROM anon,authenticated;

-- Restrict crosspost ideas only; leave every other module's current policies unchanged.
CREATE POLICY crosspost_idea_insert ON public.saved_ideas AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (source_module IS DISTINCT FROM 'crosspost' OR (public.crosspost_can_write(workspace_id,user_id)
  AND (workspace_id IS NULL OR user_id = (SELECT wm.user_id FROM public.workspace_members wm
    WHERE wm.workspace_id = saved_ideas.workspace_id AND wm.role = 'owner'))));
CREATE POLICY crosspost_idea_update ON public.saved_ideas AS RESTRICTIVE FOR UPDATE TO authenticated
USING (source_module IS DISTINCT FROM 'crosspost' OR public.crosspost_can_write(workspace_id,user_id))
WITH CHECK (source_module IS DISTINCT FROM 'crosspost' OR public.crosspost_can_write(workspace_id,user_id));
CREATE POLICY crosspost_idea_delete ON public.saved_ideas AS RESTRICTIVE FOR DELETE TO authenticated
USING (source_module IS DISTINCT FROM 'crosspost' OR public.crosspost_can_write(workspace_id,user_id));

-- Private original sources, separate from short-lived AI input uploads.
CREATE OR REPLACE FUNCTION public.crosspost_source_access(object_name text, writing boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE parts text[] := string_to_array(object_name,'/'); scope_id uuid;
BEGIN
  IF auth.uid() IS NULL OR cardinality(parts) <> 3 OR parts[3] = '' THEN RETURN false; END IF;
  BEGIN scope_id := parts[2]::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  IF parts[1] = 'user' THEN RETURN scope_id = auth.uid(); END IF;
  IF parts[1] <> 'workspace' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = scope_id AND user_id = auth.uid()
    AND (NOT writing OR role IN ('owner','manager','editor')));
END;
$$;
REVOKE ALL ON FUNCTION public.crosspost_source_access(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crosspost_source_access(text,boolean) TO authenticated;
CREATE POLICY crosspost_source_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id = 'crosspost-sources' AND public.crosspost_source_access(name,false));
CREATE POLICY crosspost_source_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id = 'crosspost-sources' AND public.crosspost_source_access(name,true));
CREATE POLICY crosspost_source_delete ON storage.objects FOR DELETE TO authenticated
USING(bucket_id = 'crosspost-sources' AND public.crosspost_source_access(name,true));
-- No UPDATE / upsert policy: originals are immutable, a revision gets a new path.