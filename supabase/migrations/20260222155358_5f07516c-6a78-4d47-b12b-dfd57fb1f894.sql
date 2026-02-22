
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS differentiation_type text,
  ADD COLUMN IF NOT EXISTS differentiation_text text,
  ADD COLUMN IF NOT EXISTS bio_cta_type text,
  ADD COLUMN IF NOT EXISTS bio_cta_text text;
