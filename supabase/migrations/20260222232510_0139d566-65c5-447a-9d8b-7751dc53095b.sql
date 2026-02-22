
-- Add missing columns to user_plan_config
ALTER TABLE public.user_plan_config 
  ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS welcome_seen BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Add new profile fields for links and frequency
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS main_goal TEXT,
  ADD COLUMN IF NOT EXISTS level TEXT,
  ADD COLUMN IF NOT EXISTS weekly_time TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS posts_per_week INTEGER,
  ADD COLUMN IF NOT EXISTS stories_per_week INTEGER,
  ADD COLUMN IF NOT EXISTS linkedin_posts_per_week INTEGER;
