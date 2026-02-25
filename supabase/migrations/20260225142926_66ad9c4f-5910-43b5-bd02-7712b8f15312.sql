
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_user_id uuid,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  v_filter_col text;
  v_filter_val uuid;
  v_week_start date;
  v_week_end date;
  v_today date;
  v_profile jsonb;
  v_ig_score numeric;
  v_li_score numeric;
  v_contact_count bigint;
  v_prospect_count bigint;
  v_prospect_conversation bigint;
  v_prospect_offered bigint;
  v_calendar_count bigint;
  v_week_total bigint;
  v_week_published bigint;
  v_next_post jsonb;
  v_plan_config jsonb;
  v_recs jsonb;
BEGIN
  -- Determine filter column
  IF p_workspace_id IS NOT NULL THEN
    v_filter_col := 'workspace_id';
    v_filter_val := p_workspace_id;
  ELSE
    v_filter_col := 'user_id';
    v_filter_val := p_user_id;
  END IF;

  -- Week boundaries (Monday to Sunday)
  v_today := CURRENT_DATE;
  v_week_start := date_trunc('week', v_today)::date; -- Monday
  v_week_end := (v_week_start + interval '6 days')::date;

  -- 1. Profile
  IF v_filter_col = 'workspace_id' THEN
    SELECT to_jsonb(row) INTO v_profile FROM (
      SELECT prenom, activite, type_activite, cible, probleme_principal, piliers, tons, plan_start_date
      FROM profiles WHERE workspace_id = v_filter_val LIMIT 1
    ) row;
  ELSE
    SELECT to_jsonb(row) INTO v_profile FROM (
      SELECT prenom, activite, type_activite, cible, probleme_principal, piliers, tons, plan_start_date
      FROM profiles WHERE user_id = v_filter_val LIMIT 1
    ) row;
  END IF;

  -- 2. IG audit score
  IF v_filter_col = 'workspace_id' THEN
    SELECT score_global INTO v_ig_score FROM instagram_audit WHERE workspace_id = v_filter_val ORDER BY created_at DESC LIMIT 1;
  ELSE
    SELECT score_global INTO v_ig_score FROM instagram_audit WHERE user_id = v_filter_val ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 3. LI audit score
  IF v_filter_col = 'workspace_id' THEN
    SELECT score_global INTO v_li_score FROM linkedin_audit WHERE workspace_id = v_filter_val ORDER BY created_at DESC LIMIT 1;
  ELSE
    SELECT score_global INTO v_li_score FROM linkedin_audit WHERE user_id = v_filter_val ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 4-7. Contact counts
  IF v_filter_col = 'workspace_id' THEN
    SELECT count(*) INTO v_contact_count FROM contacts WHERE workspace_id = v_filter_val AND contact_type = 'network';
    SELECT count(*) INTO v_prospect_count FROM contacts WHERE workspace_id = v_filter_val AND contact_type = 'prospect';
    SELECT count(*) INTO v_prospect_conversation FROM contacts WHERE workspace_id = v_filter_val AND contact_type = 'prospect' AND prospect_stage = 'in_conversation';
    SELECT count(*) INTO v_prospect_offered FROM contacts WHERE workspace_id = v_filter_val AND contact_type = 'prospect' AND prospect_stage = 'offer_sent';
  ELSE
    SELECT count(*) INTO v_contact_count FROM contacts WHERE user_id = v_filter_val AND contact_type = 'network';
    SELECT count(*) INTO v_prospect_count FROM contacts WHERE user_id = v_filter_val AND contact_type = 'prospect';
    SELECT count(*) INTO v_prospect_conversation FROM contacts WHERE user_id = v_filter_val AND contact_type = 'prospect' AND prospect_stage = 'in_conversation';
    SELECT count(*) INTO v_prospect_offered FROM contacts WHERE user_id = v_filter_val AND contact_type = 'prospect' AND prospect_stage = 'offer_sent';
  END IF;

  -- 8-10. Calendar posts
  IF v_filter_col = 'workspace_id' THEN
    SELECT count(*) INTO v_calendar_count FROM calendar_posts WHERE workspace_id = v_filter_val;
    SELECT count(*) INTO v_week_total FROM calendar_posts WHERE workspace_id = v_filter_val AND date >= v_week_start AND date <= v_week_end;
    SELECT count(*) INTO v_week_published FROM calendar_posts WHERE workspace_id = v_filter_val AND date >= v_week_start AND date <= v_week_end AND status = 'published';
  ELSE
    SELECT count(*) INTO v_calendar_count FROM calendar_posts WHERE user_id = v_filter_val;
    SELECT count(*) INTO v_week_total FROM calendar_posts WHERE user_id = v_filter_val AND date >= v_week_start AND date <= v_week_end;
    SELECT count(*) INTO v_week_published FROM calendar_posts WHERE user_id = v_filter_val AND date >= v_week_start AND date <= v_week_end AND status = 'published';
  END IF;

  -- 11. Next post
  IF v_filter_col = 'workspace_id' THEN
    SELECT to_jsonb(row) INTO v_next_post FROM (
      SELECT date, theme FROM calendar_posts WHERE workspace_id = v_filter_val AND date >= v_today ORDER BY date ASC LIMIT 1
    ) row;
  ELSE
    SELECT to_jsonb(row) INTO v_next_post FROM (
      SELECT date, theme FROM calendar_posts WHERE user_id = v_filter_val AND date >= v_today ORDER BY date ASC LIMIT 1
    ) row;
  END IF;

  -- 12. Plan config
  IF v_filter_col = 'workspace_id' THEN
    SELECT to_jsonb(row) INTO v_plan_config FROM (SELECT * FROM user_plan_config WHERE workspace_id = v_filter_val LIMIT 1) row;
  ELSE
    SELECT to_jsonb(row) INTO v_plan_config FROM (SELECT * FROM user_plan_config WHERE user_id = v_filter_val LIMIT 1) row;
  END IF;

  -- 13. Recommendations
  IF v_filter_col = 'workspace_id' THEN
    SELECT coalesce(jsonb_agg(row), '[]'::jsonb) INTO v_recs FROM (
      SELECT id, titre, route, completed FROM audit_recommendations WHERE workspace_id = v_filter_val ORDER BY position ASC LIMIT 5
    ) row;
  ELSE
    SELECT coalesce(jsonb_agg(row), '[]'::jsonb) INTO v_recs FROM (
      SELECT id, titre, route, completed FROM audit_recommendations WHERE user_id = v_filter_val ORDER BY position ASC LIMIT 5
    ) row;
  END IF;

  result := jsonb_build_object(
    'profile', v_profile,
    'ig_audit_score', v_ig_score,
    'li_audit_score', v_li_score,
    'contact_count', v_contact_count,
    'prospect_count', v_prospect_count,
    'prospect_conversation', v_prospect_conversation,
    'prospect_offered', v_prospect_offered,
    'calendar_post_count', v_calendar_count,
    'week_posts_total', v_week_total,
    'week_posts_published', v_week_published,
    'next_post', v_next_post,
    'plan_config', v_plan_config,
    'recommendations', v_recs
  );

  RETURN result;
END;
$$;
