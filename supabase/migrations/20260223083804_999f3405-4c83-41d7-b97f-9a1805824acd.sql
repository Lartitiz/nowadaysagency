
CREATE TABLE IF NOT EXISTS public.branding_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  summaries JSONB,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  branding_hash TEXT,
  UNIQUE(user_id)
);

ALTER TABLE public.branding_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own branding summary"
  ON public.branding_summary FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own branding summary"
  ON public.branding_summary FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own branding summary"
  ON public.branding_summary FOR UPDATE
  USING (auth.uid() = user_id);
