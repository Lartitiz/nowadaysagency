-- Code d'accès des clientes « Ta Binôme de Com' » (15/10/2026) : le mode Binôme
-- est masqué dans l'app, les clientes passent en Premium (plan « outil ») pendant
-- les 6 mois de l'accompagnement (186 jours), 20 utilisations, sans date limite.
-- LECODEPROMO et BDMMA restent inchangés.
INSERT INTO public.promo_codes (
  code, plan_granted, duration_days, max_uses, current_uses, is_active, expires_at
)
VALUES ('BINOME6MOIS', 'outil', 186, 20, 0, true, NULL)
ON CONFLICT (code) DO NOTHING;
