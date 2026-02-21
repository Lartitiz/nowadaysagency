
CREATE TABLE public.instagram_inspirations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_text TEXT,
  source_url TEXT,
  analysis JSONB,
  adapted_content TEXT,
  recommended_format TEXT,
  objective TEXT,
  pillar TEXT,
  saved_to_ideas BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_inspirations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inspirations" ON public.instagram_inspirations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inspirations" ON public.instagram_inspirations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own inspirations" ON public.instagram_inspirations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own inspirations" ON public.instagram_inspirations FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_inspirations_user ON public.instagram_inspirations(user_id, created_at DESC);
