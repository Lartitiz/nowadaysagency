
-- Drop the old ai_usage table and recreate with per-action logging
DROP TABLE IF EXISTS public.ai_usage;

CREATE TABLE public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  category TEXT NOT NULL,
  tokens_used INT,
  model_used TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_user_month ON public.ai_usage(user_id, created_at);
CREATE INDEX idx_ai_usage_user_category ON public.ai_usage(user_id, category, created_at);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON public.ai_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage" ON public.ai_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);
