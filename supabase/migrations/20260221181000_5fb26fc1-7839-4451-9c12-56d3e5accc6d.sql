CREATE TABLE IF NOT EXISTS public.stories_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  sequences_published INTEGER DEFAULT 0,
  completion_rate NUMERIC,
  dm_replies INTEGER DEFAULT 0,
  best_story TEXT,
  stickers_used JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.stories_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stories metrics" ON public.stories_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own stories metrics" ON public.stories_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stories metrics" ON public.stories_metrics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own stories metrics" ON public.stories_metrics FOR DELETE USING (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_stories_metrics_user_week ON public.stories_metrics(user_id, week_start);
