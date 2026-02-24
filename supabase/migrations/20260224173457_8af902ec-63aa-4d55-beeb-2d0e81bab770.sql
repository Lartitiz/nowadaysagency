
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_id ON public.ai_usage(workspace_id);
