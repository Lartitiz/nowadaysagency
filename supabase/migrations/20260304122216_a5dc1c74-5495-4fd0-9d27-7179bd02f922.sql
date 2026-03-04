
CREATE OR REPLACE FUNCTION public.get_plan_data(p_filter_col text, p_filter_val uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_bp jsonb;
  v_persona jsonb;
  v_story_count bigint;
  v_offer_count bigint;
  v_ig_score numeric;
  v_ig_bio_score numeric;
  v_li_score numeric;
  v_edito_pillars jsonb;
  v_calendar_count bigint;
  v_contact_count bigint;
  v_prospect_count bigint;
  v_strategy jsonb;
  v_proposition jsonb;
  v_tone jsonb;
  v_diagnostic jsonb;
BEGIN
  -- 1. brand_profile (mission, voice_description, tone_register, offer)
  IF p_filter_col = 'workspace_id' THEN
    SELECT to_jsonb(row) INTO v_bp FROM (
      SELECT mission, voice_description, tone_register, offer FROM brand_profile WHERE workspace_id = p_filter_val LIMIT 1
    ) row;
  ELSE
    SELECT to_jsonb(row) INTO v_bp FROM (
      SELECT mission, voice_description, tone_register, offer FROM brand_profile WHERE user_id = p_filter_val LIMIT 1
    ) row;
  END IF;

  -- 2. persona
  IF p_filter_col = 'workspace_id' THEN
    SELECT to_jsonb(row) INTO v_persona FROM (
      SELECT step_1_frustrations, step_2_transformation FROM persona WHERE workspace_id = p_filter_val ORDER BY is_primary DESC, created_at DESC LIMIT 1
    ) row;
  ELSE
    SELECT to_jsonb(row) INTO v_persona FROM (
      SELECT step_1_frustrations, step_2_transformation FROM persona WHERE user_id = p_filter_val ORDER BY is_primary DESC, created_at DESC LIMIT 1
    ) row;
  END IF;

  -- 3. storytelling count
  IF p_filter_col = 'workspace_id' THEN
    SELECT count(*) INTO v_story_count FROM storytelling WHERE workspace_id = p_filter_val;
  ELSE
    SELECT count(*) INTO v_story_count FROM storytelling WHERE user_id = p_filter_val;
  END IF;

  -- 4. offers count
  IF p_filter_col = 'workspace_id' THEN
    SELECT count(*) INTO v_offer_count FROM offers WHERE workspace_id = p_filter_val;
  ELSE
    SELECT count(*) INTO v_offer_count FROM offers WHERE user_id = p_filter_val;
  END IF;

  -- 5. ig audit scores
  IF p_filter_col = 'workspace_id' THEN
    SELECT score_global INTO v_ig_score FROM instagram_audit WHERE workspace_id = p_filter_val ORDER BY created_at DESC LIMIT 1;
    SELECT score_bio INTO v_ig_bio_score FROM instagram_audit WHERE workspace_id = p_filter_val ORDER BY created_at DESC LIMIT 1;
  ELSE
    SELECT score_global INTO v_ig_score FROM instagram_audit WHERE user_id = p_filter_val ORDER BY created_at DESC LIMIT 1;
    SELECT score_bio INTO v_ig_bio_score FROM instagram_audit WHERE user_id = p_filter_val ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 6. li audit score
  BEGIN
    IF p_filter_col = 'workspace_id' THEN
      SELECT score_global INTO v_li_score FROM linkedin_audit WHERE workspace_id = p_filter_val ORDER BY created_at DESC LIMIT 1;
    ELSE
      SELECT score_global INTO v_li_score FROM linkedin_audit WHERE user_id = p_filter_val ORDER BY created_at DESC LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_li_score := NULL;
  END;

  -- 7. editorial line pillars
  IF p_filter_col = 'workspace_id' THEN
    SELECT to_jsonb(pillars) INTO v_edito_pillars FROM instagram_editorial_line WHERE workspace_id = p_filter_val LIMIT 1;
  ELSE
    SELECT to_jsonb(pillars) INTO v_edito_pillars FROM instagram_editorial_line WHERE user_id = p_filter_val LIMIT 1;
  END IF;

  -- 8. calendar posts count
  IF p_filter_col = 'workspace_id' THEN
    SELECT count(*) INTO v_calendar_count FROM calendar_posts WHERE workspace_id = p_filter_val;
  ELSE
    SELECT count(*) INTO v_calendar_count FROM calendar_posts WHERE user_id = p_filter_val;
  END IF;

  -- 9. contacts count (network)
  IF p_filter_col = 'workspace_id' THEN
    SELECT count(*) INTO v_contact_count FROM contacts WHERE workspace_id = p_filter_val AND contact_type = 'network';
  ELSE
    SELECT count(*) INTO v_contact_count FROM contacts WHERE user_id = p_filter_val AND contact_type = 'network';
  END IF;

  -- 10. prospects count
  IF p_filter_col = 'workspace_id' THEN
    SELECT count(*) INTO v_prospect_count FROM contacts WHERE workspace_id = p_filter_val AND contact_type = 'prospect';
  ELSE
    SELECT count(*) INTO v_prospect_count FROM contacts WHERE user_id = p_filter_val AND contact_type = 'prospect';
  END IF;

  -- 11. strategy
  IF p_filter_col = 'workspace_id' THEN
    SELECT to_jsonb(row) INTO v_strategy FROM (
      SELECT facet_1, pillar_major, creative_concept, step_1_hidden_facets FROM brand_strategy WHERE workspace_id = p_filter_val LIMIT 1
    ) row;
  ELSE
    SELECT to_jsonb(row) INTO v_strategy FROM (
      SELECT facet_1, pillar_major, creative_concept, step_1_hidden_facets FROM brand_strategy WHERE user_id = p_filter_val LIMIT 1
    ) row;
  END IF;

  -- 12. proposition
  IF p_filter_col = 'workspace_id' THEN
    SELECT to_jsonb(row) INTO v_proposition FROM (
      SELECT step_1_what, version_final FROM brand_proposition WHERE workspace_id = p_filter_val LIMIT 1
    ) row;
  ELSE
    SELECT to_jsonb(row) INTO v_proposition FROM (
      SELECT step_1_what, version_final FROM brand_proposition WHERE user_id = p_filter_val LIMIT 1
    ) row;
  END IF;

  -- 13. tone
  IF p_filter_col = 'workspace_id' THEN
    SELECT to_jsonb(row) INTO v_tone FROM (
      SELECT tone_register, tone_level, tone_style, combat_cause, combat_fights, key_expressions FROM brand_profile WHERE workspace_id = p_filter_val LIMIT 1
    ) row;
  ELSE
    SELECT to_jsonb(row) INTO v_tone FROM (
      SELECT tone_register, tone_level, tone_style, combat_cause, combat_fights, key_expressions FROM brand_profile WHERE user_id = p_filter_val LIMIT 1
    ) row;
  END IF;

  -- 14. diagnostic data
  IF p_filter_col = 'workspace_id' THEN
    SELECT diagnostic_data INTO v_diagnostic FROM profiles WHERE workspace_id = p_filter_val LIMIT 1;
  ELSE
    SELECT diagnostic_data INTO v_diagnostic FROM profiles WHERE user_id = p_filter_val LIMIT 1;
  END IF;

  result := jsonb_build_object(
    'brand_profile', v_bp,
    'persona', v_persona,
    'story_count', v_story_count,
    'offer_count', v_offer_count,
    'ig_score_global', v_ig_score,
    'ig_score_bio', v_ig_bio_score,
    'li_score_global', v_li_score,
    'edito_pillars', v_edito_pillars,
    'calendar_count', v_calendar_count,
    'contact_count', v_contact_count,
    'prospect_count', v_prospect_count,
    'strategy', v_strategy,
    'proposition', v_proposition,
    'tone', v_tone,
    'diagnostic_data', v_diagnostic
  );

  RETURN result;
END;
$function$;
