-- Rythme de publication : nb de posts Instagram publiés dans le mois calendaire
-- (rempli par « Remplir depuis Instagram », le backfill d'historique et le
-- snapshot mensuel ; saisissable à la main aussi). Sert à comparer le rythme
-- au reach / aux visites de profil.
ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS posts_count integer;
