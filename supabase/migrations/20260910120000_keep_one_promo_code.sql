-- Lancement : un seul code d'accès interne, sans supprimer l'historique.
-- Cette migration est à appliquer via Lovable/Supabase, jamais depuis le front.
UPDATE public.promo_codes
SET is_active = false
WHERE code <> 'LECODEPROMO';

INSERT INTO public.promo_codes (
  code, plan_granted, duration_days, max_uses, current_uses, is_active, expires_at
)
VALUES ('LECODEPROMO', 'outil', 60, 50, 0, true, NULL)
ON CONFLICT (code) DO UPDATE SET
  plan_granted = EXCLUDED.plan_granted,
  duration_days = EXCLUDED.duration_days,
  max_uses = EXCLUDED.max_uses,
  is_active = true,
  expires_at = EXCLUDED.expires_at;
