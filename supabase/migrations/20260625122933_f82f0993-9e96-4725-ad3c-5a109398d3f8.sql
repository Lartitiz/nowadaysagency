ALTER TABLE public.shared_branding_links
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_shared_branding_workspace
  ON public.shared_branding_links(workspace_id);

DROP POLICY IF EXISTS "Users manage own links" ON public.shared_branding_links;
CREATE POLICY "Users manage own links" ON public.shared_branding_links
  FOR ALL
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id))
  WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));