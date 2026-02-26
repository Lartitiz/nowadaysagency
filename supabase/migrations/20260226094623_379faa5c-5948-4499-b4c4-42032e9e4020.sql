
ALTER TABLE public.calendar_posts ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT NULL;

INSERT INTO storage.buckets (id, name, public) VALUES ('calendar-media', 'calendar-media', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload calendar media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'calendar-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view calendar media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'calendar-media');

CREATE POLICY "Users can delete own calendar media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'calendar-media' AND auth.uid()::text = (storage.foldername(name))[1]);
