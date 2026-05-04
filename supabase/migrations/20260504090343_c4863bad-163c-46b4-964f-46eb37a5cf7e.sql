ALTER TABLE public.brand_profile
  ADD COLUMN IF NOT EXISTS brand_universe jsonb,
  ADD COLUMN IF NOT EXISTS brand_universe_updated_at timestamp with time zone;