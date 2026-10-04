-- Fin de l'étape 3 du chantier images (#1345) : la conversion a été vérifiée
-- (54 idées + 8 posts du calendrier convertis, 0 conflit, 0 échec, toutes les
-- photos référencées présentes dans calendar-visuals, dates inchangées) et
-- Laetitia a validé le 04/10/2026. On vide la sauvegarde des originaux
-- (~130 Mo). La table reste : l'outil /admin/tools y range les originaux de
-- toute conversion future.
TRUNCATE TABLE public.carousel_media_backfill_backup;
