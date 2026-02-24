-- Supprime l'ancienne policy
DROP POLICY IF EXISTS "Creator can add first member" ON public.workspace_members;

-- Le créateur du workspace peut ajouter les premiers membres
CREATE POLICY "Creator can bootstrap workspace members"
  ON public.workspace_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = workspace_id
      AND created_by = auth.uid()
    )
  );