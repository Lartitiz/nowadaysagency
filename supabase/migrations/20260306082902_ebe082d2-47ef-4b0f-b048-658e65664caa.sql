-- Make audit-screenshots and audit-posts buckets public
UPDATE storage.buckets SET public = true WHERE id IN ('audit-screenshots', 'audit-posts');

-- Allow public read access to audit-screenshots
CREATE POLICY "Public read access for audit-screenshots"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'audit-screenshots');

-- Allow public read access to audit-posts
CREATE POLICY "Public read access for audit-posts"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'audit-posts');