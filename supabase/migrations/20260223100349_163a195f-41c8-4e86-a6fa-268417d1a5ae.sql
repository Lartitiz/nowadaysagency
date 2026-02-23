
CREATE TABLE IF NOT EXISTS public.audit_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  audit_id UUID REFERENCES public.branding_audits(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  route TEXT NOT NULL,
  label TEXT NOT NULL,
  conseil TEXT,
  priorite TEXT DEFAULT 'moyenne',
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.audit_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit recommendations"
ON public.audit_recommendations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own audit recommendations"
ON public.audit_recommendations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert audit recommendations"
ON public.audit_recommendations FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can delete their own audit recommendations"
ON public.audit_recommendations FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_audit_recommendations_user ON public.audit_recommendations(user_id);
CREATE INDEX idx_audit_recommendations_audit ON public.audit_recommendations(audit_id);
