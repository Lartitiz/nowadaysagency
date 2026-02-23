
-- Table for branding coaching sessions
CREATE TABLE IF NOT EXISTS public.branding_coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  section TEXT NOT NULL,
  messages JSONB DEFAULT '[]',
  extracted_data JSONB DEFAULT '{}',
  question_count INT DEFAULT 0,
  is_complete BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, section)
);

ALTER TABLE public.branding_coaching_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own coaching sessions"
  ON public.branding_coaching_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own coaching sessions"
  ON public.branding_coaching_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own coaching sessions"
  ON public.branding_coaching_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own coaching sessions"
  ON public.branding_coaching_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Add new columns to brand_profile
ALTER TABLE public.brand_profile
  ADD COLUMN IF NOT EXISTS story_origin TEXT,
  ADD COLUMN IF NOT EXISTS story_turning_point TEXT,
  ADD COLUMN IF NOT EXISTS story_struggles TEXT,
  ADD COLUMN IF NOT EXISTS story_unique TEXT,
  ADD COLUMN IF NOT EXISTS story_vision TEXT,
  ADD COLUMN IF NOT EXISTS story_full TEXT,
  ADD COLUMN IF NOT EXISTS value_prop_problem TEXT,
  ADD COLUMN IF NOT EXISTS value_prop_solution TEXT,
  ADD COLUMN IF NOT EXISTS value_prop_difference TEXT,
  ADD COLUMN IF NOT EXISTS value_prop_proof TEXT,
  ADD COLUMN IF NOT EXISTS value_prop_sentence TEXT,
  ADD COLUMN IF NOT EXISTS tone_description TEXT,
  ADD COLUMN IF NOT EXISTS tone_do TEXT,
  ADD COLUMN IF NOT EXISTS tone_dont TEXT,
  ADD COLUMN IF NOT EXISTS combats TEXT,
  ADD COLUMN IF NOT EXISTS visual_style TEXT,
  ADD COLUMN IF NOT EXISTS content_pillars JSONB,
  ADD COLUMN IF NOT EXISTS content_twist TEXT,
  ADD COLUMN IF NOT EXISTS content_formats JSONB,
  ADD COLUMN IF NOT EXISTS content_frequency TEXT,
  ADD COLUMN IF NOT EXISTS content_editorial_line TEXT;

-- Add new columns to persona
ALTER TABLE public.persona
  ADD COLUMN IF NOT EXISTS demographics JSONB,
  ADD COLUMN IF NOT EXISTS frustrations_detail JSONB,
  ADD COLUMN IF NOT EXISTS desires JSONB,
  ADD COLUMN IF NOT EXISTS objections JSONB,
  ADD COLUMN IF NOT EXISTS buying_triggers JSONB,
  ADD COLUMN IF NOT EXISTS persona_channels JSONB,
  ADD COLUMN IF NOT EXISTS daily_life TEXT;

-- Add new columns to offers
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS target TEXT,
  ADD COLUMN IF NOT EXISTS includes JSONB,
  ADD COLUMN IF NOT EXISTS objection_handler TEXT;
