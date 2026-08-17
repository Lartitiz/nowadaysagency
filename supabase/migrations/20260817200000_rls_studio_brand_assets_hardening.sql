-- Restes mineurs de l'audit RLS du 17/08/2026 (audit « succès menteurs », section RLS).

-- 1. studio_coachings / studio_deliverables : ces tables ne sont plus écrites par
-- aucun code applicatif (seul delete-account les nettoie, en service role).
-- Les policies UPDATE permettaient à un·e utilisateur·ice de modifier des champs
-- gérés par la coach (status, validated_at, scheduled_at…) via l'API directe.
-- On les retire ; la lecture (SELECT) reste inchangée.
DROP POLICY IF EXISTS "Users can update their own coachings" ON public.studio_coachings;
DROP POLICY IF EXISTS "Users can update their own deliverables" ON public.studio_deliverables;

-- 2. Bucket brand-assets : la policy SELECT ouverte à tous permettait de LISTER
-- tout le bucket via l'API storage (dossiers = IDs utilisateurs), y compris en anonyme.
-- Le bucket reste public : les téléchargements via URL publique (seul mode utilisé
-- par l'app, getPublicUrl) ne passent pas par cette policy et continuent de fonctionner.
-- On restreint le list/download authentifié au dossier du propriétaire, comme
-- les policies INSERT/UPDATE/DELETE existantes.
DROP POLICY IF EXISTS "Anyone can view brand assets" ON storage.objects;
CREATE POLICY "Users can view own brand assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
