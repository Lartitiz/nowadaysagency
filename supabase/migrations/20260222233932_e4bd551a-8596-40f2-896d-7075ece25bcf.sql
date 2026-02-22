
CREATE TABLE IF NOT EXISTS public.branding_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sources_used JSONB,
  site_url TEXT,
  instagram_username TEXT,
  linkedin_url TEXT,
  score_global INT,
  synthese TEXT,
  points_forts JSONB,
  points_faibles JSONB,
  audit_detail JSONB,
  plan_action JSONB,
  extraction_branding JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.branding_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own branding audits"
  ON public.branding_audits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own branding audits"
  ON public.branding_audits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own branding audits"
  ON public.branding_audits FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_branding_audits_user ON public.branding_audits(user_id);
