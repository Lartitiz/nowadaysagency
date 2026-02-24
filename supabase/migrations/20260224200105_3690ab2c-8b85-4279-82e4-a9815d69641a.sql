
-- Add workspace_id column and index to all tables
ALTER TABLE public.pinterest_boards ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_pinterest_boards_workspace_id ON public.pinterest_boards(workspace_id);

ALTER TABLE public.pinterest_profile ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_pinterest_profile_workspace_id ON public.pinterest_profile(workspace_id);

ALTER TABLE public.pinterest_keywords ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_pinterest_keywords_workspace_id ON public.pinterest_keywords(workspace_id);

ALTER TABLE public.pinterest_routine ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_pinterest_routine_workspace_id ON public.pinterest_routine(workspace_id);

ALTER TABLE public.pinterest_pins ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_pinterest_pins_workspace_id ON public.pinterest_pins(workspace_id);

ALTER TABLE public.website_about ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_website_about_workspace_id ON public.website_about(workspace_id);

ALTER TABLE public.website_profile ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_website_profile_workspace_id ON public.website_profile(workspace_id);

ALTER TABLE public.website_homepage ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_website_homepage_workspace_id ON public.website_homepage(workspace_id);

ALTER TABLE public.linkedin_profile ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_linkedin_profile_workspace_id ON public.linkedin_profile(workspace_id);

ALTER TABLE public.linkedin_experiences ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_linkedin_experiences_workspace_id ON public.linkedin_experiences(workspace_id);

ALTER TABLE public.linkedin_comment_strategy ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_linkedin_comment_strategy_workspace_id ON public.linkedin_comment_strategy(workspace_id);

ALTER TABLE public.linkedin_recommendations ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_linkedin_recommendations_workspace_id ON public.linkedin_recommendations(workspace_id);

ALTER TABLE public.linkedin_audit ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_linkedin_audit_workspace_id ON public.linkedin_audit(workspace_id);

ALTER TABLE public.instagram_highlights ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_instagram_highlights_workspace_id ON public.instagram_highlights(workspace_id);

ALTER TABLE public.instagram_pinned_posts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_instagram_pinned_posts_workspace_id ON public.instagram_pinned_posts(workspace_id);

ALTER TABLE public.instagram_inspirations ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_instagram_inspirations_workspace_id ON public.instagram_inspirations(workspace_id);

ALTER TABLE public.branding_coaching_sessions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_branding_coaching_sessions_workspace_id ON public.branding_coaching_sessions(workspace_id);

ALTER TABLE public.branding_suggestions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_branding_suggestions_workspace_id ON public.branding_suggestions(workspace_id);

ALTER TABLE public.branding_summary ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_branding_summary_workspace_id ON public.branding_summary(workspace_id);

ALTER TABLE public.dismissed_suggestions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_dismissed_suggestions_workspace_id ON public.dismissed_suggestions(workspace_id);

ALTER TABLE public.voice_profile ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_voice_profile_workspace_id ON public.voice_profile(workspace_id);

ALTER TABLE public.highlight_categories ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_highlight_categories_workspace_id ON public.highlight_categories(workspace_id);

ALTER TABLE public.user_documents ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_user_documents_workspace_id ON public.user_documents(workspace_id);

ALTER TABLE public.reel_inspirations ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_reel_inspirations_workspace_id ON public.reel_inspirations(workspace_id);

ALTER TABLE public.reels_scripts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_reels_scripts_workspace_id ON public.reels_scripts(workspace_id);

ALTER TABLE public.stories_sequences ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_stories_sequences_workspace_id ON public.stories_sequences(workspace_id);

ALTER TABLE public.lives ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_lives_workspace_id ON public.lives(workspace_id);

ALTER TABLE public.live_questions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_live_questions_workspace_id ON public.live_questions(workspace_id);

ALTER TABLE public.live_reminders ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_live_reminders_workspace_id ON public.live_reminders(workspace_id);

ALTER TABLE public.import_mappings ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_import_mappings_workspace_id ON public.import_mappings(workspace_id);

ALTER TABLE public.stats_config ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_stats_config_workspace_id ON public.stats_config(workspace_id);

ALTER TABLE public.user_rhythm ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_user_rhythm_workspace_id ON public.user_rhythm(workspace_id);

-- Backfill workspace_id for tables that have user_id
-- (lives is excluded because it has no user_id column)
DO $$
DECLARE
  r RECORD;
  tbl TEXT;
  tables_with_user_id TEXT[] := ARRAY[
    'pinterest_boards','pinterest_profile','pinterest_keywords','pinterest_routine','pinterest_pins',
    'website_about','website_profile','website_homepage',
    'linkedin_profile','linkedin_experiences','linkedin_comment_strategy','linkedin_recommendations','linkedin_audit',
    'instagram_highlights','instagram_pinned_posts','instagram_inspirations',
    'branding_coaching_sessions','branding_suggestions','branding_summary','dismissed_suggestions',
    'voice_profile','highlight_categories','user_documents',
    'reel_inspirations','reels_scripts','stories_sequences',
    'live_questions','live_reminders',
    'import_mappings','stats_config','user_rhythm'
  ];
BEGIN
  FOR r IN
    SELECT wm.user_id, wm.workspace_id
    FROM public.workspace_members wm
    WHERE wm.role = 'owner'
  LOOP
    FOREACH tbl IN ARRAY tables_with_user_id LOOP
      EXECUTE format(
        'UPDATE public.%I SET workspace_id = %L WHERE user_id = %L AND workspace_id IS NULL',
        tbl, r.workspace_id, r.user_id
      );
    END LOOP;
  END LOOP;
END;
$$;
