-- Keep every existing row/ID/workspace untouched, including legacy NULLs.
-- New generations append versions; latest-per-workspace readers are indexed.
DROP INDEX public.idx_branding_mirror_user_workspace;
CREATE INDEX branding_mirror_workspace_latest ON public.branding_mirror_results(workspace_id, created_at DESC, id DESC);
CREATE INDEX voice_guides_workspace_latest ON public.voice_guides(workspace_id, updated_at DESC NULLS LAST, id DESC);

DROP POLICY "Users manage own voice guides" ON public.voice_guides;
DROP POLICY "Users can view own mirror results" ON public.branding_mirror_results;
DROP POLICY "Users can insert own mirror results" ON public.branding_mirror_results;
DROP POLICY "Users can update own mirror results" ON public.branding_mirror_results;
DROP POLICY "Users can delete own mirror results" ON public.branding_mirror_results;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['voice_guides', 'branding_mirror_results'] LOOP
    EXECUTE format('CREATE POLICY generated_branding_read ON public.%I FOR SELECT TO authenticated USING (
      (workspace_id IS NULL AND user_id = auth.uid()) OR public.user_has_workspace_access(workspace_id)
    )', t);
    EXECUTE format('CREATE POLICY generated_branding_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (
      (workspace_id IS NULL AND user_id = auth.uid()) OR (
        EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = %I.workspace_id
          AND m.user_id = auth.uid() AND m.role IN (''owner'', ''manager'', ''editor''))
        AND EXISTS (SELECT 1 FROM public.workspace_members o WHERE o.workspace_id = %I.workspace_id
          AND o.user_id = %I.user_id AND o.role = ''owner'')
      )
    )', t, t, t, t);
    -- Preserve existing author edits/deletions, but do not let authors access a
    -- workspace after their membership ends. Generation itself never updates.
    EXECUTE format('CREATE POLICY generated_branding_update ON public.%I FOR UPDATE TO authenticated USING (
      user_id = auth.uid() AND (workspace_id IS NULL OR public.user_has_workspace_access(workspace_id))
    ) WITH CHECK (
      user_id = auth.uid() AND (workspace_id IS NULL OR public.user_has_workspace_access(workspace_id))
    )', t);
    EXECUTE format('CREATE POLICY generated_branding_delete ON public.%I FOR DELETE TO authenticated USING (
      user_id = auth.uid() AND (workspace_id IS NULL OR public.user_has_workspace_access(workspace_id))
    )', t);
  END LOOP;
END $$;
