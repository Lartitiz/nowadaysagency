-- Portée sponsorisée du mois (saisie manuelle depuis le Gestionnaire de pub :
-- l'API Instagram Business ne sépare pas organique/payé). Permet d'afficher la
-- portée ORGANIQUE estimée (reach − reach_paid) et de contextualiser les pics.
ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS reach_paid integer;
