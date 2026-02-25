
-- Create website_inspirations table
CREATE TABLE public.website_inspirations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  section_type TEXT NOT NULL,
  html_code TEXT NOT NULL DEFAULT '',
  variant INTEGER NOT NULL DEFAULT 1,
  custom_colors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.website_inspirations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own inspirations"
  ON public.website_inspirations FOR SELECT
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

CREATE POLICY "Users can create their own inspirations"
  ON public.website_inspirations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own inspirations"
  ON public.website_inspirations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own inspirations"
  ON public.website_inspirations FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_website_inspirations_user ON public.website_inspirations(user_id);
CREATE INDEX idx_website_inspirations_workspace ON public.website_inspirations(workspace_id);
