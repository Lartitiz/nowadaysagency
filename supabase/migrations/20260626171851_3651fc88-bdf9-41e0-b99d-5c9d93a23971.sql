
-- content_briefs
DROP POLICY IF EXISTS "Users can manage their own briefs" ON public.content_briefs;
CREATE POLICY "Users can manage their own briefs" ON public.content_briefs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- engagement_exercise
DROP POLICY IF EXISTS "Users can delete own exercise" ON public.engagement_exercise;
DROP POLICY IF EXISTS "Users can insert own exercise" ON public.engagement_exercise;
DROP POLICY IF EXISTS "Users can update own exercise" ON public.engagement_exercise;
DROP POLICY IF EXISTS "Users can view own exercise" ON public.engagement_exercise;
CREATE POLICY "Users can view own exercise" ON public.engagement_exercise
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can insert own exercise" ON public.engagement_exercise
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can update own exercise" ON public.engagement_exercise
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id))
  WITH CHECK ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own exercise" ON public.engagement_exercise
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));

-- instagram_audit_posts
DROP POLICY IF EXISTS "Users can delete own audit posts" ON public.instagram_audit_posts;
DROP POLICY IF EXISTS "Users can insert own audit posts" ON public.instagram_audit_posts;
DROP POLICY IF EXISTS "Users can view own audit posts" ON public.instagram_audit_posts;
CREATE POLICY "Users can view own audit posts" ON public.instagram_audit_posts
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can insert own audit posts" ON public.instagram_audit_posts
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own audit posts" ON public.instagram_audit_posts
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));

-- instagram_highlights
DROP POLICY IF EXISTS "Users can delete own highlights" ON public.instagram_highlights;
DROP POLICY IF EXISTS "Users can insert own highlights" ON public.instagram_highlights;
DROP POLICY IF EXISTS "Users can update own highlights" ON public.instagram_highlights;
DROP POLICY IF EXISTS "Users can view own highlights" ON public.instagram_highlights;
CREATE POLICY "Users can view own highlights" ON public.instagram_highlights
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can insert own highlights" ON public.instagram_highlights
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can update own highlights" ON public.instagram_highlights
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id))
  WITH CHECK ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own highlights" ON public.instagram_highlights
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));

-- instagram_pinned_posts
DROP POLICY IF EXISTS "Users can delete own pinned posts" ON public.instagram_pinned_posts;
DROP POLICY IF EXISTS "Users can insert own pinned posts" ON public.instagram_pinned_posts;
DROP POLICY IF EXISTS "Users can update own pinned posts" ON public.instagram_pinned_posts;
DROP POLICY IF EXISTS "Users can view own pinned posts" ON public.instagram_pinned_posts;
CREATE POLICY "Users can view own pinned posts" ON public.instagram_pinned_posts
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can insert own pinned posts" ON public.instagram_pinned_posts
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can update own pinned posts" ON public.instagram_pinned_posts
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id))
  WITH CHECK ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));
CREATE POLICY "Users can delete own pinned posts" ON public.instagram_pinned_posts
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));

-- shared_branding_links
DROP POLICY IF EXISTS "Users manage own links" ON public.shared_branding_links;
CREATE POLICY "Users manage own links" ON public.shared_branding_links
  FOR ALL TO authenticated
  USING ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id))
  WITH CHECK ((auth.uid() = user_id) OR public.user_has_workspace_access(workspace_id));

-- mini_audit_attempts : admin-only SELECT (writes & reads par les fonctions edge via service-role restent inchangés)
DROP POLICY IF EXISTS "Admins can view audit attempts" ON public.mini_audit_attempts;
CREATE POLICY "Admins can view audit attempts" ON public.mini_audit_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- social_connections : propriétaire uniquement (INSERT/UPDATE OAuth via service-role)
DROP POLICY IF EXISTS "Users can view own social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Users can update own social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Users can delete own social connections" ON public.social_connections;
CREATE POLICY "Users can view own social connections" ON public.social_connections
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update own social connections" ON public.social_connections
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own social connections" ON public.social_connections
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
