-- Audit sécurité 17/08/2026 (suite [[project_revoke_execute_inefficace_postgrest]]) :
-- sur ce projet Supabase, `REVOKE EXECUTE ... FROM anon, authenticated` NE bloque PAS
-- l'appel des fonctions Postgres via PostgREST (confirmé par curl avec la seule clé anon).
-- On ajoute donc, en défense en profondeur, un garde qui lit directement les claims JWT
-- (auth.role()/auth.uid()) en tête de chaque fonction SECURITY DEFINER sensible listée
-- dans la migration 20260429110214 — même pattern que le fix redeem-promo (PR #791).
--
-- Périmètre (audité une par une) :
--   * increment_bonus_credits(uuid,integer) — CRITIQUE : écriture, grant de crédits IA à
--     n'importe quel user_id. Appelée par stripe-webhook (service_role) ET par le trigger
--     reward_referral_on_accept (PERFORM interne). Garde : service_role OU appel interne
--     à un trigger (pg_trigger_depth() > 0). Bloque l'appel RPC direct anon/authenticated.
--   * get_plan_data(text,uuid) / get_dashboard_summary(uuid,uuid) — ÉLEVÉ : lecture
--     cross-tenant (branding, persona, stratégie, diagnostic...). Aucun contrôle d'ownership
--     à l'origine → IDOR même pour un compte authentifié. Garde : ownership (accès workspace
--     ou auth.uid == user_id), bypass service_role. Préserve le mode coach (l'admin est
--     membre du workspace, cf 20260817180000).
--   * get_user_owner_workspace(uuid) — FAIBLE : fuite du mapping user_id -> workspace_id.
--     Garde : admin OU self OU service_role (usage admin, cf CoachingProgramList).
--
-- NON modifiées (auditées, sans risque) :
--   * copy_email_from_auth(), on_profile_created_email(), reward_referral_on_accept(),
--     sync_plan_on_program_change() — RETURNS trigger : PostgREST n'expose pas les fonctions
--     de type trigger comme RPC, donc non appelables directement. Les toucher casserait les
--     triggers pour zéro gain.
--   * user_has_workspace_access(uuid), user_workspace_role(uuid) — filtrent en interne sur
--     auth.uid() : un appelant anon obtient null/false, pas de fuite cross-tenant.
--
-- CREATE OR REPLACE conserve les GRANT/REVOKE existants ; les REVOKE de 20260429110214
-- restent en place (inoffensifs). Le vrai verrou est désormais le garde ci-dessous.

-- 1. increment_bonus_credits — CRITIQUE (réécrite en plpgsql pour porter le garde)
CREATE OR REPLACE FUNCTION public.increment_bonus_credits(user_uuid uuid, amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Autorisé : service_role (edge functions) et appels internes depuis un trigger
  -- (reward_referral_on_accept PERFORM cette fonction → pg_trigger_depth() > 0).
  -- Bloqué : appel RPC direct anon/authenticated via PostgREST.
  IF pg_trigger_depth() = 0 AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE profiles SET bonus_credits = coalesce(bonus_credits, 0) + amount WHERE user_id = user_uuid;
END;
$$;

-- 2. get_user_owner_workspace — FAIBLE (réécrite en plpgsql pour porter le garde)
CREATE OR REPLACE FUNCTION public.get_user_owner_workspace(target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM target_user_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = target_user_id AND role = 'owner'
    LIMIT 1
  );
END;
$$;

-- 3. get_dashboard_summary — ÉLEVÉ (garde d'ownership en tête, corps inchangé)
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
  -- Garde d'ownership (défense en profondeur, cf en-tête de migration)
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF p_workspace_id IS NOT NULL THEN
      IF NOT public.user_has_workspace_access(p_workspace_id) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    ELSIF p_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

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

-- 4. get_plan_data — ÉLEVÉ (garde d'ownership en tête, corps inchangé)
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
  -- Garde d'ownership (défense en profondeur, cf en-tête de migration)
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF p_filter_col = 'workspace_id' THEN
      IF NOT public.user_has_workspace_access(p_filter_val) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    ELSIF p_filter_val IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

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
