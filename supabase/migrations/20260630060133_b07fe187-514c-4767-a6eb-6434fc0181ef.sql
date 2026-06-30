
-- 1. Backfill workspace_id pour les lignes existantes
UPDATE public.voice_profile vp
SET workspace_id = (
  SELECT wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.user_id = vp.user_id
    AND wm.role = 'owner'
  LIMIT 1
)
WHERE vp.workspace_id IS NULL;

-- 2. Policies RLS "workspace" (en OR avec les policies user_id existantes)
DROP POLICY IF EXISTS "voice_profile_workspace_select" ON public.voice_profile;
CREATE POLICY "voice_profile_workspace_select"
  ON public.voice_profile
  FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "voice_profile_workspace_insert" ON public.voice_profile;
CREATE POLICY "voice_profile_workspace_insert"
  ON public.voice_profile
  FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "voice_profile_workspace_update" ON public.voice_profile;
CREATE POLICY "voice_profile_workspace_update"
  ON public.voice_profile
  FOR UPDATE
  TO authenticated
  USING (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id))
  WITH CHECK (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "voice_profile_workspace_delete" ON public.voice_profile;
CREATE POLICY "voice_profile_workspace_delete"
  ON public.voice_profile
  FOR DELETE
  TO authenticated
  USING (workspace_id IS NOT NULL AND public.user_has_workspace_access(workspace_id));

-- 3. Index unique partiel sur workspace_id
CREATE UNIQUE INDEX IF NOT EXISTS voice_profile_workspace_id_unique
  ON public.voice_profile (workspace_id)
  WHERE workspace_id IS NOT NULL;
