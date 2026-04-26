-- Renforce la policy INSERT : exiger que user_id = auth.uid() en plus de l'accès workspace
DROP POLICY IF EXISTS workspace_insert_user_photos ON public.user_photos;

CREATE POLICY workspace_insert_user_photos ON public.user_photos
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.user_has_workspace_access(workspace_id)
  );

-- UPDATE : conserver l'accès workspace (membres peuvent passer status pending->processing->ready)
-- pas de changement nécessaire ici, la policy actuelle reste correcte