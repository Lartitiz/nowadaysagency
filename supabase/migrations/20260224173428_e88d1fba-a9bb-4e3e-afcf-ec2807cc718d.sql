
-- Workspace-aware RLS policies for all main tables
-- These coexist with existing user_id policies (PostgreSQL ORs them)

-- profiles: no workspace_id column, skip workspace policies

-- brand_profile
CREATE POLICY "workspace_select_brand_profile" ON public.brand_profile FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_brand_profile" ON public.brand_profile FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_brand_profile" ON public.brand_profile FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_brand_profile" ON public.brand_profile FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- persona
CREATE POLICY "workspace_select_persona" ON public.persona FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_persona" ON public.persona FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_persona" ON public.persona FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_persona" ON public.persona FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- storytelling
CREATE POLICY "workspace_select_storytelling" ON public.storytelling FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_storytelling" ON public.storytelling FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_storytelling" ON public.storytelling FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_storytelling" ON public.storytelling FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- brand_proposition
CREATE POLICY "workspace_select_brand_proposition" ON public.brand_proposition FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_brand_proposition" ON public.brand_proposition FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_brand_proposition" ON public.brand_proposition FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_brand_proposition" ON public.brand_proposition FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- brand_strategy
CREATE POLICY "workspace_select_brand_strategy" ON public.brand_strategy FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_brand_strategy" ON public.brand_strategy FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_brand_strategy" ON public.brand_strategy FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_brand_strategy" ON public.brand_strategy FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- offers
CREATE POLICY "workspace_select_offers" ON public.offers FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_offers" ON public.offers FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_offers" ON public.offers FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_offers" ON public.offers FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- calendar_posts
CREATE POLICY "workspace_select_calendar_posts" ON public.calendar_posts FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_calendar_posts" ON public.calendar_posts FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_calendar_posts" ON public.calendar_posts FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_calendar_posts" ON public.calendar_posts FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- saved_ideas
CREATE POLICY "workspace_select_saved_ideas" ON public.saved_ideas FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_saved_ideas" ON public.saved_ideas FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_saved_ideas" ON public.saved_ideas FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_saved_ideas" ON public.saved_ideas FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- generated_posts
CREATE POLICY "workspace_select_generated_posts" ON public.generated_posts FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_generated_posts" ON public.generated_posts FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_generated_posts" ON public.generated_posts FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_generated_posts" ON public.generated_posts FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- generated_carousels
CREATE POLICY "workspace_select_generated_carousels" ON public.generated_carousels FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_generated_carousels" ON public.generated_carousels FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_generated_carousels" ON public.generated_carousels FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_generated_carousels" ON public.generated_carousels FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- content_drafts
CREATE POLICY "workspace_select_content_drafts" ON public.content_drafts FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_content_drafts" ON public.content_drafts FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_content_drafts" ON public.content_drafts FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_content_drafts" ON public.content_drafts FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- branding_audits
CREATE POLICY "workspace_select_branding_audits" ON public.branding_audits FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_branding_audits" ON public.branding_audits FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_branding_audits" ON public.branding_audits FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_branding_audits" ON public.branding_audits FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- instagram_audit
CREATE POLICY "workspace_select_instagram_audit" ON public.instagram_audit FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_instagram_audit" ON public.instagram_audit FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_instagram_audit" ON public.instagram_audit FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_instagram_audit" ON public.instagram_audit FOR DELETE USING (public.user_has_workspace_access(workspace_id));

-- instagram_editorial_line
CREATE POLICY "workspace_select_instagram_editorial_line" ON public.instagram_editorial_line FOR SELECT USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_insert_instagram_editorial_line" ON public.instagram_editorial_line FOR INSERT WITH CHECK (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_update_instagram_editorial_line" ON public.instagram_editorial_line FOR UPDATE USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "workspace_delete_instagram_editorial_line" ON public.instagram_editorial_line FOR DELETE USING (public.user_has_workspace_access(workspace_id));
