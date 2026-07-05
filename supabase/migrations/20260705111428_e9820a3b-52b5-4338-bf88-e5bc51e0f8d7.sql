-- QA : remise à zéro du compteur de générations de JUILLET du compte test
-- Camille (laetitiatest@nowadaysagency.com). Ses ~23 générations du mois
-- sont du bruit de QA (compte déjà exclu des stats admin). Son plan reste
-- "free" volontairement : c'est le compte de référence des tests du parcours
-- gratuit (murs de quota, gating Qualité Max, pricing).
DO $$
DECLARE
  v_user_id uuid;
  v_deleted int;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'laetitiatest@nowadaysagency.com';

  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.ai_usage
    WHERE user_id = v_user_id
      AND created_at >= date_trunc('month', now());
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'ai_usage de juillet supprimées pour Camille : % lignes', v_deleted;
  END IF;
END $$;