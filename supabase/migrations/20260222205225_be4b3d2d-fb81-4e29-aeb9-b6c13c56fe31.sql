
-- Communication plans table
CREATE TABLE IF NOT EXISTS public.communication_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  daily_time INT DEFAULT 30,
  active_days JSONB DEFAULT '["lun","mar","mer","jeu","ven"]'::jsonb,
  channels JSONB DEFAULT '["instagram"]'::jsonb,
  instagram_posts_week INT DEFAULT 3,
  instagram_stories_week INT DEFAULT 3,
  instagram_reels_month INT DEFAULT 2,
  linkedin_posts_week INT DEFAULT 1,
  newsletter_frequency TEXT DEFAULT 'none',
  monthly_goal TEXT DEFAULT 'visibility',
  monthly_goal_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.communication_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_plans" ON public.communication_plans FOR ALL USING (auth.uid() = user_id);

-- Routine tasks table (new smart system)
CREATE TABLE IF NOT EXISTS public.routine_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'custom',
  channel TEXT,
  duration_minutes INT DEFAULT 15,
  recurrence TEXT DEFAULT 'weekly',
  day_of_week TEXT,
  week_of_month INT,
  linked_module TEXT,
  linked_context JSONB,
  is_auto_generated BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.routine_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_routine_tasks" ON public.routine_tasks FOR ALL USING (auth.uid() = user_id);

-- Add week and month columns to routine_completions for the new system
ALTER TABLE public.routine_completions 
  ADD COLUMN IF NOT EXISTS routine_task_id UUID REFERENCES public.routine_tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS week TEXT,
  ADD COLUMN IF NOT EXISTS month TEXT;

-- Trigger for updated_at on communication_plans
CREATE TRIGGER update_communication_plans_updated_at
  BEFORE UPDATE ON public.communication_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
