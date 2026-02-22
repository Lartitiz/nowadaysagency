
-- LinkedIn comment strategy table
CREATE TABLE IF NOT EXISTS public.linkedin_comment_strategy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  accounts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.linkedin_comment_strategy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own comment strategy" ON public.linkedin_comment_strategy FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own comment strategy" ON public.linkedin_comment_strategy FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comment strategy" ON public.linkedin_comment_strategy FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comment strategy" ON public.linkedin_comment_strategy FOR DELETE USING (auth.uid() = user_id);
