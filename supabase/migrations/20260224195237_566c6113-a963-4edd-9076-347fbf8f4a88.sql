ALTER TABLE public.engagement_checklist_logs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.engagement_streaks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_engagement_checklist_logs_workspace_id ON public.engagement_checklist_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_engagement_streaks_workspace_id ON public.engagement_streaks(workspace_id);