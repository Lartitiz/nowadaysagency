
-- Add format, content_draft, and accroche columns to calendar_posts
ALTER TABLE public.calendar_posts
  ADD COLUMN IF NOT EXISTS format TEXT,
  ADD COLUMN IF NOT EXISTS content_draft TEXT,
  ADD COLUMN IF NOT EXISTS accroche TEXT;
