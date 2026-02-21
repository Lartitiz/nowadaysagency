
ALTER TABLE public.linkedin_profile
  ADD COLUMN IF NOT EXISTS resume_current TEXT,
  ADD COLUMN IF NOT EXISTS resume_generated TEXT,
  ADD COLUMN IF NOT EXISTS resume_analysis JSONB,
  ADD COLUMN IF NOT EXISTS resume_score INTEGER,
  ADD COLUMN IF NOT EXISTS resume_updated_at TIMESTAMP WITH TIME ZONE;
