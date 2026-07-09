-- Portrait pro : cache des ambiances de fond générées depuis le branding.
-- Écrit par l'edge photo-describe (mode portrait_ambiances), best-effort.
-- Forme : { "signature": "<champs branding utilisés>", "items": [{title, description, prompt}] }
ALTER TABLE public.brand_charter
  ADD COLUMN IF NOT EXISTS portrait_ambiances jsonb;
