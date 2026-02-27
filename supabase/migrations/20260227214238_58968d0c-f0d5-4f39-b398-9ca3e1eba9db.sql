-- Add workspace-based RLS policies for brand_charter (for manager access)
CREATE POLICY "Workspace members can view charter"
ON public.brand_charter FOR SELECT
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace members can update charter"
ON public.brand_charter FOR UPDATE
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace members can insert charter"
ON public.brand_charter FOR INSERT
WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace members can delete charter"
ON public.brand_charter FOR DELETE
USING (public.user_has_workspace_access(workspace_id));