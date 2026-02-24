-- Permettre au créateur ou aux managers/owners de supprimer un workspace
CREATE POLICY "Creator and managers can delete workspaces"
  ON public.workspaces
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.user_workspace_role(id) IN ('owner', 'manager')
  );