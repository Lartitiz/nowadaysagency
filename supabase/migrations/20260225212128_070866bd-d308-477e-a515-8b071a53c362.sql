
CREATE TABLE public.plan_step_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, step_id)
);

ALTER TABLE public.plan_step_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own overrides"
  ON public.plan_step_overrides FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own overrides"
  ON public.plan_step_overrides FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own overrides"
  ON public.plan_step_overrides FOR DELETE
  USING (auth.uid() = user_id);
