-- Add new columns to website_homepage for framework, plan, guarantee, failure
ALTER TABLE public.website_homepage 
  ADD COLUMN IF NOT EXISTS framework TEXT DEFAULT 'emotional',
  ADD COLUMN IF NOT EXISTS plan_steps JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS guarantee_type TEXT,
  ADD COLUMN IF NOT EXISTS guarantee_text TEXT,
  ADD COLUMN IF NOT EXISTS failure_block TEXT,
  ADD COLUMN IF NOT EXISTS storybrand_data JSONB;