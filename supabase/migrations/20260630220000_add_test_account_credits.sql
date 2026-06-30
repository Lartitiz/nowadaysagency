-- Ajouter 100 crédits bonus au compte test Camille (laetitiatest@nowadaysagency.com)
-- pour permettre les tests Playwright (T1a génération Instagram, etc.)
-- Migration one-shot : idempotente (l'ajout ne se fait que si le compte existe)
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'laetitiatest@nowadaysagency.com';

  IF v_user_id IS NOT NULL THEN
    PERFORM increment_bonus_credits(v_user_id, 100);
  END IF;
END $$;
