
DO $$
DECLARE
  t TEXT;
  cnt INTEGER;
  tables_to_fix TEXT[] := ARRAY[
    'profiles', 'brand_profile', 'persona', 'storytelling', 'brand_proposition',
    'brand_strategy', 'offers', 'calendar_posts', 'saved_ideas', 'generated_posts',
    'generated_carousels', 'content_drafts', 'branding_audits', 'instagram_audit',
    'instagram_editorial_line', 'instagram_weekly_stats', 'monthly_stats',
    'stories_metrics', 'reels_metrics', 'content_scores', 'content_recycling',
    'ai_usage', 'tasks', 'routine_tasks', 'routine_completions', 'weekly_missions',
    'weekly_batches', 'notifications', 'user_badges', 'user_plan_config',
    'subscriptions', 'engagement_checklist_logs', 'engagement_streaks',
    'engagement_contacts', 'engagement_comments', 'engagement_metrics',
    'engagement_weekly', 'engagement_weekly_linkedin', 'prospects',
    'prospect_interactions', 'contacts', 'contact_interactions',
    'coaching_programs', 'coaching_sessions', 'coaching_actions',
    'coaching_deliverables', 'intake_questionnaires', 'communication_plans',
    'plan_tasks', 'launches', 'launch_plan_contents',
    'pinterest_boards', 'pinterest_profile', 'pinterest_keywords',
    'pinterest_routine', 'pinterest_pins',
    'website_about', 'website_profile', 'website_homepage',
    'linkedin_profile', 'linkedin_experiences', 'linkedin_comment_strategy',
    'linkedin_recommendations', 'linkedin_audit',
    'instagram_highlights', 'instagram_pinned_posts', 'instagram_inspirations',
    'branding_coaching_sessions', 'branding_suggestions', 'branding_summary',
    'dismissed_suggestions', 'voice_profile', 'highlight_categories',
    'user_documents', 'reel_inspirations', 'reels_scripts',
    'stories_sequences', 'lives', 'live_questions', 'live_reminders'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_fix LOOP
    BEGIN
      EXECUTE format(
        'UPDATE public.%I t SET workspace_id = wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = t.user_id AND wm.role = ''owner'' AND t.workspace_id IS NULL',
        t
      );
      GET DIAGNOSTICS cnt = ROW_COUNT;
      IF cnt > 0 THEN
        RAISE NOTICE 'Backfilled % rows in %', cnt, t;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped % (error: %)', t, SQLERRM;
    END;
  END LOOP;
END $$;
