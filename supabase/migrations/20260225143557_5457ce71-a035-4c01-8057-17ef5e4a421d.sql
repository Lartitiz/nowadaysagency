
CREATE TABLE public.branding_mirror_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  coherence_score INTEGER,
  summary TEXT,
  alignments JSONB,
  gaps JSONB,
  quick_wins JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branding_mirror_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mirror results"
  ON public.branding_mirror_results FOR SELECT
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

CREATE POLICY "Users can insert own mirror results"
  ON public.branding_mirror_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mirror results"
  ON public.branding_mirror_results FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own mirror results"
  ON public.branding_mirror_results FOR DELETE
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_branding_mirror_user_workspace ON public.branding_mirror_results (user_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'));
