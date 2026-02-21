
-- Add new columns to launches
ALTER TABLE public.launches
  ADD COLUMN IF NOT EXISTS launch_model TEXT,
  ADD COLUMN IF NOT EXISTS offer_type TEXT,
  ADD COLUMN IF NOT EXISTS price_range TEXT,
  ADD COLUMN IF NOT EXISTS audience_size TEXT,
  ADD COLUMN IF NOT EXISTS recurrence TEXT,
  ADD COLUMN IF NOT EXISTS checklist_pre JSONB,
  ADD COLUMN IF NOT EXISTS checklist_post JSONB,
  ADD COLUMN IF NOT EXISTS retrospective JSONB;

-- Add new columns to launch_plan_contents
ALTER TABLE public.launch_plan_contents
  ADD COLUMN IF NOT EXISTS chapter INTEGER,
  ADD COLUMN IF NOT EXISTS chapter_label TEXT,
  ADD COLUMN IF NOT EXISTS audience_phase TEXT,
  ADD COLUMN IF NOT EXISTS audience_phase_emoji TEXT,
  ADD COLUMN IF NOT EXISTS story_sequence_detail JSONB,
  ADD COLUMN IF NOT EXISTS ratio_category TEXT;

-- Add new columns to calendar_posts
ALTER TABLE public.calendar_posts
  ADD COLUMN IF NOT EXISTS chapter INTEGER,
  ADD COLUMN IF NOT EXISTS chapter_label TEXT,
  ADD COLUMN IF NOT EXISTS audience_phase TEXT,
  ADD COLUMN IF NOT EXISTS story_sequence_detail JSONB;
