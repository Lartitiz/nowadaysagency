
-- Create user_plan_config table for storing plan preferences
CREATE TABLE public.user_plan_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  weekly_time TEXT NOT NULL DEFAULT 'less_2h',
  channels JSONB NOT NULL DEFAULT '["instagram"]'::jsonb,
  main_goal TEXT NOT NULL DEFAULT 'start',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_plan_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own plan config"
  ON public.user_plan_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own plan config"
  ON public.user_plan_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plan config"
  ON public.user_plan_config FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_plan_config_updated_at
  BEFORE UPDATE ON public.user_plan_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
