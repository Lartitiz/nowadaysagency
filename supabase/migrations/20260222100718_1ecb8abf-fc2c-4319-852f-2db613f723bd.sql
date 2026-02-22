
-- Content recycling
CREATE TABLE IF NOT EXISTS public.content_recycling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_text TEXT,
  formats_requested JSONB,
  results JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.content_recycling ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recycling" ON public.content_recycling FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recycling" ON public.content_recycling FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own recycling" ON public.content_recycling FOR DELETE USING (auth.uid() = user_id);

-- Weekly batches
CREATE TABLE IF NOT EXISTS public.weekly_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE,
  subjects_proposed JSONB,
  subjects_selected JSONB,
  contents_generated JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own batches" ON public.weekly_batches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own batches" ON public.weekly_batches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own batches" ON public.weekly_batches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own batches" ON public.weekly_batches FOR DELETE USING (auth.uid() = user_id);

-- Content scores
CREATE TABLE IF NOT EXISTS public.content_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content_type TEXT,
  content_text TEXT,
  scores JSONB,
  global_score INTEGER,
  improvements JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.content_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scores" ON public.content_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scores" ON public.content_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own scores" ON public.content_scores FOR DELETE USING (auth.uid() = user_id);
