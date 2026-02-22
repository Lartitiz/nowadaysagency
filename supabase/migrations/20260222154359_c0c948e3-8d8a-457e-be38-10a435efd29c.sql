
-- Add bio generator fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS validated_bio TEXT,
  ADD COLUMN IF NOT EXISTS validated_bio_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bio_generator_answers JSONB;

-- Create audit_validations table
CREATE TABLE IF NOT EXISTS public.audit_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  section TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  validated_at TIMESTAMPTZ,
  validated_content JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, section)
);

ALTER TABLE public.audit_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own validations"
  ON public.audit_validations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own validations"
  ON public.audit_validations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own validations"
  ON public.audit_validations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own validations"
  ON public.audit_validations FOR DELETE
  USING (auth.uid() = user_id);
