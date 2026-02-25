
-- Bucket pour les fichiers de crossposting (privé, signed URLs)
INSERT INTO storage.buckets (id, name, public) VALUES ('crosspost-uploads', 'crosspost-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload crosspost files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'crosspost-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own crosspost files" ON storage.objects
  FOR SELECT USING (bucket_id = 'crosspost-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own crosspost files" ON storage.objects
  FOR DELETE USING (bucket_id = 'crosspost-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
