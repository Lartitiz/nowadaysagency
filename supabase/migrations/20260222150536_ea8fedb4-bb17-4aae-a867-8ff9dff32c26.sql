
-- Fix 1: Make public storage buckets private and update policies
UPDATE storage.buckets SET public = false 
WHERE id IN ('linkedin-audit-screenshots', 'inspiration-screenshots');

DROP POLICY IF EXISTS "Anyone can view linkedin audit screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view inspiration screenshots" ON storage.objects;

CREATE POLICY "Users can view own linkedin audit screenshots" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'linkedin-audit-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own inspiration screenshots" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'inspiration-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]);

-- Fix 2: Add foreign key constraints on user_id columns for all tables
ALTER TABLE public.brand_profile ADD CONSTRAINT brand_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.brand_proposition ADD CONSTRAINT brand_proposition_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.brand_strategy ADD CONSTRAINT brand_strategy_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_posts ADD CONSTRAINT calendar_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.content_drafts ADD CONSTRAINT content_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.content_recycling ADD CONSTRAINT content_recycling_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.content_scores ADD CONSTRAINT content_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_checklist_logs ADD CONSTRAINT engagement_checklist_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_contacts ADD CONSTRAINT engagement_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_exercise ADD CONSTRAINT engagement_exercise_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_metrics ADD CONSTRAINT engagement_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_streaks ADD CONSTRAINT engagement_streaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_weekly ADD CONSTRAINT engagement_weekly_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_weekly_linkedin ADD CONSTRAINT engagement_weekly_linkedin_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.generated_posts ADD CONSTRAINT generated_posts_user_id_fkey2 FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.highlight_categories ADD CONSTRAINT highlight_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.inspiration_accounts ADD CONSTRAINT inspiration_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.inspiration_notes ADD CONSTRAINT inspiration_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.instagram_audit ADD CONSTRAINT instagram_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.instagram_audit_posts ADD CONSTRAINT instagram_audit_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.instagram_editorial_line ADD CONSTRAINT instagram_editorial_line_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.instagram_highlights ADD CONSTRAINT instagram_highlights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.instagram_highlights_questions ADD CONSTRAINT instagram_highlights_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.instagram_inspirations ADD CONSTRAINT instagram_inspirations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.instagram_pinned_posts ADD CONSTRAINT instagram_pinned_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.instagram_weekly_stats ADD CONSTRAINT instagram_weekly_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.launch_plan_contents ADD CONSTRAINT launch_plan_contents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.launches ADD CONSTRAINT launches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.linkedin_audit ADD CONSTRAINT linkedin_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.linkedin_comment_strategy ADD CONSTRAINT linkedin_comment_strategy_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.linkedin_experiences ADD CONSTRAINT linkedin_experiences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.linkedin_profile ADD CONSTRAINT linkedin_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.linkedin_recommendations ADD CONSTRAINT linkedin_recommendations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.persona ADD CONSTRAINT persona_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pinterest_boards ADD CONSTRAINT pinterest_boards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pinterest_keywords ADD CONSTRAINT pinterest_keywords_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pinterest_pins ADD CONSTRAINT pinterest_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pinterest_profile ADD CONSTRAINT pinterest_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pinterest_routine ADD CONSTRAINT pinterest_routine_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.plan_tasks ADD CONSTRAINT plan_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey2 FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reel_inspirations ADD CONSTRAINT reel_inspirations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reels_metrics ADD CONSTRAINT reels_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reels_scripts ADD CONSTRAINT reels_scripts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.routine_completions ADD CONSTRAINT routine_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.saved_ideas ADD CONSTRAINT saved_ideas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stories_metrics ADD CONSTRAINT stories_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stories_sequences ADD CONSTRAINT stories_sequences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.storytelling ADD CONSTRAINT storytelling_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_id_fkey2 FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_rhythm ADD CONSTRAINT user_rhythm_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.voice_profile ADD CONSTRAINT voice_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.website_about ADD CONSTRAINT website_about_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.website_homepage ADD CONSTRAINT website_homepage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.website_profile ADD CONSTRAINT website_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.weekly_batches ADD CONSTRAINT weekly_batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.weekly_missions ADD CONSTRAINT weekly_missions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
