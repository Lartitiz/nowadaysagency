
-- Add missing columns to audit_recommendations
ALTER TABLE public.audit_recommendations 
  ADD COLUMN IF NOT EXISTS position INT,
  ADD COLUMN IF NOT EXISTS titre TEXT,
  ADD COLUMN IF NOT EXISTS detail TEXT,
  ADD COLUMN IF NOT EXISTS conseil_contextuel TEXT,
  ADD COLUMN IF NOT EXISTS temps_estime TEXT,
  ADD COLUMN IF NOT EXISTS label_bouton TEXT;
