
CREATE TABLE public.launch_plan_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  launch_id UUID NOT NULL REFERENCES public.launches(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  content_date DATE NOT NULL,
  format TEXT,
  accroche TEXT,
  contenu TEXT,
  objectif TEXT,
  tip TEXT,
  is_edited BOOLEAN DEFAULT FALSE,
  added_to_calendar BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.launch_plan_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own launch plan contents"
ON public.launch_plan_contents FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own launch plan contents"
ON public.launch_plan_contents FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own launch plan contents"
ON public.launch_plan_contents FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own launch plan contents"
ON public.launch_plan_contents FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_launch_plan_contents_user_id ON public.launch_plan_contents(user_id);
CREATE INDEX idx_launch_plan_contents_launch_id ON public.launch_plan_contents(launch_id);
