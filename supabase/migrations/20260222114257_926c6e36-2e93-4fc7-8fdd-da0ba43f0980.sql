
-- Table for saving Reel inspiration screenshots with AI analysis
CREATE TABLE public.reel_inspirations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  analysis JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reel_inspirations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reel inspirations" ON public.reel_inspirations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reel inspirations" ON public.reel_inspirations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reel inspirations" ON public.reel_inspirations FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_reel_inspirations_user ON public.reel_inspirations(user_id);

-- Add content_data JSONB to saved_ideas for storing full generated content (stories/reels)
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS content_data JSONB;
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS source_module TEXT;
ALTER TABLE public.saved_ideas ADD COLUMN IF NOT EXISTS personal_elements JSONB;

-- Storage bucket for inspiration screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('inspiration-screenshots', 'inspiration-screenshots', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload inspiration screenshots" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'inspiration-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Anyone can view inspiration screenshots" ON storage.objects FOR SELECT USING (bucket_id = 'inspiration-screenshots');
CREATE POLICY "Users can delete own inspiration screenshots" ON storage.objects FOR DELETE USING (bucket_id = 'inspiration-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
