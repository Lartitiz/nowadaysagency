
-- Create plan_tasks table
CREATE TABLE public.plan_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 12),
  task_index INTEGER NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_number, task_index)
);

ALTER TABLE public.plan_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plan tasks" ON public.plan_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plan tasks" ON public.plan_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plan tasks" ON public.plan_tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plan tasks" ON public.plan_tasks FOR DELETE USING (auth.uid() = user_id);

-- Add plan_start_date to profiles
ALTER TABLE public.profiles ADD COLUMN plan_start_date DATE;
