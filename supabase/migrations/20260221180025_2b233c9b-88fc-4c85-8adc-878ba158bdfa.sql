
CREATE TABLE public.stories_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  objective TEXT,
  price_range TEXT,
  time_available TEXT,
  face_cam TEXT,
  subject TEXT,
  is_launch BOOLEAN DEFAULT FALSE,
  structure_type TEXT,
  total_stories INTEGER,
  sequence_result JSONB,
  published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stories_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own story sequences" ON public.stories_sequences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own story sequences" ON public.stories_sequences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own story sequences" ON public.stories_sequences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own story sequences" ON public.stories_sequences FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_stories_seq_user ON public.stories_sequences(user_id, created_at DESC);
