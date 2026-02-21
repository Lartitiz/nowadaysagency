
-- Add planning columns to launches
ALTER TABLE public.launches
  ADD COLUMN IF NOT EXISTS template_type TEXT,
  ADD COLUMN IF NOT EXISTS extra_weekly_hours INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phases JSONB,
  ADD COLUMN IF NOT EXISTS plan_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS plan_sent_to_calendar BOOLEAN DEFAULT FALSE;

-- Add slot columns to launch_plan_contents
ALTER TABLE public.launch_plan_contents
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS content_type_emoji TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS angle_suggestion TEXT,
  ADD COLUMN IF NOT EXISTS sent_to_calendar BOOLEAN DEFAULT FALSE;

-- Add launch-related columns to calendar_posts
ALTER TABLE public.calendar_posts
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS content_type_emoji TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS angle_suggestion TEXT,
  ADD COLUMN IF NOT EXISTS launch_id UUID REFERENCES public.launches(id);
