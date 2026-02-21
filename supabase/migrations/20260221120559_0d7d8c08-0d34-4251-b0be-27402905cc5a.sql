
-- Add time coherence columns to instagram_editorial_line
ALTER TABLE instagram_editorial_line ADD COLUMN IF NOT EXISTS estimated_weekly_minutes INTEGER;
ALTER TABLE instagram_editorial_line ADD COLUMN IF NOT EXISTS time_budget_minutes INTEGER;

-- Add global time availability to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekly_time_available INTEGER DEFAULT 120;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS time_distribution JSONB;
