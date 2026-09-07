ALTER TABLE public.brand_charter
  ADD COLUMN IF NOT EXISTS story_assemblage text,
  ADD COLUMN IF NOT EXISTS story_pill_color text,
  ADD COLUMN IF NOT EXISTS story_corners text,
  ADD COLUMN IF NOT EXISTS story_align text;