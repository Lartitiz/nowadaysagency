
-- Table to track routine completions per period (week/month)
CREATE TABLE public.routine_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one completion per task per period
ALTER TABLE public.routine_completions 
  ADD CONSTRAINT unique_task_period UNIQUE (user_id, task_id, period_start);

-- Enable RLS
ALTER TABLE public.routine_completions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own routine completions"
  ON public.routine_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own routine completions"
  ON public.routine_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own routine completions"
  ON public.routine_completions FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_routine_completions_user_period 
  ON public.routine_completions(user_id, period_start);
