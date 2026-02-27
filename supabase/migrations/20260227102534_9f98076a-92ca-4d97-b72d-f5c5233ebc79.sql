
-- =============================================
-- Fix RLS policies for workspace support
-- Pattern: auth.uid() = user_id OR user_has_workspace_access(workspace_id)
-- =============================================

-- ── content_scores ──
DROP POLICY IF EXISTS "Users can view own scores" ON public.content_scores;
CREATE POLICY "Users can view own scores" ON public.content_scores FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own scores" ON public.content_scores;
CREATE POLICY "Users can insert own scores" ON public.content_scores FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own scores" ON public.content_scores;
CREATE POLICY "Users can delete own scores" ON public.content_scores FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── content_recycling ──
DROP POLICY IF EXISTS "Users can view own recycling" ON public.content_recycling;
CREATE POLICY "Users can view own recycling" ON public.content_recycling FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own recycling" ON public.content_recycling;
CREATE POLICY "Users can insert own recycling" ON public.content_recycling FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own recycling" ON public.content_recycling;
CREATE POLICY "Users can delete own recycling" ON public.content_recycling FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── engagement_checklist_logs ──
DROP POLICY IF EXISTS "Users can view own checklist logs" ON public.engagement_checklist_logs;
CREATE POLICY "Users can view own checklist logs" ON public.engagement_checklist_logs FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own checklist logs" ON public.engagement_checklist_logs;
CREATE POLICY "Users can insert own checklist logs" ON public.engagement_checklist_logs FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own checklist logs" ON public.engagement_checklist_logs;
CREATE POLICY "Users can update own checklist logs" ON public.engagement_checklist_logs FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own checklist logs" ON public.engagement_checklist_logs;
CREATE POLICY "Users can delete own checklist logs" ON public.engagement_checklist_logs FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── engagement_comments ──
DROP POLICY IF EXISTS "Users can view own comments" ON public.engagement_comments;
CREATE POLICY "Users can view own comments" ON public.engagement_comments FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own comments" ON public.engagement_comments;
CREATE POLICY "Users can insert own comments" ON public.engagement_comments FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own comments" ON public.engagement_comments;
CREATE POLICY "Users can update own comments" ON public.engagement_comments FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own comments" ON public.engagement_comments;
CREATE POLICY "Users can delete own comments" ON public.engagement_comments FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── engagement_contacts ──
DROP POLICY IF EXISTS "Users can view own contacts" ON public.engagement_contacts;
CREATE POLICY "Users can view own contacts" ON public.engagement_contacts FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own contacts" ON public.engagement_contacts;
CREATE POLICY "Users can insert own contacts" ON public.engagement_contacts FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own contacts" ON public.engagement_contacts;
CREATE POLICY "Users can update own contacts" ON public.engagement_contacts FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own contacts" ON public.engagement_contacts;
CREATE POLICY "Users can delete own contacts" ON public.engagement_contacts FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── engagement_metrics ──
DROP POLICY IF EXISTS "Users can view own metrics" ON public.engagement_metrics;
CREATE POLICY "Users can view own metrics" ON public.engagement_metrics FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own metrics" ON public.engagement_metrics;
CREATE POLICY "Users can insert own metrics" ON public.engagement_metrics FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own metrics" ON public.engagement_metrics;
CREATE POLICY "Users can update own metrics" ON public.engagement_metrics FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own metrics" ON public.engagement_metrics;
CREATE POLICY "Users can delete own metrics" ON public.engagement_metrics FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── engagement_streaks ──
DROP POLICY IF EXISTS "Users can view own streak" ON public.engagement_streaks;
CREATE POLICY "Users can view own streak" ON public.engagement_streaks FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own streak" ON public.engagement_streaks;
CREATE POLICY "Users can insert own streak" ON public.engagement_streaks FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own streak" ON public.engagement_streaks;
CREATE POLICY "Users can update own streak" ON public.engagement_streaks FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── engagement_weekly ──
DROP POLICY IF EXISTS "Users can view own weekly" ON public.engagement_weekly;
CREATE POLICY "Users can view own weekly" ON public.engagement_weekly FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own weekly" ON public.engagement_weekly;
CREATE POLICY "Users can insert own weekly" ON public.engagement_weekly FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own weekly" ON public.engagement_weekly;
CREATE POLICY "Users can update own weekly" ON public.engagement_weekly FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)) WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own weekly" ON public.engagement_weekly;
CREATE POLICY "Users can delete own weekly" ON public.engagement_weekly FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── engagement_weekly_linkedin ──
DROP POLICY IF EXISTS "Users can view own linkedin weekly" ON public.engagement_weekly_linkedin;
CREATE POLICY "Users can view own linkedin weekly" ON public.engagement_weekly_linkedin FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own linkedin weekly" ON public.engagement_weekly_linkedin;
CREATE POLICY "Users can insert own linkedin weekly" ON public.engagement_weekly_linkedin FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own linkedin weekly" ON public.engagement_weekly_linkedin;
CREATE POLICY "Users can update own linkedin weekly" ON public.engagement_weekly_linkedin FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id)) WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own linkedin weekly" ON public.engagement_weekly_linkedin;
CREATE POLICY "Users can delete own linkedin weekly" ON public.engagement_weekly_linkedin FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── instagram_weekly_stats ──
DROP POLICY IF EXISTS "Users can view own weekly stats" ON public.instagram_weekly_stats;
CREATE POLICY "Users can view own weekly stats" ON public.instagram_weekly_stats FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own weekly stats" ON public.instagram_weekly_stats;
CREATE POLICY "Users can insert own weekly stats" ON public.instagram_weekly_stats FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own weekly stats" ON public.instagram_weekly_stats;
CREATE POLICY "Users can update own weekly stats" ON public.instagram_weekly_stats FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own weekly stats" ON public.instagram_weekly_stats;
CREATE POLICY "Users can delete own weekly stats" ON public.instagram_weekly_stats FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── prospects ──
DROP POLICY IF EXISTS "Users can view own prospects" ON public.prospects;
CREATE POLICY "Users can view own prospects" ON public.prospects FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own prospects" ON public.prospects;
CREATE POLICY "Users can insert own prospects" ON public.prospects FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own prospects" ON public.prospects;
CREATE POLICY "Users can update own prospects" ON public.prospects FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own prospects" ON public.prospects;
CREATE POLICY "Users can delete own prospects" ON public.prospects FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- ── prospect_interactions ──
DROP POLICY IF EXISTS "Users can view own interactions" ON public.prospect_interactions;
CREATE POLICY "Users can view own interactions" ON public.prospect_interactions FOR SELECT USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can insert own interactions" ON public.prospect_interactions;
CREATE POLICY "Users can insert own interactions" ON public.prospect_interactions FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can update own interactions" ON public.prospect_interactions;
CREATE POLICY "Users can update own interactions" ON public.prospect_interactions FOR UPDATE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));
DROP POLICY IF EXISTS "Users can delete own interactions" ON public.prospect_interactions;
CREATE POLICY "Users can delete own interactions" ON public.prospect_interactions FOR DELETE USING (auth.uid() = user_id OR public.user_has_workspace_access(workspace_id));

-- =============================================
-- Backfill NULL workspace_id on all 12 tables
-- =============================================
UPDATE public.content_scores SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = content_scores.user_id AND wm.role = 'owner' AND content_scores.workspace_id IS NULL;
UPDATE public.content_recycling SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = content_recycling.user_id AND wm.role = 'owner' AND content_recycling.workspace_id IS NULL;
UPDATE public.engagement_checklist_logs SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = engagement_checklist_logs.user_id AND wm.role = 'owner' AND engagement_checklist_logs.workspace_id IS NULL;
UPDATE public.engagement_comments SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = engagement_comments.user_id AND wm.role = 'owner' AND engagement_comments.workspace_id IS NULL;
UPDATE public.engagement_contacts SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = engagement_contacts.user_id AND wm.role = 'owner' AND engagement_contacts.workspace_id IS NULL;
UPDATE public.engagement_metrics SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = engagement_metrics.user_id AND wm.role = 'owner' AND engagement_metrics.workspace_id IS NULL;
UPDATE public.engagement_streaks SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = engagement_streaks.user_id AND wm.role = 'owner' AND engagement_streaks.workspace_id IS NULL;
UPDATE public.engagement_weekly SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = engagement_weekly.user_id AND wm.role = 'owner' AND engagement_weekly.workspace_id IS NULL;
UPDATE public.engagement_weekly_linkedin SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = engagement_weekly_linkedin.user_id AND wm.role = 'owner' AND engagement_weekly_linkedin.workspace_id IS NULL;
UPDATE public.instagram_weekly_stats SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = instagram_weekly_stats.user_id AND wm.role = 'owner' AND instagram_weekly_stats.workspace_id IS NULL;
UPDATE public.prospects SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = prospects.user_id AND wm.role = 'owner' AND prospects.workspace_id IS NULL;
UPDATE public.prospect_interactions SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = prospect_interactions.user_id AND wm.role = 'owner' AND prospect_interactions.workspace_id IS NULL;
