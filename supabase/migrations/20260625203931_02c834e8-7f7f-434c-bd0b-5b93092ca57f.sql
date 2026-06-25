-- 1. coaching_actions / coaching_deliverables : retirer le bypass global "coach"

DROP POLICY IF EXISTS "coach_all_actions" ON public.coaching_actions;

CREATE POLICY "coach_all_actions" ON public.coaching_actions

  FOR ALL TO authenticated USING (

    program_id IN (SELECT id FROM public.coaching_programs WHERE coach_user_id = auth.uid())

    OR public.has_role(auth.uid(), 'admin')

  );

DROP POLICY IF EXISTS "coach_all_deliverables" ON public.coaching_deliverables;

CREATE POLICY "coach_all_deliverables" ON public.coaching_deliverables

  FOR ALL TO authenticated USING (

    program_id IN (SELECT id FROM public.coaching_programs WHERE coach_user_id = auth.uid())

    OR public.has_role(auth.uid(), 'admin')

  );

-- 2. user_photos : restaurer le bon argument (workspace_id)

DROP POLICY IF EXISTS workspace_select_user_photos ON public.user_photos;

DROP POLICY IF EXISTS workspace_update_user_photos ON public.user_photos;

DROP POLICY IF EXISTS workspace_delete_user_photos ON public.user_photos;

CREATE POLICY workspace_select_user_photos ON public.user_photos

  FOR SELECT USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_update_user_photos ON public.user_photos

  FOR UPDATE USING (public.user_has_workspace_access(workspace_id))

  WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY workspace_delete_user_photos ON public.user_photos

  FOR DELETE USING (public.user_has_workspace_access(workspace_id));