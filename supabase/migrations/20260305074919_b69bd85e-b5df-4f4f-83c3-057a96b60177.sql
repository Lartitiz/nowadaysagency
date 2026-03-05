-- Bucket calendar-visuals (public pour servir les images via CDN)
INSERT INTO storage.buckets (id, name, public) VALUES ('calendar-visuals', 'calendar-visuals', true)
ON CONFLICT (id) DO NOTHING;

-- RLS : les utilisatrices peuvent uploader dans leur dossier
CREATE POLICY "Users can upload calendar visuals"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'calendar-visuals' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS : tout le monde peut voir (bucket public)
CREATE POLICY "Anyone can view calendar visuals"
ON storage.objects FOR SELECT
USING (bucket_id = 'calendar-visuals');

-- RLS : les utilisatrices peuvent supprimer leurs propres fichiers
CREATE POLICY "Users can delete own calendar visuals"
ON storage.objects FOR DELETE
USING (bucket_id = 'calendar-visuals' AND auth.uid()::text = (storage.foldername(name))[1]);