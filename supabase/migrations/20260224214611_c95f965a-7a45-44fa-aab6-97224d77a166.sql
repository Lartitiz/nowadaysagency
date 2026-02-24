-- Le créateur du workspace peut toujours s'ajouter comme premier membre
CREATE POLICY "Creator can add first member"
  ON public.workspace_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = workspace_id
      AND created_by = auth.uid()
    )
  );