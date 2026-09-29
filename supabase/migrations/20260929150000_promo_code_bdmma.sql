-- Code d'accès dédié à la cohorte BDMMA (formation IA du 01/10/2026) : plan « outil » 30 jours,
-- 15 utilisations (12 inscrit·es + marge), à activer avant fin octobre. LECODEPROMO reste inchangé.
INSERT INTO public.promo_codes (
  code, plan_granted, duration_days, max_uses, current_uses, is_active, expires_at
)
VALUES ('BDMMA', 'outil', 30, 15, 0, true, '2026-10-31T23:59:59+01')
ON CONFLICT (code) DO NOTHING;
