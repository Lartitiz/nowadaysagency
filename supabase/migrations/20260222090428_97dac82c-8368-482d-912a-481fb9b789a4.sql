
-- Voice profile table for "Apprends ma voix" feature
CREATE TABLE public.voice_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sample_texts JSONB DEFAULT '[]'::jsonb,
  structure_patterns JSONB DEFAULT '[]'::jsonb,
  tone_patterns JSONB DEFAULT '[]'::jsonb,
  signature_expressions JSONB DEFAULT '[]'::jsonb,
  banned_expressions JSONB DEFAULT '[]'::jsonb,
  voice_summary TEXT,
  formatting_habits JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Only one voice profile per user
CREATE UNIQUE INDEX idx_voice_profile_user ON public.voice_profile(user_id);

-- Enable RLS
ALTER TABLE public.voice_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voice profile"
  ON public.voice_profile FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own voice profile"
  ON public.voice_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voice profile"
  ON public.voice_profile FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own voice profile"
  ON public.voice_profile FOR DELETE
  USING (auth.uid() = user_id);
