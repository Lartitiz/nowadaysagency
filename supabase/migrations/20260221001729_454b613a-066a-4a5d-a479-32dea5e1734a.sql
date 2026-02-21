
ALTER TABLE public.persona ADD COLUMN IF NOT EXISTS portrait JSONB;
ALTER TABLE public.persona ADD COLUMN IF NOT EXISTS portrait_prenom TEXT;
