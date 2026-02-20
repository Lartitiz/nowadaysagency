
-- Add "Ma marque" variables to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mission text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS offre text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS croyances_limitantes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verbatims text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expressions_cles text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ce_quon_evite text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS style_communication text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS canaux text[] NOT NULL DEFAULT '{instagram}';
