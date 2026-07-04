
-- launches: workspace-aware policies (owner/manager)
DROP POLICY IF EXISTS "workspace_select_launches" ON public.launches;
DROP POLICY IF EXISTS "workspace_insert_launches" ON public.launches;
DROP POLICY IF EXISTS "workspace_update_launches" ON public.launches;
DROP POLICY IF EXISTS "workspace_delete_launches" ON public.launches;

CREATE POLICY "workspace_select_launches" ON public.launches
FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launches.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
);

CREATE POLICY "workspace_insert_launches" ON public.launches
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launches.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
);

CREATE POLICY "workspace_update_launches" ON public.launches
FOR UPDATE USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launches.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
) WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launches.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
);

CREATE POLICY "workspace_delete_launches" ON public.launches
FOR DELETE USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launches.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
);

-- launch_plan_contents: workspace-aware policies (owner/manager)
DROP POLICY IF EXISTS "workspace_select_launch_plan_contents" ON public.launch_plan_contents;
DROP POLICY IF EXISTS "workspace_insert_launch_plan_contents" ON public.launch_plan_contents;
DROP POLICY IF EXISTS "workspace_update_launch_plan_contents" ON public.launch_plan_contents;
DROP POLICY IF EXISTS "workspace_delete_launch_plan_contents" ON public.launch_plan_contents;

CREATE POLICY "workspace_select_launch_plan_contents" ON public.launch_plan_contents
FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launch_plan_contents.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
);

CREATE POLICY "workspace_insert_launch_plan_contents" ON public.launch_plan_contents
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launch_plan_contents.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
);

CREATE POLICY "workspace_update_launch_plan_contents" ON public.launch_plan_contents
FOR UPDATE USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launch_plan_contents.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
) WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launch_plan_contents.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
);

CREATE POLICY "workspace_delete_launch_plan_contents" ON public.launch_plan_contents
FOR DELETE USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = launch_plan_contents.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','manager')
  )
);
