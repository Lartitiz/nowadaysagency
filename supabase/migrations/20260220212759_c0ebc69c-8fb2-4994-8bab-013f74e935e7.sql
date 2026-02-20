
-- Create brand_niche table
CREATE TABLE public.brand_niche (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  step_1a_cause TEXT,
  step_1b_combats TEXT,
  step_1c_alternative TEXT,
  step_2_refusals TEXT,
  market TEXT,
  niche_specific TEXT,
  need TEXT,
  ideal_public TEXT,
  version_descriptive TEXT,
  version_pitch TEXT,
  version_manifeste TEXT,
  version_final TEXT,
  ai_combats JSONB,
  ai_limits JSONB,
  current_step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brand_niche ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own niche" ON public.brand_niche FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own niche" ON public.brand_niche FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own niche" ON public.brand_niche FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own niche" ON public.brand_niche FOR DELETE USING (auth.uid() = user_id);
