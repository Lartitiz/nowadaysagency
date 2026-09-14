-- Keep old plans and calendar IDs. No historical row is deleted or backfilled.
ALTER TABLE public.launch_plan_contents
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_post_id uuid REFERENCES public.calendar_posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calendar_snapshot jsonb;
CREATE INDEX IF NOT EXISTS launch_plan_calendar_link ON public.launch_plan_contents(calendar_post_id) WHERE calendar_post_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_launch_target(p_launch_id uuid, p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE l public.launches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'launch_auth_required'; END IF;
  SELECT * INTO l FROM public.launches WHERE id=p_launch_id FOR UPDATE;
  IF NOT FOUND OR l.workspace_id IS DISTINCT FROM p_workspace_id THEN RAISE EXCEPTION 'launch_not_found'; END IF;
  IF (l.workspace_id IS NULL AND l.user_id<>auth.uid()) OR
    (l.workspace_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.workspace_members
      WHERE workspace_id=l.workspace_id AND user_id=auth.uid() AND role IN ('owner','manager')))
    THEN RAISE EXCEPTION 'launch_forbidden'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_launch_calendar(p_launch_id uuid, p_workspace_id uuid, p_slot_ids uuid[], p_replace boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  l public.launches%ROWTYPE; s public.launch_plan_contents%ROWTYPE;
  c public.calendar_posts%ROWTYPE; candidate uuid; n integer; affected integer;
  inserted integer:=0; refreshed integer:=0; preserved integer:=0; receipts jsonb:='[]';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('launch:'||p_launch_id::text,0));
  PERFORM public.assert_launch_target(p_launch_id,p_workspace_id);
  SELECT * INTO l FROM public.launches WHERE id=p_launch_id;
  IF coalesce(cardinality(p_slot_ids),0)=0 OR cardinality(p_slot_ids)>500 OR
    cardinality(p_slot_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_slot_ids) id)
    THEN RAISE EXCEPTION 'launch_invalid_selection'; END IF;
  SELECT count(*) INTO n FROM public.launch_plan_contents WHERE id=ANY(p_slot_ids) AND launch_id=l.id
    AND workspace_id IS NOT DISTINCT FROM l.workspace_id AND archived_at IS NULL;
  IF n<>cardinality(p_slot_ids) THEN RAISE EXCEPTION 'launch_invalid_selection'; END IF;
  IF NOT coalesce(p_replace,false) AND (l.plan_sent_to_calendar OR EXISTS(SELECT 1 FROM public.calendar_posts WHERE launch_id=l.id))
    THEN RAISE EXCEPTION 'launch_replace_confirmation_required'; END IF;
  FOR s IN SELECT * FROM public.launch_plan_contents WHERE id=ANY(p_slot_ids) ORDER BY id FOR UPDATE LOOP
    c:=NULL;
    IF s.calendar_post_id IS NOT NULL THEN
      SELECT * INTO c FROM public.calendar_posts WHERE id=s.calendar_post_id FOR UPDATE;
      IF NOT FOUND OR c.launch_id IS DISTINCT FROM l.id OR c.workspace_id IS DISTINCT FROM l.workspace_id
        THEN RAISE EXCEPTION 'launch_calendar_not_found'; END IF;
    ELSE
      -- Older versions had no slot relation. Link only an unambiguous exact match;
      -- never guess from position, move old posts, or duplicate an ambiguous history.
      SELECT count(*), (array_agg(p.id))[1] INTO n,candidate FROM public.calendar_posts p
      WHERE p.launch_id=l.id AND p.workspace_id IS NOT DISTINCT FROM l.workspace_id AND p.canal='instagram'
        AND p.date=s.content_date AND p.format IS NOT DISTINCT FROM s.format
        AND p.content_type IS NOT DISTINCT FROM s.content_type AND p.objective IS NOT DISTINCT FROM s.objective
        AND NOT EXISTS(SELECT 1 FROM public.launch_plan_contents x WHERE x.calendar_post_id=p.id AND x.archived_at IS NULL);
      IF n=1 THEN
        SELECT * INTO c FROM public.calendar_posts WHERE id=candidate FOR UPDATE;
        -- A new revision can refer to the same confirmed calendar row. Retain the
        -- old slot relationship too; do not duplicate an unchanged regenerated slot.
        SELECT x.calendar_snapshot INTO s.calendar_snapshot FROM public.launch_plan_contents x
          WHERE x.calendar_post_id=c.id AND x.archived_at IS NOT NULL AND x.calendar_snapshot=to_jsonb(c) LIMIT 1;
      ELSIF n>1 OR EXISTS(SELECT 1 FROM public.calendar_posts p WHERE p.launch_id=l.id
        AND p.workspace_id IS NOT DISTINCT FROM l.workspace_id
        AND NOT EXISTS(SELECT 1 FROM public.launch_plan_contents x WHERE x.calendar_post_id=p.id)) THEN
        RAISE EXCEPTION 'launch_legacy_review_required';
      END IF;
    END IF;
    IF c.id IS NULL THEN
      INSERT INTO public.calendar_posts(user_id,workspace_id,date,canal,theme,status,format,notes,angle,objectif,
        content_type,content_type_emoji,category,objective,angle_suggestion,launch_id,content_draft,accroche,
        chapter,chapter_label,audience_phase,story_sequence_detail)
      VALUES(l.user_id,l.workspace_id,s.content_date,'instagram','🚀 '||l.name,
        CASE WHEN coalesce(s.contenu,'')<>'' THEN 'drafting' ELSE 'idea' END,s.format,s.objective,s.angle_suggestion,
        CASE WHEN s.category IN ('vente','visibilite') THEN s.category ELSE 'confiance' END,
        s.content_type,s.content_type_emoji,s.category,s.objective,s.angle_suggestion,l.id,s.contenu,s.accroche,
        s.chapter,s.chapter_label,s.audience_phase,s.story_sequence_detail) RETURNING * INTO c;
      inserted:=inserted+1;
      UPDATE public.launch_plan_contents SET calendar_snapshot=to_jsonb(c) WHERE id=s.id;
    ELSIF s.calendar_snapshot IS NOT NULL AND s.calendar_snapshot=to_jsonb(c)
      AND (c.date,c.theme,c.format,c.notes,c.angle,c.objective,c.angle_suggestion,c.content_type,c.content_type_emoji,c.category,c.objectif)
        IS DISTINCT FROM (s.content_date,'🚀 '||l.name,s.format,s.objective,s.angle_suggestion,s.objective,s.angle_suggestion,s.content_type,s.content_type_emoji,s.category,
          CASE WHEN s.category IN ('vente','visibilite') THEN s.category ELSE 'confiance' END)
      AND c.status='idea' AND coalesce(c.content_draft,'')='' AND c.generated_content_id IS NULL
      AND coalesce(cardinality(c.media_urls),0)=0 AND c.story_sequence_detail IS NULL
      AND NOT coalesce(c.auto_publish,false) AND c.scheduled_publish_at IS NULL
      AND c.publish_status IS NULL AND c.published_post_id IS NULL THEN
      -- Only untouched placeholders can follow later plan edits. Every other field,
      -- attachment, relationship, version and publication receipt stays on its row.
      UPDATE public.calendar_posts SET date=s.content_date,theme='🚀 '||l.name,format=s.format,
        notes=s.objective,angle=s.angle_suggestion,objective=s.objective,angle_suggestion=s.angle_suggestion,
        content_type=s.content_type,content_type_emoji=s.content_type_emoji,category=s.category,
        objectif=CASE WHEN s.category IN ('vente','visibilite') THEN s.category ELSE 'confiance' END
      WHERE id=c.id RETURNING * INTO c;
      GET DIAGNOSTICS affected=ROW_COUNT;
      IF affected<>1 THEN RAISE EXCEPTION 'launch_calendar_not_found'; END IF;
      UPDATE public.launch_plan_contents SET calendar_snapshot=to_jsonb(c) WHERE id=s.id;
      refreshed:=refreshed+1;
    ELSE
      preserved:=preserved+1;
    END IF;
    UPDATE public.launch_plan_contents SET calendar_post_id=c.id,calendar_snapshot=coalesce(calendar_snapshot,s.calendar_snapshot),sent_to_calendar=true,added_to_calendar=true WHERE id=s.id;
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>1 THEN RAISE EXCEPTION 'launch_slot_not_found'; END IF;
    receipts:=receipts||jsonb_build_array(jsonb_build_object('slot_id',s.id,'post_id',c.id,'date',c.date));
  END LOOP;
  UPDATE public.launches SET plan_sent_to_calendar=NOT EXISTS(SELECT 1 FROM public.launch_plan_contents
    WHERE launch_id=l.id AND archived_at IS NULL AND NOT coalesce(sent_to_calendar,false)) WHERE id=l.id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'launch_not_found'; END IF;
  RETURN jsonb_build_object('launch_id',l.id,'inserted',inserted,'refreshed',refreshed,'preserved',preserved,'items',receipts);
END $$;

-- A generated proposal has client allocated UUIDs. Retrying its save after a lost
-- response returns the same revision; regeneration retains all earlier slots.
CREATE OR REPLACE FUNCTION public.save_launch_plan(p_launch_id uuid,p_workspace_id uuid,p_expected_updated_at timestamptz,p_slots jsonb,p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE l public.launches%ROWTYPE; r jsonb; ids uuid[]; n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('launch:'||p_launch_id::text,0));
  PERFORM public.assert_launch_target(p_launch_id,p_workspace_id);
  SELECT * INTO l FROM public.launches WHERE id=p_launch_id;
  IF jsonb_typeof(p_slots) IS DISTINCT FROM 'array' OR jsonb_array_length(p_slots) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'launch_invalid_selection'; END IF;
  SELECT array_agg((v->>'id')::uuid) INTO ids FROM jsonb_array_elements(p_slots) v;
  IF cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) THEN RAISE EXCEPTION 'launch_invalid_selection'; END IF;
  SELECT count(*) INTO n FROM public.launch_plan_contents WHERE id=ANY(ids) AND launch_id=l.id;
  IF n=cardinality(ids) THEN
    -- IDs identify one immutable attempted proposal, not permission to acknowledge
    -- a different payload. Later edits/another revision also require review.
    IF (l.template_type,l.extra_weekly_hours,l.phases) IS DISTINCT FROM
      (p_metadata->>'template_type',(p_metadata->>'extra_weekly_hours')::int,p_metadata->'phases') OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_slots) value
      JOIN public.launch_plan_contents x ON x.id=(value->>'id')::uuid
      WHERE x.archived_at IS NOT NULL OR x.workspace_id IS DISTINCT FROM l.workspace_id OR
        (x.phase,x.content_date,x.format,x.content_type,x.content_type_emoji,x.category,x.objective,x.angle_suggestion,x.sort_order)
        IS DISTINCT FROM (value->>'phase',(value->>'date')::date,value->>'format',value->>'content_type',value->>'content_type_emoji',
          value->>'category',value->>'objective',value->>'angle_suggestion',coalesce((value->>'sort_order')::int,0))
    ) THEN RAISE EXCEPTION 'launch_replay_conflict'; END IF;
    RETURN jsonb_build_object('launch_id',l.id,'replayed',true);
  END IF;
  IF n>0 OR p_expected_updated_at IS NULL OR l.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'launch_version_conflict'; END IF;
  UPDATE public.launch_plan_contents SET archived_at=clock_timestamp() WHERE launch_id=l.id AND archived_at IS NULL;
  FOR r IN SELECT value FROM jsonb_array_elements(p_slots) LOOP
    INSERT INTO public.launch_plan_contents(id,user_id,workspace_id,launch_id,phase,content_date,format,
      content_type,content_type_emoji,category,objective,angle_suggestion,sort_order)
    VALUES((r->>'id')::uuid,l.user_id,l.workspace_id,l.id,r->>'phase',(r->>'date')::date,r->>'format',
      r->>'content_type',r->>'content_type_emoji',r->>'category',r->>'objective',r->>'angle_suggestion',coalesce((r->>'sort_order')::int,0));
  END LOOP;
  UPDATE public.launches SET template_type=p_metadata->>'template_type',extra_weekly_hours=(p_metadata->>'extra_weekly_hours')::int,
    phases=p_metadata->'phases',plan_generated=true,plan_sent_to_calendar=false,updated_at=clock_timestamp() WHERE id=l.id;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'launch_not_found'; END IF;
  RETURN jsonb_build_object('launch_id',l.id,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.assert_launch_target(uuid,uuid),public.sync_launch_calendar(uuid,uuid,uuid[],boolean),public.save_launch_plan(uuid,uuid,timestamptz,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assert_launch_target(uuid,uuid),public.sync_launch_calendar(uuid,uuid,uuid[],boolean),public.save_launch_plan(uuid,uuid,timestamptz,jsonb,jsonb) TO authenticated;
