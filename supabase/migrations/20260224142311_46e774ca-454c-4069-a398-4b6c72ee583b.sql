ALTER TABLE public.branding_coaching_sessions 
ADD COLUMN IF NOT EXISTS covered_topics JSONB DEFAULT '[]'::jsonb;