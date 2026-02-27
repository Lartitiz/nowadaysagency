
-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Users manage own shares" ON public.calendar_shares;

-- Owner can manage their own shares
CREATE POLICY "Owner manages own shares"
ON public.calendar_shares FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Workspace members can manage shares in their workspace
CREATE POLICY "Workspace members manage shares"
ON public.calendar_shares FOR ALL
USING (
  workspace_id IS NOT NULL 
  AND public.user_has_workspace_access(workspace_id)
)
WITH CHECK (
  workspace_id IS NOT NULL 
  AND public.user_has_workspace_access(workspace_id)
);
