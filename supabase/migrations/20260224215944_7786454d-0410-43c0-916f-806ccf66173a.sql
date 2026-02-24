-- Le créateur peut toujours voir ses workspaces (même sans être encore membre)
CREATE POLICY "Creator can view own workspaces"
  ON public.workspaces FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());