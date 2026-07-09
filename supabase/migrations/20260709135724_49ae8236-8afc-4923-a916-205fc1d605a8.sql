ALTER TABLE public.brand_charter
  ADD COLUMN IF NOT EXISTS texture_url text,
  ADD COLUMN IF NOT EXISTS texture_material text,
  ADD COLUMN IF NOT EXISTS texture_enabled boolean NOT NULL DEFAULT false;