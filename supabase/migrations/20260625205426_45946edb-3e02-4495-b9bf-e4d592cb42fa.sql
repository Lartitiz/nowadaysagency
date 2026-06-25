-- instagram_highlights
DROP POLICY IF EXISTS "Users can view own highlights" ON public.instagram_highlights;
CREATE POLICY "Users can view own highlights" ON public.instagram_highlights FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own highlights" ON public.instagram_highlights;
CREATE POLICY "Users can insert own highlights" ON public.instagram_highlights FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own highlights" ON public.instagram_highlights;
CREATE POLICY "Users can update own highlights" ON public.instagram_highlights FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)) WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own highlights" ON public.instagram_highlights;
CREATE POLICY "Users can delete own highlights" ON public.instagram_highlights FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- instagram_pinned_posts
DROP POLICY IF EXISTS "Users can view own pinned posts" ON public.instagram_pinned_posts;
CREATE POLICY "Users can view own pinned posts" ON public.instagram_pinned_posts FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own pinned posts" ON public.instagram_pinned_posts;
CREATE POLICY "Users can insert own pinned posts" ON public.instagram_pinned_posts FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own pinned posts" ON public.instagram_pinned_posts;
CREATE POLICY "Users can update own pinned posts" ON public.instagram_pinned_posts FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)) WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own pinned posts" ON public.instagram_pinned_posts;
CREATE POLICY "Users can delete own pinned posts" ON public.instagram_pinned_posts FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- engagement_exercise
ALTER TABLE public.engagement_exercise ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_engagement_exercise_workspace_id ON public.engagement_exercise(workspace_id);
DROP POLICY IF EXISTS "Users can view own exercise" ON public.engagement_exercise;
CREATE POLICY "Users can view own exercise" ON public.engagement_exercise FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own exercise" ON public.engagement_exercise;
CREATE POLICY "Users can insert own exercise" ON public.engagement_exercise FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own exercise" ON public.engagement_exercise;
CREATE POLICY "Users can update own exercise" ON public.engagement_exercise FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)) WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own exercise" ON public.engagement_exercise;
CREATE POLICY "Users can delete own exercise" ON public.engagement_exercise FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- instagram_audit_posts
ALTER TABLE public.instagram_audit_posts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
UPDATE public.instagram_audit_posts ap SET workspace_id = ia.workspace_id FROM public.instagram_audit ia WHERE ia.id = ap.audit_id AND ap.workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_audit_posts_workspace_id ON public.instagram_audit_posts(workspace_id);
DROP POLICY IF EXISTS "Users can view own audit posts" ON public.instagram_audit_posts;
CREATE POLICY "Users can view own audit posts" ON public.instagram_audit_posts FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own audit posts" ON public.instagram_audit_posts;
CREATE POLICY "Users can insert own audit posts" ON public.instagram_audit_posts FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own audit posts" ON public.instagram_audit_posts;
CREATE POLICY "Users can delete own audit posts" ON public.instagram_audit_posts FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));