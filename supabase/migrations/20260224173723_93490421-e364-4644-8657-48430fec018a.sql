
-- Batch 2: Add workspace_id to remaining tables

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON public.tasks(workspace_id);

ALTER TABLE public.user_plan_config ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_user_plan_config_workspace_id ON public.user_plan_config(workspace_id);

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace_id ON public.subscriptions(workspace_id);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON public.notifications(workspace_id);

ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_user_badges_workspace_id ON public.user_badges(workspace_id);

ALTER TABLE public.engagement_streaks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_engagement_streaks_workspace_id ON public.engagement_streaks(workspace_id);

ALTER TABLE public.engagement_metrics ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_engagement_metrics_workspace_id ON public.engagement_metrics(workspace_id);

ALTER TABLE public.engagement_weekly ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_engagement_weekly_workspace_id ON public.engagement_weekly(workspace_id);

ALTER TABLE public.engagement_weekly_linkedin ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_engagement_weekly_linkedin_workspace_id ON public.engagement_weekly_linkedin(workspace_id);

ALTER TABLE public.engagement_contacts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_engagement_contacts_workspace_id ON public.engagement_contacts(workspace_id);

ALTER TABLE public.engagement_comments ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_engagement_comments_workspace_id ON public.engagement_comments(workspace_id);

ALTER TABLE public.monthly_stats ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_monthly_stats_workspace_id ON public.monthly_stats(workspace_id);

ALTER TABLE public.instagram_weekly_stats ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_instagram_weekly_stats_workspace_id ON public.instagram_weekly_stats(workspace_id);

ALTER TABLE public.stories_metrics ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_stories_metrics_workspace_id ON public.stories_metrics(workspace_id);

ALTER TABLE public.reels_metrics ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_reels_metrics_workspace_id ON public.reels_metrics(workspace_id);

ALTER TABLE public.content_scores ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_content_scores_workspace_id ON public.content_scores(workspace_id);

ALTER TABLE public.content_recycling ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_content_recycling_workspace_id ON public.content_recycling(workspace_id);

ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_prospects_workspace_id ON public.prospects(workspace_id);

ALTER TABLE public.prospect_interactions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_prospect_interactions_workspace_id ON public.prospect_interactions(workspace_id);

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_id ON public.contacts(workspace_id);

ALTER TABLE public.contact_interactions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_contact_interactions_workspace_id ON public.contact_interactions(workspace_id);

ALTER TABLE public.coaching_programs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_coaching_programs_workspace_id ON public.coaching_programs(workspace_id);

ALTER TABLE public.coaching_sessions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_workspace_id ON public.coaching_sessions(workspace_id);

ALTER TABLE public.coaching_actions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_coaching_actions_workspace_id ON public.coaching_actions(workspace_id);

ALTER TABLE public.coaching_deliverables ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_coaching_deliverables_workspace_id ON public.coaching_deliverables(workspace_id);

ALTER TABLE public.intake_questionnaires ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_intake_questionnaires_workspace_id ON public.intake_questionnaires(workspace_id);

ALTER TABLE public.communication_plans ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_communication_plans_workspace_id ON public.communication_plans(workspace_id);

ALTER TABLE public.plan_tasks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_plan_tasks_workspace_id ON public.plan_tasks(workspace_id);

ALTER TABLE public.launches ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_launches_workspace_id ON public.launches(workspace_id);

ALTER TABLE public.launch_plan_contents ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_launch_plan_contents_workspace_id ON public.launch_plan_contents(workspace_id);

ALTER TABLE public.routine_tasks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_routine_tasks_workspace_id ON public.routine_tasks(workspace_id);

ALTER TABLE public.routine_completions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_routine_completions_workspace_id ON public.routine_completions(workspace_id);

ALTER TABLE public.weekly_missions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_weekly_missions_workspace_id ON public.weekly_missions(workspace_id);

ALTER TABLE public.weekly_batches ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_weekly_batches_workspace_id ON public.weekly_batches(workspace_id);
