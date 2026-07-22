CREATE POLICY "Users can delete own onboarding uploads"
ON storage.objects FOR DELETE
USING (bucket_id = 'onboarding-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);