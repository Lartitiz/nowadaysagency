CREATE OR REPLACE FUNCTION public.redeem_promo_and_grant_plan(
  p_promo_id uuid,
  p_user_id uuid,
  p_display_plan text,
  p_raw_plan text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.promo_redemptions (user_id, promo_code_id, expires_at)
  VALUES (p_user_id, p_promo_id, p_expires_at);

  UPDATE public.promo_codes
  SET current_uses = coalesce(current_uses, 0) + 1
  WHERE id = p_promo_id
    AND (max_uses IS NULL OR current_uses < max_uses);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promo_max_uses_reached';
  END IF;

  UPDATE public.profiles
  SET current_plan = p_display_plan
  WHERE user_id = p_user_id;

  INSERT INTO public.subscriptions (user_id, plan, status, source, current_period_end)
  VALUES (p_user_id, p_raw_plan, 'active', 'promo', p_expires_at)
  ON CONFLICT (user_id) DO UPDATE SET
    plan = EXCLUDED.plan,
    status = 'active',
    source = 'promo',
    current_period_end = EXCLUDED.current_period_end;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_coaching_program_full(
  p_client_user_id uuid,
  p_coach_user_id uuid,
  p_start_date date,
  p_end_date date,
  p_whatsapp_link text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_program_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coaching_programs
    WHERE client_user_id = p_client_user_id AND status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.coaching_programs (
    client_user_id, coach_user_id, start_date, end_date,
    current_phase, current_month, whatsapp_link, status
  ) VALUES (
    p_client_user_id, p_coach_user_id, p_start_date, p_end_date,
    'strategy', 1, p_whatsapp_link, 'active'
  )
  RETURNING id INTO v_program_id;

  INSERT INTO public.coaching_sessions (program_id, session_number, phase, title, duration_minutes, status)
  VALUES
    (v_program_id, 1, 'strategy', 'Audit + positionnement', 90, 'scheduled'),
    (v_program_id, 2, 'strategy', 'Cible, offres, ton', 90, 'scheduled'),
    (v_program_id, 3, 'strategy', 'Ligne éditoriale', 90, 'scheduled'),
    (v_program_id, 4, 'strategy', 'Calendrier + templates', 90, 'scheduled'),
    (v_program_id, 5, 'strategy', 'Contenus + mise en place (1)', 90, 'scheduled'),
    (v_program_id, 6, 'strategy', 'Contenus + mise en place (2)', 90, 'scheduled'),
    (v_program_id, 7, 'binome', 'Revue mensuelle · Mois 4', 120, 'scheduled'),
    (v_program_id, 8, 'binome', 'Revue mensuelle · Mois 5', 120, 'scheduled'),
    (v_program_id, 9, 'binome', 'Bilan + autonomie · Mois 6', 120, 'scheduled');

  INSERT INTO public.coaching_deliverables (program_id, title, type, route, status)
  VALUES
    (v_program_id, 'Audit de communication', 'audit', '/audit-branding', 'pending'),
    (v_program_id, 'Branding complet', 'branding', '/branding', 'pending'),
    (v_program_id, 'Portrait cible', 'persona', '/branding/cible', 'pending'),
    (v_program_id, 'Offres reformulées', 'offers', '/branding/offres', 'pending'),
    (v_program_id, 'Ligne éditoriale', 'editorial', '/branding/editorial', 'pending'),
    (v_program_id, 'Calendrier 3 mois', 'calendar', '/calendrier', 'pending'),
    (v_program_id, 'Bio optimisée', 'bio', '/instagram/bio', 'pending'),
    (v_program_id, '10-15 contenus prêts', 'content', '/calendrier', 'pending'),
    (v_program_id, 'Templates Canva', 'templates', NULL, 'pending'),
    (v_program_id, 'Plan de com'' 6 mois', 'plan', '/plan', 'pending');

  RETURN v_program_id;
END;
$$;