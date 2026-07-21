CREATE POLICY "Users can update own brand assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own calendar visuals"
ON storage.objects FOR UPDATE
USING (bucket_id = 'calendar-visuals' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'calendar-visuals' AND auth.uid()::text = (storage.foldername(name))[1]);