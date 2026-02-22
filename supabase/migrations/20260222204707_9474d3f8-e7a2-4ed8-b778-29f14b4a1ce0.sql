
-- Create landing-assets bucket for admin uploads (photo, logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-assets', 'landing-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view landing assets (public bucket)
CREATE POLICY "Public can view landing assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing-assets');

-- Only authenticated users can upload landing assets
CREATE POLICY "Authenticated users can upload landing assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'landing-assets');

-- Only authenticated users can update landing assets
CREATE POLICY "Authenticated users can update landing assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'landing-assets');

-- Only authenticated users can delete landing assets
CREATE POLICY "Authenticated users can delete landing assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'landing-assets');
