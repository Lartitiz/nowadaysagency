
CREATE TABLE public.branding_autofill (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  website_url TEXT,
  instagram_handle TEXT,
  linkedin_url TEXT,
  document_ids TEXT[],
  analysis_result JSONB,
  sources_used TEXT[],
  sources_failed TEXT[],
  overall_confidence TEXT,
  autofill_pending_review BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branding_autofill ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own autofill" ON public.branding_autofill
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own autofill" ON public.branding_autofill
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own autofill" ON public.branding_autofill
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_branding_autofill_updated_at
  BEFORE UPDATE ON public.branding_autofill
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
