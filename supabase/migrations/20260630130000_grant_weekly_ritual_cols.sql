-- Le durcissement sécurité 20260630104325 a retiré l'UPDATE global sur public.profiles
-- et re-accordé l'UPDATE colonne par colonne (hors colonnes de facturation), à partir
-- des colonnes existant À CE MOMENT-LÀ. Les colonnes weekly_ritual_enabled / weekly_ritual_day
-- ont été ajoutées ENSUITE (20260630120000) → absentes du grant → "permission denied for
-- table profiles" (42501) au moment d'enregistrer le rendez-vous hebdo dans les Réglages.
--
-- Ce sont des préférences utilisateur non sensibles (pas de facturation) : on accorde
-- explicitement leur UPDATE à authenticated, en cohérence avec le modèle de sécurité.
-- Idempotent (GRANT répétable).
GRANT UPDATE (weekly_ritual_enabled, weekly_ritual_day) ON public.profiles TO authenticated;
