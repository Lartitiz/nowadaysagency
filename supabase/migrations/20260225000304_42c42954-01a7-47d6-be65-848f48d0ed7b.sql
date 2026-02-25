ALTER TABLE public.linkedin_profile ADD COLUMN IF NOT EXISTS featured_done BOOLEAN DEFAULT FALSE;
ALTER TABLE public.linkedin_profile ADD COLUMN IF NOT EXISTS creator_mode_done BOOLEAN DEFAULT FALSE;