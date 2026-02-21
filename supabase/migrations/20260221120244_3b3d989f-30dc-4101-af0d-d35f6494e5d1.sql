
-- Add new columns to instagram_editorial_line
ALTER TABLE public.instagram_editorial_line
  ADD COLUMN IF NOT EXISTS objective_details TEXT,
  ADD COLUMN IF NOT EXISTS posts_frequency TEXT,
  ADD COLUMN IF NOT EXISTS stories_frequency TEXT,
  ADD COLUMN IF NOT EXISTS time_available TEXT,
  ADD COLUMN IF NOT EXISTS pillars JSONB,
  ADD COLUMN IF NOT EXISTS free_notes TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
