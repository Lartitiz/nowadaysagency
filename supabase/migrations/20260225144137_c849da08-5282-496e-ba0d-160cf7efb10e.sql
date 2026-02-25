-- Add moodboard columns to brand_charter
ALTER TABLE public.brand_charter
ADD COLUMN IF NOT EXISTS moodboard_images jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS moodboard_description text;

-- Create moodboard storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('moodboards', 'moodboards', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for moodboards bucket
CREATE POLICY "Users can upload their own moodboard images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'moodboards' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own moodboard images"
ON storage.objects FOR SELECT
USING (bucket_id = 'moodboards' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own moodboard images"
ON storage.objects FOR DELETE
USING (bucket_id = 'moodboards' AND auth.uid()::text = (storage.foldername(name))[1]);