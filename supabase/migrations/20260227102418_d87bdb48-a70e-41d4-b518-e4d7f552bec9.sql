
-- 1. monthly_stats RLS policies with workspace support
DROP POLICY IF EXISTS "Users can view own monthly stats" ON public.monthly_stats;
CREATE POLICY "Users can view own monthly stats" ON public.monthly_stats FOR SELECT USING (
  auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)
);

DROP POLICY IF EXISTS "Users can insert own monthly stats" ON public.monthly_stats;
CREATE POLICY "Users can insert own monthly stats" ON public.monthly_stats FOR INSERT WITH CHECK (
  auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)
);

DROP POLICY IF EXISTS "Users can update own monthly stats" ON public.monthly_stats;
CREATE POLICY "Users can update own monthly stats" ON public.monthly_stats FOR UPDATE USING (
  auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)
);

DROP POLICY IF EXISTS "Users can delete own monthly stats" ON public.monthly_stats;
CREATE POLICY "Users can delete own monthly stats" ON public.monthly_stats FOR DELETE USING (
  auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)
);

-- 2. stats_config RLS policies with workspace support
DROP POLICY IF EXISTS "Users can view own stats config" ON public.stats_config;
CREATE POLICY "Users can view own stats config" ON public.stats_config FOR SELECT USING (
  auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)
);

DROP POLICY IF EXISTS "Users can insert own stats config" ON public.stats_config;
CREATE POLICY "Users can insert own stats config" ON public.stats_config FOR INSERT WITH CHECK (
  auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)
);

DROP POLICY IF EXISTS "Users can update own stats config" ON public.stats_config;
CREATE POLICY "Users can update own stats config" ON public.stats_config FOR UPDATE USING (
  auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)
) WITH CHECK (
  auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)
);

-- 3. Backfill NULL workspace_id
UPDATE public.monthly_stats ms
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE wm.user_id = ms.user_id AND wm.role = 'owner' AND ms.workspace_id IS NULL;

UPDATE public.stats_config sc
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE wm.user_id = sc.user_id AND wm.role = 'owner' AND sc.workspace_id IS NULL;
