
-- Create website_audit table
CREATE TABLE public.website_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  workspace_id UUID REFERENCES public.workspaces(id),
  audit_mode TEXT,
  current_page TEXT,
  answers JSONB DEFAULT '{}',
  scores JSONB DEFAULT '{}',
  score_global INTEGER DEFAULT 0,
  diagnostic TEXT,
  recommendations JSONB DEFAULT '[]',
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.website_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own website audits"
  ON public.website_audit FOR SELECT
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

CREATE POLICY "Users can insert own website audits"
  ON public.website_audit FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own website audits"
  ON public.website_audit FOR UPDATE
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- Trigger for updated_at
CREATE TRIGGER update_website_audit_updated_at
  BEFORE UPDATE ON public.website_audit
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
