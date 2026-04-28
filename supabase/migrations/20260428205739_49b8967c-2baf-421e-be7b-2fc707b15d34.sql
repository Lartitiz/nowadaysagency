DROP POLICY IF EXISTS "Users can read accessible workspace photos" ON storage.objects;

CREATE POLICY "Users can read accessible workspace photos"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'user-photos'
  AND EXISTS (
    SELECT 1
    FROM public.user_photos up
    WHERE (
      up.storage_path = objects.name
      OR up.original_storage_path = objects.name
    )
    AND public.user_has_workspace_access(up.workspace_id)
  )
);

DROP POLICY IF EXISTS "Users can view own photo files" ON storage.objects;

CREATE POLICY "Users can view own photo files"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'user-photos'
  AND (storage.foldername(objects.name))[1] = auth.uid()::text
);