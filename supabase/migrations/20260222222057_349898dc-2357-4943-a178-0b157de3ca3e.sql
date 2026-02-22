
-- Weekly tasks table for "Ma semaine" feature
CREATE TABLE IF NOT EXISTS public.weekly_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_minutes INT DEFAULT 10,
  link_to TEXT,
  link_label TEXT,
  related_contacts JSONB,
  related_prospect_ids JSONB,
  related_calendar_post_id UUID,
  suggested_format TEXT,
  suggested_objective TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  is_custom BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_weekly_tasks_user_week ON public.weekly_tasks(user_id, week_start);

ALTER TABLE public.weekly_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own weekly tasks"
  ON public.weekly_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
