-- Lot 2 (audit sécurité) : repasser en PRIVÉ les buckets de captures d'audit.
-- Ils avaient été rendus publics par 20260306082902 (lecture par n'importe qui ayant l'URL).
-- L'accès aux captures se fait désormais via URLs SIGNÉES (createSignedUrl côté front),
-- fetchables par l'IA dans leur TTL — plus besoin de bucket public.
-- Les policies de lecture par propriétaire (dossier = user id) existent déjà et suffisent
-- pour que createSignedUrl fonctionne ("Users can view own screenshots" / "Users can view own audit posts").

UPDATE storage.buckets SET public = false WHERE id IN ('audit-screenshots', 'audit-posts');

DROP POLICY IF EXISTS "Public read access for audit-screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for audit-posts" ON storage.objects;
