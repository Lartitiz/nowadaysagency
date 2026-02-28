
-- Table for cached weekly content suggestions
CREATE TABLE public.suggested_contents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  contents JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  week_start DATE NOT NULL
);

ALTER TABLE public.suggested_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own suggested contents"
  ON public.suggested_contents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own suggested contents"
  ON public.suggested_contents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own suggested contents"
  ON public.suggested_contents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own suggested contents"
  ON public.suggested_contents FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_suggested_contents_user_week ON public.suggested_contents (user_id, week_start);
