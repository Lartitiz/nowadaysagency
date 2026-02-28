-- Fix deliverables storage policies: path is program_id/deliverable_id/filename

-- Drop broken client read policy
DROP POLICY IF EXISTS "client_reads_own_deliverables_files" ON storage.objects;

-- Recreate: client can read files from their own program
CREATE POLICY "client_reads_own_deliverables_files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'deliverables'
    AND EXISTS (
      SELECT 1 FROM public.coaching_programs
      WHERE id::text = (storage.foldername(name))[1]
      AND client_user_id = auth.uid()
    )
  );

-- Drop and recreate coach policy to also use program_id check (more secure)
DROP POLICY IF EXISTS "coach_manages_deliverable_files" ON storage.objects;

CREATE POLICY "coach_manages_deliverable_files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'deliverables'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND email = 'laetitia@nowadaysagency.com'
    )
  );
