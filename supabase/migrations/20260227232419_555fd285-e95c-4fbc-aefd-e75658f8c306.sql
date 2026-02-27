
CREATE TABLE IF NOT EXISTS public.diagnostic_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  summary TEXT,
  strengths JSONB,
  weaknesses JSONB,
  scores JSONB,
  priorities JSONB,
  branding_prefill JSONB,
  sources_used TEXT[],
  sources_failed TEXT[],
  raw_analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.diagnostic_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own diagnostics"
  ON public.diagnostic_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role insert diagnostics"
  ON public.diagnostic_results FOR INSERT
  WITH CHECK (true);
