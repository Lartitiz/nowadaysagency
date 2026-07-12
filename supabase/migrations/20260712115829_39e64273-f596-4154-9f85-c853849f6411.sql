ALTER TABLE public.brand_profile
  ADD COLUMN IF NOT EXISTS conviction_pairs text,
  ADD COLUMN IF NOT EXISTS conviction_shift text,
  ADD COLUMN IF NOT EXISTS conviction_verbatims text,
  ADD COLUMN IF NOT EXISTS conviction_unspoken text;