-- R3: source identity serializes all four planning entries. Existing rows are
-- returned unchanged after a lost response, including their actual saved date.
CREATE OR REPLACE FUNCTION public.plan_saved_idea(
  p_idea_id uuid, p_date date, p_payload jsonb, p_expected_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  idea public.saved_ideas%ROWTYPE;
  post public.calendar_posts%ROWTYPE;
  receipt jsonb;
  target uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'calendar_auth_required'; END IF;
  IF p_date IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'calendar_invalid_payload'; END IF;
  SELECT * INTO idea FROM public.saved_ideas WHERE id=p_idea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'calendar_idea_not_found'; END IF;
  IF idea.calendar_post_id IS NOT NULL THEN
    SELECT * INTO post FROM public.calendar_posts WHERE id=idea.calendar_post_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'calendar_not_found'; END IF;
    -- The SELECT FOR UPDATE above already requires UPDATE privilege and RLS.
    -- A replay must not fire the source updated_at trigger.
    RETURN jsonb_build_object('id',post.id,'date',post.date,'replayed',true,'updated_at',post.updated_at);
  END IF;
  IF idea.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'calendar_version_conflict'; END IF;
  target := gen_random_uuid();
  receipt := public.save_calendar_content(target,
    p_payload || jsonb_build_object('date',p_date,'workspace_id',idea.workspace_id,
      'auto_publish',false,'scheduled_publish_at',NULL), true, NULL, idea.id, NULL);
  UPDATE public.calendar_posts SET
    status=CASE WHEN p_payload->>'status'='idea' THEN 'idea' ELSE 'drafting' END,
    series_id=idea.series_id, episode_number=idea.episode_number,
    stories_timing=p_payload->'stories_timing'
  WHERE id=target RETURNING * INTO post;
  IF NOT FOUND THEN RAISE EXCEPTION 'calendar_not_found'; END IF;
  RETURN receipt || jsonb_build_object('date',post.date);
END $$;
REVOKE ALL ON FUNCTION public.plan_saved_idea(uuid,date,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.plan_saved_idea(uuid,date,jsonb,timestamptz) TO authenticated;

-- Moving an editorial day does not move or activate a social publication.
-- Both displayed dates change in the same transaction; stale undo is rejected.
CREATE OR REPLACE FUNCTION public.move_calendar_post(p_post_id uuid,p_date date,p_expected_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE post public.calendar_posts%ROWTYPE; linked uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'calendar_auth_required'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'calendar_invalid_payload'; END IF;
  SELECT * INTO post FROM public.calendar_posts WHERE id=p_post_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'calendar_not_found'; END IF;
  IF post.date IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'calendar_version_conflict'; END IF;
  UPDATE public.calendar_posts SET date=p_date,updated_at=clock_timestamp() WHERE id=p_post_id RETURNING * INTO post;
  IF NOT FOUND THEN RAISE EXCEPTION 'calendar_not_found'; END IF;
  FOR linked IN SELECT id FROM public.saved_ideas WHERE calendar_post_id=p_post_id LOOP
    UPDATE public.saved_ideas SET planned_date=p_date,updated_at=clock_timestamp() WHERE id=linked;
    IF NOT FOUND THEN RAISE EXCEPTION 'calendar_idea_not_found'; END IF;
  END LOOP;
  RETURN jsonb_build_object('id',post.id,'date',post.date,'updated_at',post.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.move_calendar_post(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_calendar_post(uuid,date,date) TO authenticated;
