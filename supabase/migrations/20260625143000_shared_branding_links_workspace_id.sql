-- shared_branding_links was created before the workspace feature and never got a
-- workspace_id column. But the app (handleShare) inserts workspace_id when the user
-- is acting in a workspace, so PostgREST rejected the INSERT with 400 → impossible
-- to create a branding share link from any workspace context. The shared-branding
-- edge function also reads workspace_id to scope the public view correctly.
-- Add the column (nullable: personal links keep workspace_id NULL) + index, and
-- align the RLS policy with the other workspace-scoped tables.

ALTER TABLE public.shared_branding_links
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_shared_branding_workspace
  ON public.shared_branding_links(workspace_id);

-- Allow workspace members (not just the row's user_id) to manage their workspace's
-- links, matching the convention used across the other workspace-scoped tables.
DROP POLICY IF EXISTS "Users manage own links" ON public.shared_branding_links;
CREATE POLICY "Users manage own links" ON public.shared_branding_links
  FOR ALL
  USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id))
  WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
